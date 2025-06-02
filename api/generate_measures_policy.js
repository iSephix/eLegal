const fetch = require('node-fetch');

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// It's likely we'll use the same assistant, but if it's a different one, 
// this might need to be a different environment variable. For now, assume it's the same.
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
        const specificMessage = errorData.error?.message || errorData.message || `OpenAI API request failed with status ${response.status}`;
        throw new Error(specificMessage);
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
    const maxAttempts = 70; 
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
    if (!['completed'].includes(run.status)) {
        console.error('Run (generate_measures_policy) did not complete successfully:', run);
        throw new Error(`Run (generate_measures_policy) did not complete successfully. Status: ${run.status}, Details: ${JSON.stringify(run.last_error || run.incomplete_details || {})}`);
    }
    return run;
}

// Function to retrieve messages from a thread
async function getThreadMessages(threadId, apiKey) {
    // Fetch messages in descending order to easily get the latest one
    return callOpenAI(`https://api.openai.com/v1/threads/${threadId}/messages?order=desc`, { method: 'GET' }, apiKey);
}


module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return sendError(res, 405, 'Method Not Allowed', 'Only POST requests are accepted.');
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const assistantId = process.env.OPENAI_ASSISTANT_ID;

    if (!apiKey) {
        console.error('OPENAI_API_KEY is not set for generate_measures_policy.');
        return sendError(res, 500, 'Server Configuration Error', 'OpenAI API Key is missing.');
    }
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
        const thread = await createThread(apiKey);
        const threadId = thread.id;
        console.log(`Thread created for policy generation: ${threadId}`);

        console.log("Adding policy generation message to thread...");
        await addMessageToThread(threadId, promptContent, apiKey);
        console.log("Policy generation message added.");

        console.log("Creating policy generation run...");
        const run = await createRun(threadId, assistantId, `Generate compliance measures/policy for ${riskLevel} risk with ${restrictiveness} restrictiveness.`, apiKey);
        const runId = run.id;
        console.log(`Policy generation run created: ${runId}`);

        console.log("Polling for policy generation run completion...");
        await pollForRunCompletion(threadId, runId, apiKey);
        console.log("Policy generation run completed.");

        console.log("Retrieving messages for policy generation...");
        const messagesData = await getThreadMessages(threadId, apiKey);
        
        let assistantMessageContent = "No response from assistant regarding policy generation.";
        if (messagesData.data && messagesData.data.length > 0) {
            const assistantMessages = messagesData.data.filter(msg => msg.role === 'assistant');
            if (assistantMessages.length > 0 && assistantMessages[0].content && assistantMessages[0].content.length > 0 && assistantMessages[0].content[0].type === 'text') {
                assistantMessageContent = assistantMessages[0].content[0].text.value;
            }
        }
        console.log("Assistant raw response (policy generation):", assistantMessageContent);

        res.status(200).json({ generatedPolicy: assistantMessageContent });

    } catch (error) {
        console.error('Error in policy generation process:', error.message, error.stack);
        if (error.message.toLowerCase().includes("openai") || error.message.includes("api request failed")) {
            return sendError(res, 503, 'OpenAI Service Error', error.message);
        }
        if (error.message.includes("Run (generate_measures_policy) did not complete successfully")) {
            return sendError(res, 504, 'AI Processing Timeout/Error', error.message);
        }
        return sendError(res, 500, 'Internal Server Error', error.message);
    }
};
