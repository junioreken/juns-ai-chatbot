const { Configuration, OpenAIApi } = require('openai');

const configuration = new Configuration({
  apiKey: process.env.OPENAI_API_KEY,
});

const openai = new OpenAIApi(configuration);

async function askOpenAI(message) {
  const completion = await openai.createChatCompletion({
    model: 'gpt-4',
    messages: [
      { role: 'system', content: 'You are JUN’S AI assistant for fashion, support, and tracking.' },
      { role: 'user', content: message },
    ],
  });

  return completion.data.choices[0].message.content;
}

module.exports = { askOpenAI };