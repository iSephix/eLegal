import fetch from "node-fetch";

export default async function handler(req, res) {
    const OPENAI_API_KEY = process.env.OPENAI_API_KEY; // Ensure your API key is stored in Vercel environment variables
    const assistantId = "asst_abc123"; // Define assistant ID here or pass it through request
    const messageContent = req.body.message || "Hello!"; // Message content can be passed via request body

    try {
        // 1. Create a Thread
        const createThreadResponse = await fetch('https://api.openai.com/v1/threads', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'OpenAI-Beta': 'assistants=v1'
            }
        });
        const threadData = await createThreadResponse.json();
        const threadId = threadData.data.id;

        // 2. Add Message to Thread
        await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'OpenAI-Beta': 'assistants=v1'
            },
            body: JSON.stringify({
                role: 'user',
                content: messageContent
            })
        });

        // 3. Start Run
        await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'assistants=v1'
            },
            body: JSON.stringify({
                assistant_id: 'asst_7F2kiEd6b0ykX9iPwYXmxYW3',
                instructions: "Please address the user as Jane Doe. The user has a premium account."
            })
        });

        // 4. Wait 5 seconds
        await new Promise(resolve => setTimeout(resolve, 5000));

        // 5. Retrieve last message from thread
        const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
            method: 'GET',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'OpenAI-Beta': 'assistants=v1'
            }
        });
        const messagesData = await messagesResponse.json();
        const lastMessage = messagesData.data.messages[messagesData.data.messages.length - 1].content;

        res.status(200).json({ message: lastMessage });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
