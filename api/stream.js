const { Configuration, OpenAIApi } = require('openai');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).end('Method Not Allowed');
    }

    const { message } = req.body;
    const configuration = new Configuration({ apiKey: process.env.OPENAI_API_KEY });
    const openai = new OpenAIApi(configuration);

    try {
        // Create a new thread
        const threadResponse = await openai.createThread({ assistant_id: 'your-assistant-id' });
        const threadId = threadResponse.data.id;

        // Start streaming
        const stream = openai.beta.threads.runs.stream(threadId, {
            assistant_id: 'your-assistant-id'
        });

        stream.on('data', (data) => {
            res.write(data.choices.map(choice => choice.message.content).join('\n'));
        });

        stream.on('end', () => {
            res.end();
        });

        stream.on('error', (error) => {
            res.status(500).json({ error: error.message });
        });

        await openai.createMessage(threadId, { role: 'user', content: message });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
