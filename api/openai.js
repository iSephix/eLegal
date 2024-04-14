export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { prompt } = req.body;
        const apiKey = process.env.OPENAI_API_KEY; 

        const threadResponse = await fetch("https://api.openai.com/v1/threads", {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                assistant_id: "asst_7F2kiEd6b0ykX9iPwYXmxYW3"
            })
        });

        const threadData = await threadResponse.json();
        const threadId = threadData.id; // Extracting thread ID from response

        // Send user's message to the thread
        await fetch(`https://api.openai.com/v1/messages`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                thread_id: threadId,
                role: "user",
                content: prompt
            })
        });

        await fetch(`https://api.openai.com/v1/runs`, {
            method: "POST",
            headers: {
                "Authorization": `Bearer ${apiKey}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                thread_id: threadId,
                assistant_id: "asst_7F2kiEd6b0ykX9iPwYXmxYW3"
            })
        });

        const messagesResponse = await fetch(`https://api.openai.com/v1/messages?thread_id=${threadId}`, {
            method: "GET",
            headers: {
                "Authorization": `Bearer ${apiKey}`
            }
        });

        const messagesData = await messagesResponse.json();
        const lastMessage = messagesData.data[messagesData.data.length - 1].content; // Assuming the last message is what you want to send back

        res.status(200).json({ response: lastMessage });
    } else {
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}
