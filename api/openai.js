export default async function handler(req, res) {
    if (req.method === 'POST') {
        const { prompt, message } = req.body;
        const apiKey = process.env.OPENAI_API_KEY;
        const betaHeader = "assistants=v1";

        try {
            const threadResponse = await fetch("https://api.openai.com/v1/threads", {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "OpenAI-Beta": betaHeader
                }
            });

            const threadData = await threadResponse.json();
            if (!threadData || !threadData.id) {
                throw new Error("Failed to create thread.");
            }
            const threadId = threadData.id;

            const messageResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "OpenAI-Beta": betaHeader
                },
                body: JSON.stringify({
                    role: "user",
                    content: "Answer in prompt" + message
                })
            });

            await messageResponse.json(); 
            
            const runResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/runs`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "Content-Type": "application/json",
                    "OpenAI-Beta": betaHeader
                },
                body: JSON.stringify({
                    assistant_id: "asst_7F2kiEd6b0ykX9iPwYXmxYW3",
                    instructions: "Please address the user politely and efficiently."
                })
            });

            await runResponse.json();

            const messagesResponse = await fetch(`https://api.openai.com/v1/threads/${threadId}/messages`, {
                method: "GET",
                headers: {
                    "Authorization": `Bearer ${apiKey}`,
                    "OpenAI-Beta": betaHeader
                }
            });

            const messagesData = await messagesResponse.json();
            if (!messagesData || !messagesData.data || messagesData.data.length === 0) {
                throw new Error("No messages found in the thread.");
            }
            const lastMessage = messagesData.data[messagesData.data.length - 1].content; 

            res.status(200).json({ response: lastMessage });
        } catch (error) {
            console.error('Error processing your request:', error);
            res.status(500).json({ error: 'Error processing your request', details: error.message });
        }
    } else {
        // Handle any non-POST requests
        res.setHeader('Allow', ['POST']);
        res.status(405).end(`Method ${req.method} Not Allowed`);
    }
}
