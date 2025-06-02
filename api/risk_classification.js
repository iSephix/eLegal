const fetch = require('node-fetch');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

// Helper function for consistent error responses
const sendError = (res, statusCode, error, details = '') => {
    res.status(statusCode).json({ error, details });
};

// Helper function to make OpenAI API calls
async function callOpenAI(url, options, apiKey) {
    const defaultOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'OpenAI-Beta': 'assistants=v1'
        }
    };
    const finalOptions = { ...defaultOptions, ...options, headers: {...defaultOptions.headers, ...options.headers} };

    const response = await fetch(url, finalOptions);
    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = { message: `Failed to parse error from OpenAI. Status: ${response.status}, StatusText: ${response.statusText}` };
        }
        console.error(`OpenAI API Error (${url}): ${response.status}`, errorData);
        // Try to extract a more specific message from OpenAI's typical error structure
        const specificMessage = errorData.error?.message || errorData.message || `OpenAI API request failed with status ${response.status}`;
        throw new Error(specificMessage); // This will be caught by the main handler
    }
    return response.json();
}

// Function to create a new thread
async function createThread(apiKey) {
    return callOpenAI('https://api.openai.com/v1/threads', {}, apiKey);
}

// Function to add a message to a thread
async function addMessageToThread(threadId, content, apiKey) {
    return callOpenAI(`https://api.openai.com/v1/threads/${threadId}/messages`, {
        body: JSON.stringify({
            role: 'user',
            content: content
        })
    }, apiKey);
}

// Function to create a run
async function createRun(threadId, assistantId, instructions, apiKey) {
    return callOpenAI(`https://api.openai.com/v1/threads/${threadId}/runs`, {
        body: JSON.stringify({
            assistant_id: assistantId,
            instructions: instructions
        })
    }, apiKey);
}

// Function to poll for run completion
async function pollForRunCompletion(threadId, runId, apiKey) {
    const maxAttempts = 60; 
    let attempts = 0;
    let run;

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        try {
            run = await callOpenAI(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, { method: 'GET' }, apiKey);
        } catch (error) {
            // If polling itself fails due to a transient network issue, we might want to retry or handle.
            // For now, let the error propagate if it's from callOpenAI (e.g. OpenAI server error during polling).
            console.error(`Polling attempt ${attempts + 1} failed for run ${runId}: ${error.message}`);
            if (attempts + 1 >= maxAttempts) { // If it's the last attempt and it fails
                 throw new Error(`Failed to get run status for ${runId} after ${maxAttempts} attempts. Last error: ${error.message}`);
            }
            // Potentially add a specific retry for network errors here if desired, otherwise it uses up an attempt.
        }
        
        if (run) { // ensure run object was successfully fetched
            console.log(`Run status: ${run.status}, attempt: ${attempts + 1}`);
            if (['completed', 'failed', 'cancelled', 'expired', 'requires_action'].includes(run.status)) {
                break;
            }
        }
        attempts++;
    }

    if (!run) {
        throw new Error(`Failed to retrieve run status for ${runId} after ${maxAttempts} attempts. Run object is null.`);
    }
    if (!['completed'].includes(run.status)) {
        console.error('Run did not complete successfully:', run);
        throw new Error(`Run did not complete successfully. Status: ${run.status}, Details: ${JSON.stringify(run.last_error || run.incomplete_details || {})}`);
    }
    return run;
}

// Function to retrieve messages from a thread
async function getThreadMessages(threadId, apiKey) {
    return callOpenAI(`https://api.openai.com/v1/threads/${threadId}/messages?order=desc`, { method: 'GET' }, apiKey);
}

