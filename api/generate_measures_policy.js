const OpenAI = require('openai');

const OPENAI_ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

// Helper function for consistent error responses
const sendError = (res, statusCode, error, details = '') => {
    // Ensure details are stringified if they are objects
    const detailString = (typeof details === 'object' && details !== null) ? JSON.stringify(details) : details;
    res.status(statusCode).json({ error, details: detailString });
};

// Initialize OpenAI client
let openai;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
    console.error('OPENAI_API_KEY is not set. The API will not be able to authenticate.');
    // We'll let the request handler deal with sending the error response
    // if the key is missing when a request comes in.
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
async function pollForRunCompletion(threadId, runId) { // apiKey param removed
    const maxAttempts = 70;
    let attempts = 0;
    let run;

    while (attempts < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
            // This call will be replaced with openai.beta.threads.runs.retrieve(threadId, runId);
            run = await openai.beta.threads.runs.retrieve(threadId, runId);
        } catch (error) {
            console.error(`Polling attempt ${attempts + 1} failed for run ${runId}: ${error.message}`);
            if (error instanceof OpenAI.APIError) { // Handle OpenAI specific errors
                 // Potentially retryable errors could be handled here, but for now, we just check attempts.
            }
            if (attempts + 1 >= maxAttempts) {
                 throw new Error(`Failed to get run status for ${runId} after ${maxAttempts} attempts. Last error: ${error.message}`);
            }
        }
        
        if (run) {
            console.log(`Run status (generate_measures_policy): ${run.status}, attempt: ${attempts + 1}`);
            if (['completed', 'failed', 'cancelled', 'expired', 'requires_action'].includes(run.status)) {
                break;
            }
        }
        attempts++;
    }

    if (!run) {
        throw new Error(`Failed to retrieve run status for ${runId} after ${maxAttempts} attempts. Run object is null.`);
    }
    if (run.status !== 'completed') { // Check only for 'completed'
        console.error('Run (generate_measures_policy) did not complete successfully:', run);
        const errorDetails = run.last_error ? `${run.last_error.code}: ${run.last_error.message}` : JSON.stringify(run.incomplete_details || {});
        throw new Error(`Run (generate_measures_policy) did not complete successfully. Status: ${run.status}, Details: ${errorDetails}`);
    }
    return run;
}

// Function to retrieve messages from a thread
async function getThreadMessages(threadId) { // apiKey param removed
    // Fetch messages in descending order to easily get the latest one
    return openai.beta.threads.messages.list(threadId, { order: 'desc' });
}


module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return sendError(res, 405, 'Method Not Allowed', 'Only POST requests are accepted.');
    }

    // Check for OpenAI key at the beginning of the request
    if (!process.env.OPENAI_API_KEY || !openai) {
        console.error('OPENAI_API_KEY is not set or OpenAI client failed to initialize for generate_measures_policy.');
        return sendError(res, 500, 'Server Configuration Error', 'OpenAI API Key is missing or client not initialized.');
    }
    
    const assistantId = process.env.OPENAI_ASSISTANT_ID; // assistantId is already defined from module scope
    if (!assistantId) {
        console.error('OPENAI_ASSISTANT_ID is not set for generate_measures_policy.');
        return sendError(res, 500, 'Server Configuration Error', 'OpenAI Assistant ID is missing.');
    }

    const { riskLevel, restrictiveness } = req.body;

    if (!riskLevel || typeof riskLevel !== 'string') {
        return sendError(res, 400, 'Missing or Invalid Parameter', 'riskLevel must be a string.');
    }
    if (!restrictiveness || typeof restrictiveness !== 'string') {
        return sendError(res, 400, 'Missing or Invalid Parameter', 'restrictiveness must be a string.');
    }
    
    const validRestrictiveness = ["low", "medium", "high"];
    if (!validRestrictiveness.includes(restrictiveness.toLowerCase())) {
        return sendError(res, 400, 'Invalid Parameter Value', `restrictiveness must be one of: ${validRestrictiveness.join(', ')}.`);
    }

    const promptContent = `
        You are an AI Act compliance assistant.
        An AI system has been classified with a Risk Level of: "${riskLevel}".
        The desired Restrictiveness for the compliance measures or policy is: "${restrictiveness}".

        Please generate a set of actionable compliance measures or a basic AI policy document outline tailored to this risk level and desired restrictiveness.
        Focus on practical, actionable steps. If generating a policy outline, include key sections relevant to the EU AI Act for the given risk level.
        Present the output clearly. For example, if generating measures, list them. If generating a policy outline, use section headings.
    `;

    try {
        console.log("Creating thread for policy generation...");
        const thread = await createThread(); // apiKey removed
        const threadId = thread.id;
        console.log(`Thread created for policy generation: ${threadId}`);

        console.log("Adding policy generation message to thread...");
        await addMessageToThread(threadId, promptContent); // apiKey removed
        console.log("Policy generation message added.");

        console.log("Creating policy generation run...");
        // apiKey removed
        const run = await createRun(threadId, assistantId, `Generate compliance measures/policy for ${riskLevel} risk with ${restrictiveness} restrictiveness.`);
        const runId = run.id;
        console.log(`Policy generation run created: ${runId}`);

        console.log("Polling for policy generation run completion...");
        await pollForRunCompletion(threadId, runId); // apiKey removed
        console.log("Policy generation run completed.");

        console.log("Retrieving messages for policy generation...");
        const messagesPage = await getThreadMessages(threadId); // apiKey removed, variable name changed
        
        let assistantMessageContent = "No response from assistant regarding policy generation.";
        // The new library returns a Page object, data is in page.data
        if (messagesPage.data && messagesPage.data.length > 0) {
            const assistantMessages = messagesPage.data.filter(msg => msg.role === 'assistant');
            if (assistantMessages.length > 0 && assistantMessages[0].content && assistantMessages[0].content.length > 0 && assistantMessages[0].content[0].type === 'text') {
                assistantMessageContent = assistantMessages[0].content[0].text.value;
            }
        }
        console.log("Assistant raw response (policy generation):", assistantMessageContent);

        res.status(200).json({ generatedPolicy: assistantMessageContent });

    } catch (error) {
        console.error('Error in policy generation process:', error.message, error.stack);
        // Check for name and status property for more robust error type identification
        if (error.name === 'APIError' && typeof error.status === 'number') {
            return sendError(res, error.status, `OpenAI API Error: ${error.name}`, error.message);
        }
        if (error.message.includes("Run (generate_measures_policy) did not complete successfully")) {
            // This custom error can be made more specific if needed
            return sendError(res, 504, 'AI Processing Timeout/Error', error.message);
        }
        // General internal server error for other cases
        return sendError(res, 500, 'Internal Server Error', error.message);
    }
};
