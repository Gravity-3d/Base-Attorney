import { GoogleGenAI } from "@google/genai";

const API_KEY = process.env.GEMINI_API_KEY;

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
  }

  if (!API_KEY) {
    return new Response(JSON.stringify({ error: 'API key is not configured on the server.' }), { status: 500 });
  }

  try {
    const { history, systemInstruction, prompt } = JSON.parse(req.body);

    if (!prompt || !systemInstruction || !Array.isArray(history)) {
       return new Response(JSON.stringify({ error: 'Invalid request body. Requires history, systemInstruction, and prompt.' }), { status: 400 });
    }

    const ai = new GoogleGenAI({ apiKey: API_KEY });
    
    // Convert our simple history format to the format Gemini expects
    const geminiHistory = history.map(item => ({
        // In Gemini, 'user' is the one prompting the model. 'model' is the AI's response.
        // We map Defense -> user, Prosecutor/Judge -> model
        role: item.speaker === 'Defense' ? 'user' : 'model',
        parts: [{ text: item.text }]
    }));

    const chat = ai.chats.create({
        model: "gemini-2.5-flash",
        config: { systemInstruction: systemInstruction },
        history: geminiHistory
    });

    const response = await chat.sendMessage({ message: prompt });
    const responseText = response.text.trim();
    
    return new Response(JSON.stringify({ text: responseText }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' }
    });

  } catch (error) {
    console.error('Gemini API Error:', error);
    return new Response(JSON.stringify({ error: 'An error occurred while communicating with the AI.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
