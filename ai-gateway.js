const { Configuration, OpenAIApi } = require('openai');
const Anthropic = require('@anthropic-ai/sdk');
const dotenv = require('dotenv');

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
    if (provider === 'openai') {
        const response = await openai.createChatCompletion({
            model: model,
            messages: [
                { role: 'system', content: systemPrompt },
                ...messages.filter(msg => msg.content.trim() !== '')
            ],
        });
        return response.data.choices[0].message.content;
    } else if (provider === 'anthropic') {
        const response = await anthropic.messages.create({
            model: model,
            max_tokens: 1024,
            system: systemPrompt,
            messages: messages.filter(msg => msg.content.trim() !== ''),
        });
        return response.content[0].text;
    } else {
        throw new Error('Invalid provider');
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