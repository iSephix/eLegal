const fetch = require('node-fetch');

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
    const finalOptions = { ...defaultOptions, ...options, headers: {...defaultOptions.headers, ...(options.headers || {})} };

    const response = await fetch(url, finalOptions);
    if (!response.ok) {
        let errorData;
        try {
            errorData = await response.json();
        } catch (e) {
            errorData = { message: `Failed to parse error from OpenAI. Status: ${response.status}, StatusText: ${response.statusText}` };
        }
        console.error(`OpenAI API Error (${url}): ${response.status}`, errorData);
        const specificMessage = errorData.error?.message || errorData.message || `OpenAI API request failed with status ${response.status}`;
        throw new Error(specificMessage);
    }
    return response.json();
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
            instructions: instructions // Optional: Can be null or omitted if not needed
        })
    }, apiKey);
}

// Function to poll for run completion
async function pollForRunCompletion(threadId, runId, apiKey) {
    const maxAttempts = 30; 
    let attempts = 0;
    let run;

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000)); 
        try {
            run = await callOpenAI(`https://api.openai.com/v1/threads/${threadId}/runs/${runId}`, { method: 'GET' }, apiKey);
        } catch (error) {
            console.error(`Polling attempt ${attempts + 1} failed for run ${runId}: ${error.message}`);
            if (attempts + 1 >= maxAttempts) {
                 throw new Error(`Failed to get run status for ${runId} after ${maxAttempts} attempts. Last error: ${error.message}`);
            }
        }
        
        if (run) {
            console.log(`Run status (append-and-retrieve): ${run.status}, attempt: ${attempts + 1}`);
            if (['completed', 'failed', 'cancelled', 'expired', 'requires_action'].includes(run.status)) {
                break;
            }
        }
        attempts++;
    }

    if (!run) {
        throw new Error(`Failed to retrieve run status for ${runId} after ${maxAttempts} attempts. Run object is null.`);
    }
    if (run.status !== 'completed') { // Only 'completed' is a success for this function's purpose
        console.error('Run did not complete successfully (append-and-retrieve):', run);
        throw new Error(`Run did not complete successfully. Status: ${run.status}, Details: ${JSON.stringify(run.last_error || run.incomplete_details || {})}`);
    }
    return run;
}

// Function to retrieve messages from a thread
async function getThreadMessages(threadId, apiKey) {
    return callOpenAI(`https://api.openai.com/v1/threads/${threadId}/messages?order=desc`, { method: 'GET' }, apiKey);
}


module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return sendError(res, 405, 'Method Not Allowed', 'Only POST requests are accepted.');
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const assistantIdToUse = process.env.OPENAI_ASSISTANT_ID; // Use from env

    if (!apiKey) {
        console.error('OPENAI_API_KEY is not set.');
        return sendError(res, 500, 'Server Configuration Error', 'OpenAI API Key is missing.');
    }
    if (!assistantIdToUse) {
        console.error('OPENAI_ASSISTANT_ID is not set.');
        return sendError(res, 500, 'Server Configuration Error', 'OpenAI Assistant ID is missing.');
    }

    const { message: messageContent, threadId } = req.body;

    if (!threadId) {
        return sendError(res, 400, 'Missing Parameter', 'threadId is required in the request body.');
    }
    if (!messageContent) {
        return sendError(res, 400, 'Missing Parameter', 'message (content) is required in the request body.');
    }

    try {
        console.log(`Adding message to thread ${threadId}...`);
        await addMessageToThread(threadId, messageContent, apiKey);
        console.log("Message added.");

        console.log(`Creating run for thread ${threadId} with assistant ${assistantIdToUse}...`);
        // Instructions for the run can be generic or omitted if the assistant is pre-configured
        const run = await createRun(threadId, assistantIdToUse, null, apiKey);
        const runId = run.id;
        console.log(`Run created: ${runId}`);

        console.log("Polling for run completion...");
        await pollForRunCompletion(threadId, runId, apiKey);
        console.log("Run completed.");

        console.log("Retrieving messages...");
        const messagesData = await getThreadMessages(threadId, apiKey);
        
        let lastAssistantMessage = "";
        if (messagesData.data && messagesData.data.length > 0) {
            // Messages are ordered descending, so the first assistant message is the latest.
            const assistantMsg = messagesData.data.find(msg => msg.role === 'assistant');
            if (assistantMsg && assistantMsg.content && assistantMsg.content.length > 0 && assistantMsg.content[0].type === 'text') {
                lastAssistantMessage = assistantMsg.content[0].text.value;
            }
        }
        
        if (!lastAssistantMessage) {
            console.warn("No assistant message found or run completed with required_action. Run status:", run?.status, "Messages data:", messagesData);
            lastAssistantMessage = "Assistant did not provide a text response. The run may require tool calls or further action.";
        }

        res.status(200).json({ message: lastAssistantMessage });

    } catch (error) {
        console.error("Error in append-and-retrieve:", error.message, error.stack);
        if (error.message.toLowerCase().includes("openai") || error.message.includes("api request failed")) {
            return sendError(res, 503, 'OpenAI Service Error', error.message);
        }
        if (error.message.includes("Run did not complete successfully")) {
            return sendError(res, 504, 'AI Processing Timeout/Error', error.message);
        }
        return sendError(res, 500, 'Internal Server Error', error.message);
    }
};
