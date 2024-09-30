const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const fs = require('fs').promises;
const path = require('path');
const { generateResponse, compareResponses, OPENAI_MODELS, ANTHROPIC_MODELS } = require('./ai-gateway');

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
    const provider = req.body.provider;
    const model = req.body.model;
    const systemPrompt = "You are a helpful AI assistant."; // Default system prompt

    chatHistory.push({ role: 'user', content: userMessage });

    try {
        const assistantMessage = await generateResponse(provider, model, chatHistory, systemPrompt);
        chatHistory.push({ role: 'assistant', content: assistantMessage });
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

// Comparison route
app.post('/compare', async (req, res) => {
    const userMessage = req.body.message;
    const providers = req.body.providers;
    const models = req.body.models;
    const systemPrompt = "You are a helpful AI assistant."; // Default system prompt

    try {
        const results = await compareResponses(providers, models, [{ role: 'user', content: userMessage }], systemPrompt);
        res.json({ results });
    } catch (error) {
        console.error('Error calling AI API:', error.message);
        res.status(500).json({ error: 'Failed to get response from AI API' });
    }
});

// Export chat log route
app.get('/export', (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const filename = `chat_log_${timestamp}.json`;
        const chatLogJson = JSON.stringify(chatHistory, null, 2);

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
        res.send(chatLogJson);
    } catch (error) {
        console.error('Error exporting chat log:', error.message);
        res.status(500).json({ error: 'Failed to export chat log' });
    }
});

// Clear chat history route
app.post('/clear', (req, res) => {
    try {
        chatHistory = [];
        res.status(200).json({ message: 'Chat history cleared successfully' });
    } catch (error) {
        console.error('Error clearing chat history:', error.message);
        res.status(500).json({ error: 'Failed to clear chat history' });
    }
});

const PORT = process.env.PORT || 3010;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});