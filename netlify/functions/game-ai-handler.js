const { GoogleGenAI } = require("@google/genai");

const API_KEY = "AIzaSyBblZY0obeumRv2NTjp13km1C2Vwc95nXo";

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }
  
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
    
    const contents = history.map(item => ({
        role: item.speaker === 'Defense' ? 'user' : 'model',
        parts: [{ text: item.text }]
    }));
    contents.push({ role: 'user', parts: [{ text: prompt }] });

    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: contents,
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