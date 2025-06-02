const fetch = require('node-fetch');

// Helper function for consistent error responses
const sendError = (res, statusCode, error, details = '') => {
    res.status(statusCode).json({ error, details });
};

// Helper function to make OpenAI API calls
async function callOpenAI(url, options, apiKey) {
    const defaultOptions = {
        method: 'POST', // Default to POST, can be overridden by options
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`,
            'OpenAI-Beta': 'assistants=v1'
        }
    };
    // Merge options, ensuring headers are merged deeply
    const finalOptions = { 
        ...defaultOptions, 
        ...options, 
        headers: {
            ...defaultOptions.headers, 
            ...(options.headers || {}) // Spread options.headers if it exists
        } 
    };
    
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

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        // For Method Not Allowed, Vercel typically handles this, but being explicit is fine.
        // Using sendError for consistency, though the body might not always be processed by clients for 405.
        return sendError(res, 405, 'Method Not Allowed', 'Only POST requests are accepted.');
    }

    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
        console.error('OPENAI_API_KEY is not set.');
        return sendError(res, 500, 'Server Configuration Error', 'OpenAI API Key is missing.');
    }

    try {
        // For creating a thread, the body is empty.
        // The callOpenAI helper defaults to 'POST', so method doesn't need to be specified here if POST is desired.
        // However, the OpenAI endpoint for creating a thread is POST /v1/threads, not /v1/beta/threads anymore for Assistants v1.
        // The `OpenAI-Beta: assistants=v1` header handles versioning.
        const data = await callOpenAI('https://api.openai.com/v1/threads', { /* method: 'POST' is default */ }, apiKey);

        if (data && data.id) {
            res.status(200).json({ threadId: data.id });
        } else {
            // This case should ideally be caught by callOpenAI if the response was not ok or data is unexpected.
            console.error('Failed to create thread or response malformed:', data);
            sendError(res, 500, 'Failed to Create Thread', 'Received unexpected response from OpenAI.');
        }
    } catch (error) {
        console.error('Error creating OpenAI thread:', error.message, error.stack);
        // Check if it's an error thrown by callOpenAI (OpenAI specific)
        if (error.message.toLowerCase().includes("openai") || error.message.includes("api request failed")) {
            return sendError(res, 503, 'OpenAI Service Error', error.message);
        }
        // Generic internal server error
        return sendError(res, 500, 'Internal Server Error', error.message);
    }
};
