const fetch = require('node-fetch');

async function handler(req, res) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
    const assistantId = "asst_7F2kiEd6b0ykX9iPwYXmxYW3";
    const messageContent = req.body.message || "Hello!";

    try {
        // 1. Create a Thread
        const createThreadResponse = await fetch('https://api.openai.com/v1/threads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            }
        });
        if (!createThreadResponse.ok) {
            throw new Error(`HTTP error while creating thread! status: ${createThreadResponse.status}`);
        }
        const threadData = await createThreadResponse.json();
        const threadId = threadData.data.id;

        // 2. Add Message to Thread
        const addMessageResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify({
                role: 'user',
                content: messageContent
            })
        });
        if (!addMessageResponse.ok) {
            throw new Error(`HTTP error while posting message! status: ${addMessageResponse.status}`);
        }

        // 3. Start Run
        const startRunResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                assistant_id: assistantId,
            })
        });
        if (!startRunResponse.ok) {
            throw new Error(`HTTP error while starting run! status: ${startRunResponse.status}`);
        }

        // 5. Retrieve messages from thread after an arbitrary delay
        await new Promise(resolve => setTimeout(resolve, 5000));

        const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            }
        });
        if (!messagesResponse.ok) {
            throw new Error(`HTTP error fetching messages! status: ${messagesResponse.status}`);
        }
        const messagesData = await messagesResponse.json();
        const lastMessage = messagesData.data.messages[messagesData.data.messages.length - 1].content;

        // 7. Send last message back to frontend
        res.status(200).json({ message: lastMessage });
    } catch (error) {
        console.error("Error:", error);
        res.status(500).json({ error: error.message });
    }
}
