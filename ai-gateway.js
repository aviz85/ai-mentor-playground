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

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function generateResponse(provider, model, messages, systemPrompt, retries = 3) {
    try {
        if (provider === 'anthropic') {
            let anthropicMessages = messages
                .filter(msg => msg.role !== 'system')
                .map(({ role, content }) => ({ role, content })); // Remove any extra fields like 'model'
            
            const requestBody = {
                model: model,
                messages: anthropicMessages,
                system: systemPrompt,
                max_tokens: 1000
            };

            console.log('Anthropic API Request:');
            console.log(JSON.stringify(requestBody, null, 2));

            const response = await axios.post('https://api.anthropic.com/v1/messages', requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': process.env.ANTHROPIC_API_KEY,
                    'anthropic-version': '2023-06-01'
                }
            });

            console.log('Anthropic API Response:');
            console.log(JSON.stringify(response.data, null, 2));

            return response.data.content[0].text;
        } else if (provider === 'openai') {
            const requestBody = {
                model: model,
                messages: messages,
                max_tokens: 1000
            };

            console.log('OpenAI API Request:');
            console.log(JSON.stringify(requestBody, null, 2));

            const response = await axios.post('https://api.openai.com/v1/chat/completions', requestBody, {
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                }
            });

            console.log('OpenAI API Response:');
            console.log(JSON.stringify(response.data, null, 2));

            return response.data.choices[0].message.content;
        } else {
            throw new Error(`Unsupported provider: ${provider}`);
        }
    } catch (error) {
        if (error.response && error.response.status === 529 && retries > 0) {
            console.log(`Anthropic API overloaded. Retrying in ${2 ** (3 - retries)} seconds...`);
            await sleep(2 ** (3 - retries) * 1000);
            return generateResponse(provider, model, messages, systemPrompt, retries - 1);
        }
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