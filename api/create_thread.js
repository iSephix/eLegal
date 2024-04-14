const fetch = require('node-fetch');

module.exports = async (req, res) => {
    if (req.method !== 'POST') {
        return res.status(405).end('Method Not Allowed');
    }

    const url = 'https://api.openai.com/v1/beta/threads';
    const options = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
        }
    };

    try {
        const response = await fetch(url, options);
        const data = await response.json();

        if (response.ok && data && data.id) {
            res.status(200).json({ threadId: data.id });
        } else {
            throw new Error('Failed to create thread');
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
};
