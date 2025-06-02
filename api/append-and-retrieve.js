const OpenAI = require('openai');

// Initialize OpenAI client at module scope
let openai;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
    console.error('OPENAI_API_KEY is not set. The append-and-retrieve API will not be able to authenticate.');
    // Operations will fail if 'openai' is not initialized.
}

// Helper function for consistent error responses
const sendError = (res, statusCode, error, details = '') => {
    // Ensure details are stringified if they are objects
    const detailString = (typeof details === 'object' && details !== null) ? JSON.stringify(details) : details;
    res.status(statusCode).json({ error, details: detailString });
};

// Function to add a message to a thread
async function addMessageToThread(openaiClient, threadId, content) {
    return openaiClient.beta.threads.messages.create(threadId, {
        role: 'user',
        content: content
    });
}

// Function to create a run
async function createRun(openaiClient, threadId, assistantId, instructions) {
    return openaiClient.beta.threads.runs.create(threadId, {
        assistant_id: assistantId,
        instructions: instructions // Optional: Can be null or omitted if not needed
    });
}

// Function to poll for run completion
async function pollForRunCompletion(openaiClient, threadId, runId) {
    const maxAttempts = 30;
    let attempts = 0;
    let run;

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
            run = await openaiClient.beta.threads.runs.retrieve(threadId, runId);
        } catch (error) {
            console.error(`Polling attempt ${attempts + 1} failed for run ${runId}: ${error.message}`);
            if (attempts + 1 >= maxAttempts) {
                throw new Error(`Failed to get run status for ${runId} after ${maxAttempts} attempts. Last error: ${error.message}`);
            }
            // Optional: check if error is an OpenAI.APIError and if it's a retryable error.
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
    if (run.status !== 'completed') {
        console.error('Run did not complete successfully (append-and-retrieve):', run);
        const errorDetails = run.last_error ? run.last_error.message : JSON.stringify(run.incomplete_details || {});
        throw new Error(`Run did not complete successfully. Status: ${run.status}, Details: ${errorDetails}`);
    }
    return run;
}

// Function to retrieve messages from a thread
async function getThreadMessages(openaiClient, threadId) {
    return openaiClient.beta.threads.messages.list(threadId, { order: 'desc' });
}


module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return sendError(res, 405, 'Method Not Allowed', 'Only POST requests are accepted.');
    }
    
    // Check if OpenAI client was initialized
    if (!openai) {
        console.error('OpenAI client is not initialized. Missing OPENAI_API_KEY.');
        return sendError(res, 500, 'Server Configuration Error', 'OpenAI client not initialized due to missing API Key.');
    }

    const assistantIdToUse = process.env.OPENAI_ASSISTANT_ID;
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
        // openai client is now from module scope
        console.log(`Adding message to thread ${threadId}...`);
        await addMessageToThread(openai, threadId, messageContent); // Pass the module-scoped client
        console.log("Message added.");

        console.log(`Creating run for thread ${threadId} with assistant ${assistantIdToUse}...`);
        const run = await createRun(openai, threadId, assistantIdToUse, null); // Pass the module-scoped client
        const runId = run.id;
        console.log(`Run created: ${runId}`);

        console.log("Polling for run completion...");
        const completedRun = await pollForRunCompletion(openai, threadId, runId); // Pass the module-scoped client
        console.log("Run completed.");

        console.log("Retrieving messages...");
        const messagesData = await getThreadMessages(openai, threadId); // Pass the module-scoped client
        
        let lastAssistantMessage = "";
        if (messagesData.data && messagesData.data.length > 0) {
            const assistantMsg = messagesData.data.find(msg => msg.role === 'assistant');
            if (assistantMsg && assistantMsg.content && assistantMsg.content.length > 0 && assistantMsg.content[0].type === 'text') {
                lastAssistantMessage = assistantMsg.content[0].text.value;
            }
        }
        
        if (!lastAssistantMessage) {
            // Use completedRun for more accurate status if no message found
            console.warn("No assistant message found or run completed with required_action. Run status:", completedRun?.status, "Messages data:", messagesData);
            lastAssistantMessage = "Assistant did not provide a text response. The run may require tool calls or further action.";
        }

        res.status(200).json({ message: lastAssistantMessage });

    } catch (error) {
        console.error("Error in append-and-retrieve:", error.message, error.stack);
        // Check for name and status property for more robust error type identification in Jest
        if (error.name === 'APIError' && typeof error.status === 'number') {
            return sendError(res, error.status, 'OpenAI Service Error', error.message);
        }
        if (error.message.includes("Run did not complete successfully") || error.message.includes("Failed to get run status")) { // From pollForRunCompletion
            return sendError(res, 504, 'AI Processing Timeout/Error', error.message);
        }
        return sendError(res, 500, 'Internal Server Error', error.message);
    }
};
