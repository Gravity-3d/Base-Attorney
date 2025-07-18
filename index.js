
import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { GoogleGenAI } from "@google/genai";

// This is a placeholder for the API key.
// For this application to work, you must replace "YOUR_API_KEY_HERE"
// with a valid API key from Google AI Studio.
const API_KEY = "AIzaSyAUmC9UftOENS_Rl-o9_AqPwHPmTuUb2zE";


const VsAiPage = () => {
  const [debateHistory, setDebateHistory] = useState([]);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [topic, setTopic] = useState("");
  const chatRef = useRef(null);
  const dialogueEndRef = useRef(null);

  useEffect(() => {
    if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") {
        setError("Configuration Needed: Open 'index.js' and replace 'YOUR_API_KEY_HERE' with your actual API key. You are correct, the key must be placed inside the quotation marks to be a valid string.");
        setDebateHistory([]);
        return;
    }

    const initializeGame = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/topics.json');
            if (!response.ok) {
                throw new Error(`Failed to fetch topics: ${response.statusText}`);
            }
            const data = await response.json();
            const topics = data.topics;
            const selectedTopic = topics[Math.floor(Math.random() * topics.length)];
            setTopic(selectedTopic);

            const ai = new GoogleGenAI({ apiKey: API_KEY });
            chatRef.current = ai.chats.create({
                model: "gemini-2.5-flash",
                config: {
                systemInstruction:
                    `You are a ruthless, cunning, and slightly dramatic prosecutor in a courtroom parody game. Your name is Miles Edgeworth. The user is the defense attorney. The debate topic is: "${selectedTopic}". Your goal is to argue against the user's position on this topic with sharp logic and flair. Keep your responses dramatic, in character, and relatively short (2-4 sentences). Never break character. If the user says 'OBJECTION!', you must react to their interruption, re-evaluating your last statement or countering their objection with dramatic flair.`,
                },
            });

            setDebateHistory([
                {
                speaker: "Judge",
                text: `Court is now in session. Today's topic: ${selectedTopic}`,
                },
            ]);
            setError(null);
        } catch (e) {
            console.error("Game Initialization Error:", e);
            setError("An unexpected error occurred during game setup. Failed to fetch topics or initialize AI.");
        } finally {
            setIsLoading(false);
        }
    };

    initializeGame();

  }, []);

  useEffect(() => {
    // Scroll to the bottom of the dialogue box
    dialogueEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [debateHistory]);

  const handleAiResponse = async (prompt) => {
    setIsLoading(true);
    try {
      const response = await chatRef.current.sendMessage({ message: prompt });
      const aiMessage = { speaker: "Prosecutor", text: response.text };
      setDebateHistory((prev) => [...prev, aiMessage]);
    } catch (error) {
      console.error("Error sending message:", error);
      const errorMessage = {
        speaker: "System Alert",
        text: "The API call failed. This is likely due to an invalid or disabled API key. Please verify your key is correct and has the Gemini API enabled in your Google AI Studio dashboard.",
      };
      setDebateHistory((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!userInput.trim() || isLoading || !chatRef.current) return;

    const userMessage = { speaker: "Defense", text: userInput };
    setDebateHistory((prev) => [...prev, userMessage]);
    const prompt = userInput;
    setUserInput("");
    await handleAiResponse(prompt);
  };

  const handleObjection = async () => {
    if (isLoading || !chatRef.current) return;

    // An objection is most effective against the prosecutor's last statement.
    const lastSpeaker = debateHistory[debateHistory.length - 1]?.speaker;
    if (lastSpeaker !== 'Prosecutor') {
        // Optional: Add a message that you can't object to yourself or the judge.
        const tempMessage = { speaker: "Judge", text: "You can't object right now!" };
        setDebateHistory(prev => [...prev, tempMessage]);
        setTimeout(() => setDebateHistory(prev => prev.slice(0, -1)), 2000);
        return;
    }
    
    const objectionMessage = { speaker: "Defense", text: "OBJECTION!" };
    setDebateHistory((prev) => [...prev, objectionMessage]);
    await handleAiResponse("OBJECTION! I challenge your last statement. Re-evaluate your position or counter my objection with dramatic flair.");
  };

  const getSpeakerClass = (speaker) => {
    switch (speaker) {
      case "Defense":
        return "text-blue-400";
      case "Prosecutor":
        return "text-red-400";
      case "Judge":
        return "text-yellow-300";
      case "System Alert":
      case "Error":
        return "text-orange-500";
      default:
        return "text-gray-300";
    }
  };
  
  if (error) {
    return React.createElement('div', { className: "text-center w-full max-w-4xl" },
        React.createElement('h2', { className: "text-2xl md:text-3xl font-bold mb-6 text-center title-text", style: { textShadow: '4px 4px 0 #000' } }, "Configuration Needed"),
        React.createElement('div', { className: "w-full h-auto bg-gray-900 bg-opacity-75 border-4 border-white p-6 text-lg md:text-xl leading-relaxed" },
            React.createElement('p', { className: "text-orange-500 font-bold" }, error)
        )
    );
  }

  if (!topic) {
    return React.createElement('div', { className: "text-center w-full max-w-4xl" },
        React.createElement('h2', { className: "text-2xl md:text-3xl font-bold mb-6 text-center title-text", style: { textShadow: '4px 4px 0 #000' } }, "Choosing a Topic..."),
        React.createElement('div', { className: "w-full h-auto bg-gray-900 bg-opacity-75 border-4 border-white p-6 text-lg md:text-xl leading-relaxed" },
            React.createElement('p', null, "The court is deliberating on a suitably mundane topic for today's proceedings. Please wait.")
        )
    );
  }

  return React.createElement(React.Fragment, null,
    React.createElement('h2', {
        className: "text-2xl md:text-3xl font-bold mb-6 text-center title-text",
        style: { textShadow: '4px 4px 0 #000' }
    }, `Topic: ${topic}`),

    React.createElement('div', {
        id: "courtroom-scene",
        className: "relative w-full max-w-4xl h-48 md:h-64 mb-6 bg-gray-700 border-4 border-black rounded-lg"
    },
        React.createElement('div', { className: "absolute top-2 left-1/2 -translate-x-1/2 w-24 h-16 bg-gray-800 border-4 border-black rounded-t-lg flex items-center justify-center text-xs text-center p-1" }, "Judge's Bench"),
        React.createElement('div', { className: "absolute bottom-2 left-8 w-40 h-20 bg-blue-800 border-4 border-black rounded-lg flex items-center justify-center text-center p-2" }, "Defense Bench"),
        React.createElement('div', { className: "absolute bottom-2 right-8 w-40 h-20 bg-red-800 border-4 border-black rounded-lg flex items-center justify-center text-center p-2" }, "Prosecution Bench")
    ),

    React.createElement('div', {
        id: "dialogue-box",
        className: "w-full max-w-4xl h-72 bg-gray-900 bg-opacity-75 border-4 border-white p-4 overflow-y-auto text-lg md:text-xl leading-relaxed"
    },
        debateHistory.map((entry, index) =>
            React.createElement('div', { key: index, className: "mb-4" },
                React.createElement('span', { className: `font-bold ${getSpeakerClass(entry.speaker)}` }, `${entry.speaker}:`),
                ` ${entry.text}`
            )
        ),
        isLoading && debateHistory.length > 1 ? React.createElement('div', { className: "mb-4" },
            React.createElement('span', { className: "font-bold text-red-400" }, "Prosecutor:"),
            " Thinking..."
        ) : null,
        React.createElement('div', { ref: dialogueEndRef })
    ),

    React.createElement('form', {
        onSubmit: handleSubmit,
        className: "w-full max-w-4xl mt-6"
    },
        React.createElement('textarea', {
            id: "argument-input",
            value: userInput,
            onChange: e => setUserInput(e.target.value),
            className: "form-input w-full h-28 resize-none text-lg",
            placeholder: "Present your argument...",
            disabled: isLoading || !chatRef.current,
            'aria-label': "Your argument"
        }),
        React.createElement('div', { className: "flex justify-between items-center mt-4" },
            React.createElement('button', {
                type: "button",
                onClick: handleObjection,
                className: "btn text-3xl md:text-5xl !py-4 !px-8 border-red-500 !text-red-500 hover:!border-red-400 hover:!text-red-400",
                style: { boxShadow: '6px 6px 0px #5B21B6' },
                disabled: isLoading || !chatRef.current
            }, "OBJECTION!"),
            React.createElement('button', {
                type: "submit",
                className: "btn text-xl md:text-2xl",
                disabled: isLoading || !userInput.trim() || !chatRef.current
            }, isLoading ? "Waiting..." : "Present Argument")
        )
    )
  );
};

const container = document.getElementById('root');
if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(
        React.createElement(React.StrictMode, null, 
            React.createElement(VsAiPage)
        )
    );
}
