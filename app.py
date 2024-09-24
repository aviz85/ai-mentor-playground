from flask import Flask, render_template, request, jsonify
import openai
from dotenv import load_dotenv
import os

# Load environment variables from .env file
load_dotenv()

app = Flask(__name__)
openai.api_key = os.getenv('OPENAI_API_KEY')

# Buffer to store the last 20 messages
chat_history = []

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/chat', methods=['POST'])
def chat():
    global chat_history
    user_message = request.json.get('message')
    system_prompt = request.json.get('system_prompt')
    variables = request.json.get('variables', {})

    # Replace variables in the system prompt
    for key, value in variables.items():
        system_prompt = system_prompt.replace(f"${{{key}}}", value)

    # Add user message to chat history
    chat_history.append({"role": "user", "content": user_message})

    # Keep only the last 20 messages
    if len(chat_history) > 20:
        chat_history = chat_history[-20:]

    # Prepare messages for OpenAI API
    messages = [{"role": "system", "content": system_prompt}] + chat_history

    # Call OpenAI API
    response = openai.ChatCompletion.create(
        model="gpt-3.5-turbo",
        messages=messages
    )

    # Get the assistant's reply
    assistant_message = response.choices[0].message['content']

    # Add assistant message to chat history
    chat_history.append({"role": "assistant", "content": assistant_message})

    # Keep only the last 20 messages
    if len(chat_history) > 20:
        chat_history = chat_history[-20:]

    return jsonify({"message": assistant_message})

if __name__ == '__main__':
    app.run(debug=True)