// Function to parse the assistant's response
// ... (parseAssistantResponse remains unchanged for now, but could be reviewed if assistant output changes)
// ... existing parseAssistantResponse function ...
function parseAssistantResponse(responseText) {
    const response = {
        riskLevel: "Not determined",
        reasoning: "No specific reasoning provided.",
        maxFine: "Not determined",
        maxFineRevenue: "",
        measures: "No specific measures provided."
    };

    if (!responseText) return response;

    // Normalize text for easier parsing
    const normalizedText = responseText.toLowerCase();

    // Parsing logic - this is highly dependent on the assistant's output format
    // We'll use keywords and simple splits. More robust parsing might need regex or structured output from the assistant.

    const riskLevelMatch = normalizedText.match(/risk level:\s*(.*?)(?:\n|reasoning:)/);
    if (riskLevelMatch && riskLevelMatch[1]) response.riskLevel = riskLevelMatch[1].trim().replace(/^\w/, c => c.toUpperCase());

    const reasoningMatch = normalizedText.match(/reasoning:\s*(.*?)(?:\n|potential fine:|maximum potential fine:)/);
    if (reasoningMatch && reasoningMatch[1]) response.reasoning = reasoningMatch[1].trim().replace(/^\w/, c => c.toUpperCase());
    
    const fineMatch = normalizedText.match(/(?:potential fine:|maximum potential fine:)\s*(.*?)(?:\n|measures:|compliance measures:)/);
    if (fineMatch && fineMatch[1]) {
        const fineText = fineMatch[1].trim();
        const orSplit = fineText.split(/\s+or\s+/i);
        response.maxFine = orSplit[0].replace(/^\w/, c => c.toUpperCase());
        if (orSplit.length > 1) {
            response.maxFineRevenue = `or ${orSplit.slice(1).join(' or ')}`.replace(/^\w/, c => c.toUpperCase());
        }
    }
    
    const measuresMatch = normalizedText.match(/(?:measures:|compliance measures:)\s*(.*)/);
    if (measuresMatch && measuresMatch[1]) {
         // Assuming measures are listed, potentially separated by newlines or list markers
        response.measures = measuresMatch[1].trim().replace(/^\w/, c => c.toUpperCase());
    }
    
    // Fallback if specific keywords are not found but the text might contain some info
    if (response.riskLevel === "Not determined" && normalizedText.includes("high-risk")) response.riskLevel = "High-Risk";
    else if (response.riskLevel === "Not determined" && normalizedText.includes("unacceptable risk")) response.riskLevel = "Unacceptable Risk";
    else if (response.riskLevel === "Not determined" && normalizedText.includes("limited risk")) response.riskLevel = "Limited Risk";
    else if (response.riskLevel === "Not determined" && normalizedText.includes("minimal risk")) response.riskLevel = "Minimal Risk";

    return response;
}


module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return sendError(res, 405, 'Method Not Allowed', 'Only POST requests are accepted.');
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const assistantId = process.env.OPENAI_ASSISTANT_ID;

    if (!apiKey) {
        console.error('OPENAI_API_KEY is not set.');
        return sendError(res, 500, 'Server Configuration Error', 'OpenAI API Key is missing.');
    }
    if (!assistantId) {
        console.error('OPENAI_ASSISTANT_ID is not set.');
        return sendError(res, 500, 'Server Configuration Error', 'OpenAI Assistant ID is missing.');
    }

    const { company, industry, revenue, useOfAi } = req.body;

    if (!company || !industry || !revenue || !useOfAi) {
        return sendError(res, 400, 'Missing Required Parameters', 'Please provide company, industry, revenue, and useOfAi.');
    }

    const promptContent = `
        Company Name: ${company}
        Industry: ${industry}
        Annual Revenue: ${revenue}
        Description of AI Use Case: ${useOfAi}

        Based on the EU AI Act, please provide the following:
        1. Risk Level: (Unacceptable Risk, High-Risk, Limited Risk, or Minimal Risk)
        2. Reasoning: (Explain why this risk level is assigned based on the AI Act)
        3. Maximum Potential Fine: (State the fine amount/range and the percentage of global annual turnover, e.g., "up to X million EUR or Y% of global annual turnover, whichever is higher")
        4. Compliance Measures: (List key compliance measures/obligations relevant to the identified risk level)

        Please structure your response clearly using these headings. For example:
        Risk Level: [Your Answer]
        Reasoning: [Your Answer]
        Maximum Potential Fine: [Your Answer]
        Compliance Measures: [Your Answer as a list or paragraph]
    `;

    try {
        console.log("Creating thread...");
        const thread = await createThread(apiKey);
        const threadId = thread.id;
        console.log(`Thread created: ${threadId}`);

        console.log("Adding message to thread...");
        await addMessageToThread(threadId, promptContent, apiKey);
        console.log("Message added.");

        console.log("Creating run...");
        const run = await createRun(threadId, assistantId, "Please analyze the provided company details for EU AI Act compliance.", apiKey);
        const runId = run.id;
        console.log(`Run created: ${runId}`);

        console.log("Polling for run completion...");
        await pollForRunCompletion(threadId, runId, apiKey);
        console.log("Run completed.");

        console.log("Retrieving messages...");
        const messagesData = await getThreadMessages(threadId, apiKey);
        
        let assistantMessageContent = "No response from assistant.";
        if (messagesData.data && messagesData.data.length > 0) {
            const assistantMessages = messagesData.data.filter(msg => msg.role === 'assistant');
            if (assistantMessages.length > 0 && assistantMessages[0].content && assistantMessages[0].content.length > 0 && assistantMessages[0].content[0].type === 'text') {
                assistantMessageContent = assistantMessages[0].content[0].text.value;
            }
        }
        console.log("Assistant raw response:", assistantMessageContent);

        const parsedResponse = parseAssistantResponse(assistantMessageContent);
        console.log("Parsed response:", parsedResponse);

        res.status(200).json(parsedResponse);

    } catch (error) {
        console.error('Error in risk classification process:', error.message, error.stack);
        // Distinguish OpenAI API errors from other errors
        if (error.message.toLowerCase().includes("openai") || error.message.includes("api request failed")) {
            // Potentially extract status code if available and meaningful, otherwise use 503 for service unavailable
            return sendError(res, 503, 'OpenAI Service Error', error.message);
        }
        if (error.message.includes("Run did not complete successfully")) {
            return sendError(res, 504, 'AI Processing Timeout/Error', error.message);
        }
        return sendError(res, 500, 'Internal Server Error', error.message);
    }
};
            break;
        }
        attempts++;
    }

    if (!run || !['completed'].includes(run.status)) {
        console.error('Run did not complete successfully:', run);
        throw new Error(`Run did not complete successfully. Status: ${run?.status || 'unknown'}`);
    }
    return run;
}

