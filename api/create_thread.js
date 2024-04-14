const { Configuration, OpenAIApi } = require('openai');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).end('Method Not Allowed');
    }

    // Ensure there is a body and a message to proceed
    if (!req.body || !req.body.message) {
        return res.status(400).end('Bad Request: No message provided');
    }
    
    const { message } = req.body;
    const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
    const openai = new OpenAIApi(configuration);

    try {
        // Create a new thread
        const threadResponse = await openai.createThread({
            assistant_id: 'asst_7F2kiEd6b0ykX9iPwYXmxYW3'
        });
        const threadId = threadResponse.data.id;

        // Send user's message to the thread
        const messageResponse = await openai.createMessage(threadId, { 
            role: 'user', 
            content: message
        });

        // Collect and format all responses
        const responses = messageResponse.data.messages.filter(msg => msg.role === 'assistant');
        const combinedResponses = responses.map(resp => resp.content).join('\n');

        // Ending the response after sending all messages
        res.status(200).send(combinedResponses);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
