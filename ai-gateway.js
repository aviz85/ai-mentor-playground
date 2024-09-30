const { Configuration, OpenAIApi } = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const dotenv = require('dotenv');
const axios = require('axios');

dotenv.config();

const openaiConfiguration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(openaiConfiguration);

const anthropic = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
});

const OPENAI_MODELS = [
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4-turbo',
    'gpt-4',
    'gpt-3.5-turbo',
];

const ANTHROPIC_MODELS = [
    'claude-3-5-sonnet-20240620',
    'claude-3-opus-20240229',
    'claude-3-sonnet-20240229',
    'claude-3-haiku-20240307',
];

async function generateResponse(provider, model, messages, systemPrompt) {
    try {
        if (provider === 'anthropic') {
            const anthropicMessages = messages.filter(msg => msg.role !== 'system');
            const response = await axios.post('https://api.anthropic.com/v1/messages', {
                model: model,
                messages: anthropicMessages,
                system: systemPrompt,
                max_tokens: 1000
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': process.env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01'
                }
            });
            return response.data.content[0].text;
        } else if (provider === 'openai') {
            const response = await axios.post('https://api.openai.com/v1/chat/completions', {
                model: model,
                messages: messages.map(({ role, content }) => ({ role, content })),
                max_tokens: 1000
            }, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                }
            });
            return response.data.choices[0].message.content;
        } else {
            throw new Error(`Unsupported provider: ${provider}`);
        }
    } catch (error) {
        console.error(`Error in generateResponse for ${provider}:`, error.response ? error.response.data : error.message);
        throw error;
    }
}

async function compareResponses(providers, models, messages, systemPrompt) {
    const results = await Promise.all(
        providers.map((provider, index) => 
            generateResponse(provider, models[index], messages, systemPrompt)
        )
    );
    return results;
}

module.exports = {
    generateResponse,
    compareResponses,
    OPENAI_MODELS,
    ANTHROPIC_MODELS,
};