// Function to retrieve messages from a thread
async function getThreadMessages(threadId) {
    return callOpenAI(`https://api.openai.com/v1/threads/${threadId}/messages?order=desc`, { method: 'GET' });
}

// Function to parse the assistant's response
function parseAssistantResponse(responseText) {
    const response = {
        riskLevel: "Not determined",
        reasoning: "No specific reasoning provided.",
        maxFine: "Not determined",
        maxFineRevenue: "",
        measures: "No specific measures provided."
    };

    if (!responseText) return response;

    // Normalize text for easier parsing
    const normalizedText = responseText.toLowerCase();

    // Parsing logic - this is highly dependent on the assistant's output format
    // We'll use keywords and simple splits. More robust parsing might need regex or structured output from the assistant.

    const riskLevelMatch = normalizedText.match(/risk level:\s*(.*?)(?:\n|reasoning:)/);
    if (riskLevelMatch && riskLevelMatch[1]) response.riskLevel = riskLevelMatch[1].trim().replace(/^\w/, c => c.toUpperCase());

    const reasoningMatch = normalizedText.match(/reasoning:\s*(.*?)(?:\n|potential fine:|maximum potential fine:)/);
    if (reasoningMatch && reasoningMatch[1]) response.reasoning = reasoningMatch[1].trim().replace(/^\w/, c => c.toUpperCase());
    
    const fineMatch = normalizedText.match(/(?:potential fine:|maximum potential fine:)\s*(.*?)(?:\n|measures:|compliance measures:)/);
    if (fineMatch && fineMatch[1]) {
        const fineText = fineMatch[1].trim();
        const orSplit = fineText.split(/\s+or\s+/i);
        response.maxFine = orSplit[0].replace(/^\w/, c => c.toUpperCase());
        if (orSplit.length > 1) {
            response.maxFineRevenue = `or ${orSplit.slice(1).join(' or ')}`.replace(/^\w/, c => c.toUpperCase());
        }
    }
    
    const measuresMatch = normalizedText.match(/(?:measures:|compliance measures:)\s*(.*)/);
    if (measuresMatch && measuresMatch[1]) {
         // Assuming measures are listed, potentially separated by newlines or list markers
        response.measures = measuresMatch[1].trim().replace(/^\w/, c => c.toUpperCase());
    }
    
    // Fallback if specific keywords are not found but the text might contain some info
    if (response.riskLevel === "Not determined" && normalizedText.includes("high-risk")) response.riskLevel = "High-Risk";
    else if (response.riskLevel === "Not determined" && normalizedText.includes("unacceptable risk")) response.riskLevel = "Unacceptable Risk";
    else if (response.riskLevel === "Not determined" && normalizedText.includes("limited risk")) response.riskLevel = "Limited Risk";
    else if (response.riskLevel === "Not determined" && normalizedText.includes("minimal risk")) response.riskLevel = "Minimal Risk";

    return response;
}


