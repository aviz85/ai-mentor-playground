const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const { generateResponse, OPENAI_MODELS, ANTHROPIC_MODELS } = require('./ai-gateway');

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

let chatHistory = [];

// Route to serve the index.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Chat route
app.post('/chat', async (req, res) => {
    const userMessage = req.body.message;
    const systemPrompt = req.body.system_prompt;
    const variables = req.body.variables || {};
    const provider = req.body.provider;
    const model = req.body.model;

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

    // Prepare messages for AI API
    const messages = [{ role: 'system', content: prompt }, ...chatHistory];

    try {
        const assistantMessage = await generateResponse(provider, model, messages);

        // Add assistant message to chat history
        chatHistory.push({ role: 'assistant', content: assistantMessage });

        // Keep only the last 20 messages
        if (chatHistory.length > 20) {
            chatHistory = chatHistory.slice(-20);
        }

        res.json({ message: assistantMessage });
    } catch (error) {
        console.error('Error calling AI API:', error.message);
        res.status(500).json({ error: 'Failed to get response from AI API' });
    }
});

// Route to get available models
app.get('/models', (req, res) => {
    res.json({
        openai: OPENAI_MODELS,
        anthropic: ANTHROPIC_MODELS,
    });
});

const PORT = process.env.PORT || 3010;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});