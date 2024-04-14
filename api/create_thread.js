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
        // Create a new thread associated with an assistant
        const threadResponse = await openai.beta.threads.create({
            assistant_id: 'asst_7F2kiEd6b0ykX9iPwYXmxYW3', // Ensure the Assistant ID is correct
            messages: [{ role: "system", content: "Initial thread creation." }]
        });

        // Ensure thread creation was successful
        if (threadResponse && threadResponse.data && threadResponse.data.id) {
            const threadId = threadResponse.data.id;
            res.status(200).json({ threadId });
        } else {
            throw new Error('Failed to create thread');
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
