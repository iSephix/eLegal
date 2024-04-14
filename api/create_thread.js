const { Configuration, OpenAIApi } = require('openai');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).end('Method Not Allowed');
    }

    const configuration = new Configuration({
        apiKey: process.env.OPENAI_API_KEY
    });
    const openai = new OpenAIApi(configuration);

    try {
        // Create a new thread
        const threadResponse = await openai.createThread({
            assistant_id: 'asst_7F2kiEd6b0ykX9iPwYXmxYW3'
        });

        if (threadResponse.data && threadResponse.data.id) {
            const threadId = threadResponse.data.id;
            res.status(200).json({ threadId });
        } else {
            throw new Error('Failed to create thread');
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
