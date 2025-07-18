const { GoogleGenAI } = require("@google/genai");

const API_KEY = process.env.GEMINI_API_KEY;

exports.handler = async (event) => {
  // 1. Stricter method check
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }
  
  // 2. Stricter body and API key checks
  if (!API_KEY) {
     return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Server configuration error: API key not set.' })
    };
  }
  if (!event.body) {
    return { 
        statusCode: 400, 
        headers: { 'Content-Type': 'application/json' }, 
        body: JSON.stringify({ error: 'Request body is missing.' }) 
    };
  }

  try {
    const { history, systemInstruction, prompt } = JSON.parse(event.body);

    if (!prompt || !systemInstruction || !Array.isArray(history)) {
       return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid request body. Requires history, systemInstruction, and prompt.' })
      };
    }

    const ai = new GoogleGenAI({ apiKey: API_KEY });
    
    // Use the stateless `generateContent` for better reliability in a serverless environment.
    // Map the client-side history to the format Gemini expects.
    const contents = history.map(item => ({
        // Prosecutor/Judge are the 'model', Defense is the 'user'
        role: item.speaker === 'Defense' ? 'user' : 'model',
        parts: [{ text: item.text }]
    }));
    // Add the user's latest prompt to the end of the contents array.
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents, // The full conversation history + new prompt
        config: {
            systemInstruction: systemInstruction
        }
    });
    
    return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: response.text })
    };

  } catch (error) {
    console.error('AI Handler Error:', error);
    // Differentiate between JSON parsing errors and other errors
    if (error instanceof SyntaxError) {
        return {
          statusCode: 400,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Invalid JSON in request body.' })
        };
    }
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'An error occurred while communicating with the AI.' })
    };
  }
};