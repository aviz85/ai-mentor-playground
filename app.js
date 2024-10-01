const express = require('express');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs').promises;
const path = require('path');
const { generateResponse, compareResponses, OPENAI_MODELS, ANTHROPIC_MODELS } = require('./ai-gateway');

dotenv.config();

const app = express();
app.use(bodyParser.json());
app.use(express.static('public'));

// Object to store conversation buffers for each model
const modelBuffers = {};

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
    console.log('\n--- New Chat Request ---\n');
    
    const userMessage = req.body.message;
    const systemPrompt = req.body.system_prompt || "You are a helpful AI assistant.";
    const provider = req.body.provider;
    const model = req.body.model;
    const modelKey = `${provider}-${model}`;

    // Initialize buffer for this model if it doesn't exist
    if (!modelBuffers[modelKey]) {
        modelBuffers[modelKey] = [];
    }

    // Add timestamp to user message
    const userMessageWithTimestamp = {
        role: 'user',
        content: userMessage,
        timestamp: new Date().toISOString()
    };

    // Prepare messages for AI API (without timestamps)
    let messages = [
        { role: 'system', content: systemPrompt },
        ...modelBuffers[modelKey].map(msg => ({ role: msg.role, content: msg.content })),
        { role: 'user', content: userMessage }
    ];

    try {
        const assistantMessage = await generateResponse(provider, model, messages, systemPrompt);

        // Add timestamp to assistant message
        const assistantMessageWithTimestamp = {
            role: 'assistant',
            content: assistantMessage,
            timestamp: new Date().toISOString()
        };

        // Add the new question-answer pair to the buffer
        modelBuffers[modelKey].push(userMessageWithTimestamp);
        modelBuffers[modelKey].push(assistantMessageWithTimestamp);

        // Keep only the last 10 messages
        if (modelBuffers[modelKey].length > 20) {
            modelBuffers[modelKey] = modelBuffers[modelKey].slice(-20);
        }

        res.json({ message: assistantMessage });
    } catch (error) {
        console.error('Error calling AI API:', error.message);
        res.status(500).json({ error: `Failed to get response from AI API: ${error.message}` });
    }
});

// Comparison route
app.post('/compare', async (req, res) => {
    const userMessage = req.body.message;
    const providers = req.body.providers;
    const models = req.body.models;
    const systemPrompt = req.body.system_prompt || "You are a helpful AI assistant.";

    try {
        const results = await Promise.all(providers.map(async (provider, index) => {
            const model = models[index];
            const modelKey = `${provider}-${model}`;

            // Initialize buffer for this model if it doesn't exist
            if (!modelBuffers[modelKey]) {
                modelBuffers[modelKey] = [];
            }

            // Prepare messages for this model
            let messages = [
                { role: 'system', content: systemPrompt },
                ...modelBuffers[modelKey],
                { role: 'user', content: userMessage }
            ];

            const response = await generateResponse(provider, model, messages, systemPrompt);

            // Update the buffer for this model
            modelBuffers[modelKey].push({ role: 'user', content: userMessage });
            modelBuffers[modelKey].push({ role: 'assistant', content: response });

            // Keep only the last 10 messages
            if (modelBuffers[modelKey].length > 20) {
                modelBuffers[modelKey] = modelBuffers[modelKey].slice(-20);
            }

            return response;
        }));

        res.json({ results });
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
app.get('/export', async (req, res) => {
    try {
        const exportDir = path.join(__dirname, 'exports');
        
        // Create the export directory if it doesn't exist
        await fs.mkdir(exportDir, { recursive: true });

        const exportedFiles = [];

        // Create a file for each model's conversation
        for (const [modelKey, buffer] of Object.entries(modelBuffers)) {
            if (buffer.length > 0) {
                const firstMessageTime = new Date(buffer[0].timestamp).toISOString().replace(/[:\.]/g, '-');
                const filename = `${firstMessageTime}_${modelKey}.json`;
                const filePath = path.join(exportDir, filename);
                
                const chatLogJson = JSON.stringify(buffer, null, 2);
                await fs.writeFile(filePath, chatLogJson);

                exportedFiles.push(filename);
            }
        }

        if (exportedFiles.length === 0) {
            res.status(404).json({ error: 'No chat logs to export' });
            return;
        }

        res.json({ 
            message: 'Chat logs exported successfully', 
            exportedFiles: exportedFiles 
        });
    } catch (error) {
        console.error('Error exporting chat log:', error.message);
        res.status(500).json({ error: 'Failed to export chat log' });
    }
});

// Clear chat history route
app.post('/clear', (req, res) => {
    try {
        modelBuffers = {};
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