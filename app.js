const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const { Configuration, OpenAIApi } = require('openai');

// Load environment variables from .env file
dotenv.config();

const app = express();
const apiKey = process.env.OPENAI_API_KEY;

if (!apiKey) {
    console.error('Error: OPENAI_API_KEY is not set in the .env file');
    process.exit(1);
}

const configuration = new Configuration({
    apiKey: apiKey,
});
const openai = new OpenAIApi(configuration);

app.use(bodyParser.json());

let chatHistory = [];

// Serve static files
app.use(express.static('public'));

// Route to serve the index.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Chat route
app.post('/chat', async (req, res) => {
    const userMessage = req.body.message;
    const systemPrompt = req.body.system_prompt;
    const variables = req.body.variables || {};

    // Replace variables in the system prompt
    let prompt = systemPrompt;
    for (const [key, value] of Object.entries(variables)) {
        prompt = prompt.replace(`\${${key}}`, value);
    }

    // Add user message to chat history
    chatHistory.push({ role: 'user', content: userMessage });

    // Keep only the last 20 messages
    if (chatHistory.length > 20) {
        chatHistory = chatHistory.slice(-20);
    }

    // Prepare messages for OpenAI API
    const messages = [{ role: 'system', content: prompt }, ...chatHistory];

    // Call OpenAI API
    try {
        const response = await openai.createChatCompletion({
            model: 'gpt-4o-mini',
            messages: messages,
        });

        const assistantMessage = response.data.choices[0].message.content;

        // Add assistant message to chat history
        chatHistory.push({ role: 'assistant', content: assistantMessage });

        // Keep only the last 20 messages
        if (chatHistory.length > 20) {
            chatHistory = chatHistory.slice(-20);
        }

        res.json({ message: assistantMessage });
    } catch (error) {
        console.error('Error calling OpenAI API:', error.response ? error.response.data : error.message);
        res.status(500).json({ error: 'Failed to get response from OpenAI API' });
    }
});

const PORT = process.env.PORT || 3010;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});