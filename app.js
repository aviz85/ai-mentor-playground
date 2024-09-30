const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');
const { generateResponse, compareResponses, OPENAI_MODELS, ANTHROPIC_MODELS } = require('./ai-gateway');

// Load environment variables from .env file
dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

let chatHistory = [];

// Initialize SQLite database
const db = new sqlite3.Database('./prompts.db', (err) => {
    if (err) {
        console.error('Error opening database', err);
    } else {
        console.log('Connected to the SQLite database.');
        db.run(`CREATE TABLE IF NOT EXISTS prompts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE,
            content TEXT
        )`, (err) => {
            if (err) {
                console.error('Error creating table:', err);
            } else {
                console.log('Prompts table created or already exists.');
            }
        });
    }
});

// Route to serve the index.html
app.get('/', (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

// Chat route
app.post('/chat', async (req, res) => {
    const userMessage = req.body.message;
    const systemPrompt = req.body.system_prompt || "You are a helpful AI assistant.";
    const provider = req.body.provider;
    const model = req.body.model;

    // Add user message to chat history
    chatHistory.push({ role: 'user', content: userMessage });

    // Keep only the last 20 messages
    if (chatHistory.length > 20) {
        chatHistory = chatHistory.slice(-20);
    }

    // Prepare messages for AI API, excluding the 'model' field
    const messages = [
        { role: 'system', content: systemPrompt },
        ...chatHistory.map(({ role, content }) => ({ role, content }))
    ];

    try {
        const assistantMessage = await generateResponse(provider, model, messages);

        // Add assistant message to chat history with model info
        chatHistory.push({ 
            role: 'assistant', 
            content: assistantMessage, 
            model: `${provider} (${model})`
        });

        res.json({ message: assistantMessage });
    } catch (error) {
        console.error('Error calling AI API:', error.message);
        // Add error message to chat history
        chatHistory.push({ 
            role: 'assistant', 
            content: `Error: ${error.message}`, 
            model: `${provider} (${model})`
        });
        res.status(500).json({ error: `Failed to get response from AI API: ${error.message}` });
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

// Get all custom prompts
app.get('/prompts', (req, res) => {
    console.log('Fetching all prompts');
    db.all("SELECT * FROM prompts", [], (err, rows) => {
        if (err) {
            console.error('Error fetching prompts:', err);
            res.status(500).json({ error: err.message });
            return;
        }
        console.log('Fetched prompts:', rows);
        res.json(rows);
    });
});

// Add a new custom prompt
app.post('/prompts', (req, res) => {
    const { name, content } = req.body;
    console.log('Adding new prompt:', { name, content });
    db.run("INSERT INTO prompts (name, content) VALUES (?, ?)", [name, content], function(err) {
        if (err) {
            console.error('Error adding prompt:', err);
            res.status(400).json({ error: err.message });
            return;
        }
        console.log('Added new prompt with id:', this.lastID);
        res.json({ id: this.lastID, name, content });
    });
});

// Update an existing custom prompt
app.put('/prompts/:id', (req, res) => {
    const { name, content } = req.body;
    console.log('Updating prompt:', { id: req.params.id, name, content });
    db.run("UPDATE prompts SET name = ?, content = ? WHERE id = ?", [name, content, req.params.id], function(err) {
        if (err) {
            console.error('Error updating prompt:', err);
            res.status(400).json({ error: err.message });
            return;
        }
        console.log('Updated prompt, rows affected:', this.changes);
        res.json({ id: req.params.id, name, content });
    });
});

// Delete a custom prompt
app.delete('/prompts/:id', (req, res) => {
    console.log('Deleting prompt:', req.params.id);
    db.run("DELETE FROM prompts WHERE id = ?", req.params.id, function(err) {
        if (err) {
            console.error('Error deleting prompt:', err);
            res.status(400).json({ error: err.message });
            return;
        }
        console.log('Deleted prompt, rows affected:', this.changes);
        res.json({ message: "Prompt deleted", changes: this.changes });
    });
});

// Export chat log route
app.get('/export', (req, res) => {
    try {
        const timestamp = new Date().toISOString().replace(/:/g, '-');
        const filename = `chat_log_${timestamp}.json`;
        
        // Create a new array with formatted messages
        const formattedChatHistory = chatHistory.map(message => {
            if (message.role === 'assistant') {
                return {
                    role: message.role,
                    content: message.content,
                    model: message.model || 'unknown' // Add model information
                };
            }
            return message;
        });

        const chatLogJson = JSON.stringify(formattedChatHistory, null, 2);

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