const OpenAI = require('openai');

const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

// Helper function for consistent error responses
const sendError = (res, statusCode, error, details = '') => {
    const detailString = (typeof details === 'object' && details !== null) ? JSON.stringify(details) : details;
    res.status(statusCode).json({ error, details: detailString });
};

// Initialize OpenAI client
let openai;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
    console.error('OPENAI_API_KEY is not set. The API will not be able to authenticate.');
}

// Function to create a new thread
async function createThread() {
    return openai.beta.threads.create();
}

// Function to add a message to a thread
async function addMessageToThread(threadId, content) {
    return openai.beta.threads.messages.create(threadId, {
        role: 'user',
        content: content
    });
}

// Function to create a run
async function createRun(threadId, assistantId, instructions) {
    return openai.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        instructions: instructions
    });
}

// Function to poll for run completion
async function pollForRunCompletion(threadId, runId) {
    const maxAttempts = 60; 
    let attempts = 0;
    let run;

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        try {
            run = await openai.beta.threads.runs.retrieve(threadId, runId);
        } catch (error) {
            console.error(`Polling attempt ${attempts + 1} failed for run ${runId}: ${error.message}`);
            if (error instanceof OpenAI.APIError) {
                // Handle OpenAI specific errors during polling if necessary
            }
            if (attempts + 1 >= maxAttempts) {
                 throw new Error(`Failed to get run status for ${runId} after ${maxAttempts} attempts. Last error: ${error.message}`);
            }
        }
        
        if (run) { 
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
    if (run.status !== 'completed') { 
        console.error('Run did not complete successfully:', run);
        const errorDetails = run.last_error ? `${run.last_error.code}: ${run.last_error.message}` : JSON.stringify(run.incomplete_details || {});
        throw new Error(`Run did not complete successfully. Status: ${run.status}, Details: ${errorDetails}`);
    }
    return run;
}

// Function to retrieve messages from a thread
async function getThreadMessages(threadId) { 
    return openai.beta.threads.messages.list(threadId, { order: 'desc' });
}

function parseAssistantResponse(responseText) {
    const response = {
        riskLevel: "Not determined",
        reasoning: "No specific reasoning provided.",
        maxFine: "Not determined",
        maxFineRevenue: "", // Ensure this line ends with a comma or is the last property
        measures: "No specific measures provided."
    }; // Added semicolon here

    if (!responseText) return response;

    const normalizedText = responseText.toLowerCase();

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
        response.measures = measuresMatch[1].trim().replace(/^\w/, c => c.toUpperCase());
    }
    
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

    if (!process.env.OPENAI_API_KEY || !openai) {
        console.error('OPENAI_API_KEY is not set or OpenAI client failed to initialize for risk_classification.');
        return sendError(res, 500, 'Server Configuration Error', 'OpenAI API Key is missing or client not initialized.');
    }
    
    if (!OPENAI_ASSISTANT_ID) {
        console.error('OPENAI_ASSISTANT_ID is not set for risk_classification.');
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
        const thread = await createThread();
        const threadId = thread.id;
        console.log(`Thread created: ${threadId}`);

        console.log("Adding message to thread...");
        await addMessageToThread(threadId, promptContent);
        console.log("Message added.");

        console.log("Creating run...");
        const run = await createRun(threadId, OPENAI_ASSISTANT_ID, "Please analyze the provided company details for EU AI Act compliance.");
        const runId = run.id;
        console.log(`Run created: ${runId}`);

        console.log("Polling for run completion...");
        await pollForRunCompletion(threadId, runId);
        console.log("Run completed.");

        console.log("Retrieving messages...");
        const messagesPage = await getThreadMessages(threadId);
        
        let assistantMessageContent = "No response from assistant.";
        if (messagesPage.data && messagesPage.data.length > 0) {
            const assistantMessages = messagesPage.data.filter(msg => msg.role === 'assistant');
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
        // Check for name and status property for more robust error type identification
        if (error.name === 'APIError' && typeof error.status === 'number') {
            return sendError(res, error.status, `OpenAI API Error: ${error.name}`, error.message);
        }
        if (error.message.includes("Run did not complete successfully")) {
            return sendError(res, 504, 'AI Processing Timeout/Error', error.message);
        }
        return sendError(res, 500, 'Internal Server Error', error.message);
    }
};
