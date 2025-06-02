const OpenAI = require('openai');

// Initialize OpenAI client at module scope
let openai;
if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
} else {
    console.error('OPENAI_API_KEY is not set. The create_thread API will not be able to authenticate.');
}

// Helper function for consistent error responses
const sendError = (res, statusCode, error, details = '') => {
    // Ensure details are stringified if they are objects
    const detailString = (typeof details === 'object' && details !== null) ? JSON.stringify(details) : details;
    res.status(statusCode).json({ error, details: detailString });
};

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return sendError(res, 405, 'Method Not Allowed', 'Only POST requests are accepted.');
    }

    // Check if OpenAI client was initialized
    if (!openai) {
        console.error('OpenAI client is not initialized. Missing OPENAI_API_KEY.');
        return sendError(res, 500, 'Server Configuration Error', 'OpenAI client not initialized due to missing API Key.');
    }

    try {
        // openai client is now from module scope
        const thread = await openai.beta.threads.create();

        if (thread && thread.id) {
            res.status(200).json({ threadId: thread.id });
        } else {
            // This case might indicate an unexpected successful response structure from OpenAI (highly unlikely)
            // or if the thread object itself is unexpectedly null/undefined without an error being thrown.
            console.error('Failed to create thread or response malformed. Thread object:', thread);
            sendError(res, 500, 'Failed to Create Thread', 'Received unexpected response structure from OpenAI.');
        }
    } catch (error) {
        console.error('Error creating OpenAI thread:', error.message, error.stack);
        if (error instanceof OpenAI.APIError) {
            // Handle OpenAI API errors (e.g., authentication, rate limits, server-side issues)
            return sendError(res, error.status || 503, 'OpenAI Service Error', error.message);
        } else {
            // Handle other errors (e.g., network issues, an issue with the OpenAI client library itself before an API call)
            return sendError(res, 500, 'Internal Server Error', error.message);
        }
    }
};
