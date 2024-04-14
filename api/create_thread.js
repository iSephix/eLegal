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
        const thread = await openai.beta.threads.create();

        // Ensure thread creation was successful
        if (thread && thread.data && thread.data.id) {
            const threadId = thread.data.id;
            res.status(200).json({ threadId });
        } else {
            throw new Error('Failed to create thread');
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
