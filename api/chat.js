// /api/chat.js

const { Configuration, OpenAIApi } = require('openai');

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
  });
  const openai = new OpenAIApi(configuration);
  
  try {
    const { message } = req.body;
    const response = await openai.createCompletion({
      model: "text-davinci-003",
      prompt: message,
      max_tokens: 150,
    });

    const ai_response = response.data.choices[0].text.trim();
    res.status(200).json({ ai_response });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
