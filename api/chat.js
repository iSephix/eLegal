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
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'OpenAI-Beta': 'assistants=v1'
            }
        });
        if (!createThreadResponse.ok) {
            throw new Error(`HTTP error! status: ${createThreadResponse.status}`);
        }
        const threadData = await createThreadResponse.json();
        if (!threadData.data || !threadData.data.id) {
            console.error("Thread creation failed or the API response does not contain the expected 'id' field:", threadData);
            res.status(500).json({ error: "Failed to create thread or parse thread ID." });
            return;
        }
        const threadId = threadData.data.id;

        // 2. Add Message to Thread
        const addMessageResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
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
        if (!addMessageResponse.ok) {
            throw new Error(`HTTP error! status: ${addMessageResponse.status}`);
        }

        // 3. Start Run
        const startRunResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`,
                'Content-Type': 'application/json',
                'OpenAI-Beta': 'assistants=v1'
            },
            body: JSON.stringify({
                assistant_id: assistantId,
                instructions: "Please address the user as Jane Doe. The user has a premium account."
            })
        });
        if (!startRunResponse.ok) {
            throw new Error(`HTTP error! status: ${startRunResponse.status}`);
        }

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
        if (!messagesResponse.ok) {
            throw new Error(`HTTP error! status: ${messagesResponse.status}`);
        }
        const messagesData = await messagesResponse.json();
        const lastMessage = messagesData.data.messages[messagesData.data.messages.length - 1].content;

        // 7. Send last message back to frontend
        res.status(200).json({ message: lastMessage });
    } catch (error) {
        console.error("Error during operation:", error);
        res.status(500).json({ error: error.message });
    }
}