module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return sendError(res, 405, 'Method Not Allowed. Only POST requests are accepted.');
    }

    if (!OPENAI_API_KEY || !OPENAI_ASSISTANT_ID) {
        console.error('Missing OpenAI API Key or Assistant ID in environment variables.');
        return sendError(res, 500, 'Server configuration error: Missing OpenAI credentials.');
    }

    const { company, industry, revenue, useOfAi } = req.body;

    if (!company || !industry || !revenue || !useOfAi) {
        return sendError(res, 400, 'Missing required parameters. Please provide company, industry, revenue, and useOfAi.');
    }

    const promptContent = `
        Company Name: ${company}
        Industry: ${industry}
        Annual Revenue: ${revenue}
        Description of AI Use Case: ${useOfAi}

        Based on the EU AI Act, please provide the following:
        1. Risk Level: (Unacceptable Risk, High-Risk, Limited Risk, or Minimal Risk)
        2. Reasoning: (Explain why this risk level is assigned based on the AI Act)
        3. Maximum Potential Fine: (State the fine amount/range and the percentage of global annual turnover, e.g., "up to X million EUR or Y% of global annual turnover, whichever is higher")
        4. Compliance Measures: (List key compliance measures/obligations relevant to the identified risk level)

        Please structure your response clearly using these headings. For example:
        Risk Level: [Your Answer]
        Reasoning: [Your Answer]
        Maximum Potential Fine: [Your Answer]
        Compliance Measures: [Your Answer as a list or paragraph]
    `;

    try {
        console.log("Creating thread...");
        const thread = await createThread();
        const threadId = thread.id;
        console.log(`Thread created: ${threadId}`);

        console.log("Adding message to thread...");
        await addMessageToThread(threadId, promptContent);
        console.log("Message added.");

        console.log("Creating run...");
        // Optional: Pass specific instructions for this run, if needed, beyond the assistant's general config
        const run = await createRun(threadId, OPENAI_ASSISTANT_ID, "Please analyze the provided company details for EU AI Act compliance.");
        const runId = run.id;
        console.log(`Run created: ${runId}`);

        console.log("Polling for run completion...");
        await pollForRunCompletion(threadId, runId);
        console.log("Run completed.");

        console.log("Retrieving messages...");
        const messagesData = await getThreadMessages(threadId);
        
        let assistantMessageContent = "No response from assistant.";
        if (messagesData.data && messagesData.data.length > 0) {
            const assistantMessages = messagesData.data.filter(msg => msg.role === 'assistant');
            if (assistantMessages.length > 0 && assistantMessages[0].content && assistantMessages[0].content.length > 0 && assistantMessages[0].content[0].type === 'text') {
                assistantMessageContent = assistantMessages[0].content[0].text.value;
            }
        }
        console.log("Assistant raw response:", assistantMessageContent);

        const parsedResponse = parseAssistantResponse(assistantMessageContent);
        console.log("Parsed response:", parsedResponse);

        res.status(200).json(parsedResponse);

    } catch (error) {
        console.error('Error in risk classification process:', error);
        // Check if error is an OpenAI API error with status
        if (error.message.includes("OpenAI API request failed")) {
             // Extract status if possible, otherwise default
            const statusMatch = error.message.match(/status (\d+)/);
            const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 500;
            return sendError(res, statusCode, `OpenAI API error: ${error.message}`);
        }
        // Check for specific error messages from our logic
        if (error.message.includes("Run did not complete successfully")) {
            return sendError(res, 504, `AI processing timed out or failed: ${error.message}`);
        }
        // Generic internal server error
        return sendError(res, 500, `Internal Server Error: ${error.message}`);
    }
};
