
import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
import { GoogleGenAI } from "@google/genai";

const PROSECUTOR_KEY = 'oyh_selected_prosecutor';
const API_KEY = "AIzaSyAUmC9UftOENS_Rl-o9_AqPwHPmTuUb2zE";


const VsAiPage = () => {
  const [debateHistory, setDebateHistory] = useState([]);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gameData, setGameData] = useState({ topic: '', prosecutor: null });
  const [objectionVisual, setObjectionVisual] = useState({ show: false, speaker: '' });
  const prosecutorChatRef = useRef(null);
  const judgeChatRef = useRef(null);
  const dialogueEndRef = useRef(null);

  useEffect(() => {
    // Check for prosecutor selection first
    const selectedProsecutorJSON = sessionStorage.getItem(PROSECUTOR_KEY);
    if (!selectedProsecutorJSON) {
        window.location.href = '/prosecutor-selection.html';
        return;
    }
    const prosecutor = JSON.parse(selectedProsecutorJSON);

    if (!API_KEY || API_KEY === "YOUR_API_KEY_HERE") {
        setError("Configuration Needed: Open 'index.js' and replace 'YOUR_API_KEY_HERE' with your actual API key. The key must be placed inside the quotation marks to be a valid string.");
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
            
            setGameData({ topic: selectedTopic, prosecutor: prosecutor });

            const ai = new GoogleGenAI({ apiKey: API_KEY });
            
            // Initialize Prosecutor AI with selected personality
            const prosecutorSystemInstruction = prosecutor.systemInstruction.replace('{TOPIC}', selectedTopic);
            
            prosecutorChatRef.current = ai.chats.create({
                model: "gemini-2.5-flash",
                config: { systemInstruction: prosecutorSystemInstruction },
            });

            // Initialize Judge AI
            judgeChatRef.current = ai.chats.create({
                 model: "gemini-2.5-flash",
                 config: {
                    systemInstruction: `You are an impartial, stern, and wise Judge in a courtroom parody game. You do not participate in the debate. Your ONLY function is to rule on objections. When you receive a prompt detailing an objection, you must respond with ONLY ONE of two words: "Sustained." or "Overruled.". This must be followed by a single, brief sentence explaining your reasoning. Do not add any other pleasantries, greetings, or text. Your entire response must be in the format: "[Ruling]. [Justification sentence]". For example: "Sustained. The prosecutor is badgering the witness." or "Overruled. The defense's point is irrelevant to the current argument."`,
                 }
            });

            setDebateHistory([
                {
                    speaker: "Judge",
                    text: `Court is now in session. Today's topic: ${selectedTopic}`,
                },
                {
                    speaker: "Judge",
                    text: `The prosecution will be handled by ${prosecutor.name}.`
                }
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

  const triggerObjectionAnimation = (speaker) => {
    return new Promise(resolve => {
        setObjectionVisual({ show: true, speaker: speaker });
        setTimeout(() => {
            setObjectionVisual({ show: false, speaker: '' });
            resolve(); 
        }, 2500);
    });
  };

  const handleProsecutorResponse = async (prompt) => {
    try {
      const response = await prosecutorChatRef.current.sendMessage({ message: prompt });
      const responseText = response.text.trim();

      if (responseText.startsWith('[OBJECTION]')) {
          const reason = responseText.replace('[OBJECTION]', '').trim();
          
          await triggerObjectionAnimation('Prosecutor');

          setDebateHistory(prev => [...prev, { speaker: gameData.prosecutor.name, text: `(Objects) ${reason}` }]);

          const lastPlayerStatement = debateHistory.slice().reverse().find(m => m.speaker === 'Defense')?.text || "The defense's previous statement.";

          const judgePrompt = `The defense's last statement was: "${lastPlayerStatement}". The prosecution objects, stating: "${reason}". Rule on this objection.`;
          const judgeResponse = await judgeChatRef.current.sendMessage({ message: judgePrompt });
          const judgeRuling = { speaker: "Judge", text: judgeResponse.text };
          setDebateHistory(prev => [...prev, judgeRuling]);
          
      } else {
          const aiMessage = { speaker: gameData.prosecutor.name, text: responseText };
          setDebateHistory((prev) => [...prev, aiMessage]);
      }
    } catch (error) {
      console.error("Error sending message to prosecutor:", error);
      const errorMessage = {
        speaker: "System Alert",
        text: "The API call failed. This is likely due to an invalid or disabled API key. Please verify your key is correct and has the Gemini API enabled in your Google AI Studio dashboard.",
      };
      setDebateHistory((prev) => [...prev, errorMessage]);
    }
  };

  const handlePresentArgument = async () => {
    if (!userInput.trim() || isLoading || !prosecutorChatRef.current) return;

    setIsLoading(true);
    const userMessage = { speaker: "Defense", text: userInput };
    setDebateHistory((prev) => [...prev, userMessage]);
    const prompt = userInput;
    setUserInput("");
    await handleProsecutorResponse(prompt);
    setIsLoading(false);
  };

  const handleObjection = async () => {
    if (isLoading || !judgeChatRef.current || !prosecutorChatRef.current) return;
    
    setIsLoading(true);
    const objectionReason = userInput;
    const lastProsecutorStatement = debateHistory.slice().reverse().find(m => m.speaker === gameData.prosecutor.name)?.text;

    if (!lastProsecutorStatement) {
        const errorMessage = { speaker: "Judge", text: "There is nothing to object to!" };
        setDebateHistory(prev => [...prev, errorMessage]);
        setIsLoading(false);
        return;
    }
    
    await triggerObjectionAnimation('Defense');

    setDebateHistory(prev => [
        ...prev,
        { speaker: "Defense", text: `(Objects) ${objectionReason}` }
    ]);
    setUserInput("");

    // 1. Get the Judge's ruling
    const judgePrompt = `The prosecution's last statement was: "${lastProsecutorStatement}". The defense objects, stating: "${objectionReason}". Rule on this objection.`;
    const judgeResponse = await judgeChatRef.current.sendMessage({ message: judgePrompt });
    const judgeRuling = { speaker: "Judge", text: judgeResponse.text };
    setDebateHistory(prev => [...prev, judgeRuling]);

    // 2. Inform the prosecutor of the ruling and get their reaction
    const prosecutorPrompt = `The Judge has just ruled on an objection to your last statement. The ruling was: "${judgeResponse.text}". Acknowledge the ruling and continue your argument based on it.`;
    await handleProsecutorResponse(prosecutorPrompt);
    
    setIsLoading(false);
  };

  const getSpeakerClass = (speaker) => {
    if (speaker === "Defense") return "text-blue-400";
    if (speaker === "Judge") return "text-yellow-300";
    if (speaker === "System Alert" || speaker === "Error") return "text-orange-500";
    if (speaker === gameData.prosecutor?.name) return "text-red-400";
    return "text-gray-300";
  };
  
  const canObject = !isLoading && !!userInput.trim() && debateHistory.length > 0 && debateHistory[debateHistory.length - 1]?.speaker === gameData.prosecutor?.name;
  
  if (error) {
    return React.createElement('div', { className: "text-center w-full max-w-4xl" },
        React.createElement('h2', { className: "text-2xl md:text-3xl font-bold mb-6 text-center title-text", style: { textShadow: '4px 4px 0 #000' } }, "Configuration Error"),
        React.createElement('div', { className: "w-full h-auto bg-gray-900 bg-opacity-75 border-4 border-white p-6 text-lg md:text-xl leading-relaxed" },
            React.createElement('p', { className: "text-orange-500 font-bold" }, error)
        )
    );
  }

  if (!gameData.topic || !gameData.prosecutor) {
    return React.createElement('div', { className: "text-center w-full max-w-4xl" },
        React.createElement('h2', { className: "text-2xl md:text-3xl font-bold mb-6 text-center title-text", style: { textShadow: '4px 4px 0 #000' } }, "Loading Courtroom..."),
        React.createElement('div', { className: "w-full h-auto bg-gray-900 bg-opacity-75 border-4 border-white p-6 text-lg md:text-xl leading-relaxed" },
            React.createElement('p', null, "The court is preparing for today's proceedings. Please wait.")
        )
    );
  }

  return React.createElement(React.Fragment, null,
    objectionVisual.show && React.createElement('div', { className: 'objection-overlay' },
      React.createElement('span', { className: `objection-text ${objectionVisual.speaker === 'Defense' ? 'objection-defense' : 'objection-prosecutor'}` }, 'OBJECTION!')
    ),

    React.createElement('h2', {
        className: "text-2xl md:text-3xl font-bold mb-6 text-center title-text",
        style: { textShadow: '4px 4px 0 #000' }
    }, `Topic: ${gameData.topic}`),

    React.createElement('div', {
        id: "courtroom-scene",
        className: "relative w-full max-w-4xl h-48 md:h-64 mb-6 bg-gray-700 border-4 border-black rounded-lg"
    },
        React.createElement('div', { className: "absolute top-2 left-1/2 -translate-x-1/2 w-24 h-16 bg-gray-800 border-4 border-black rounded-t-lg flex items-center justify-center text-xs text-center p-1" }, "Judge's Bench"),
        React.createElement('div', { className: "absolute bottom-2 left-8 w-40 h-20 bg-blue-800 border-4 border-black rounded-lg flex items-center justify-center text-center p-2" }, "Defense Bench"),
        React.createElement('div', { id: "prosecution-bench", className: "absolute bottom-2 right-8 w-40 h-20 bg-red-800 border-4 border-black rounded-lg flex items-center justify-center text-center p-2 text-sm" }, `Prosecutor: ${gameData.prosecutor.name}`)
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
        isLoading && debateHistory.length > 1 && !objectionVisual.show ? React.createElement('div', { className: "mb-4" },
            React.createElement('span', { className: "font-bold text-red-400" }, `${gameData.prosecutor.name} is thinking...`),
        ) : null,
        React.createElement('div', { ref: dialogueEndRef })
    ),

    React.createElement('div', {
        className: "w-full max-w-4xl mt-6"
    },
        React.createElement('textarea', {
            id: "argument-input",
            value: userInput,
            onChange: e => setUserInput(e.target.value),
            className: "form-input w-full h-28 resize-none text-lg",
            placeholder: "Your argument or objection reason...",
            disabled: isLoading || !prosecutorChatRef.current,
            'aria-label': "Your argument or objection reason"
        }),
        React.createElement('div', { className: "flex justify-between items-center mt-4" },
            React.createElement('button', {
                type: "button",
                onClick: handleObjection,
                className: "btn text-3xl md:text-5xl !py-4 !px-8 border-red-500 !text-red-500 hover:!border-red-400 hover:!text-red-400",
                style: { boxShadow: '6px 6px 0px #5B21B6' },
                disabled: !canObject
            }, "OBJECTION!"),
            React.createElement('button', {
                type: "button",
                onClick: handlePresentArgument,
                className: "btn text-xl md:text-2xl",
                disabled: isLoading || !userInput.trim() || !prosecutorChatRef.current
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