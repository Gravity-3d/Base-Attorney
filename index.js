

import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";
// Functions from api.js are now globally available in this script's scope
const { getCurrentUser, getAiResponse, updateStats, playUiSound } = window;


const PROSECUTOR_KEY = 'oyh_selected_prosecutor';

const JUDGE_SYSTEM_INSTRUCTION = `You are an impartial, stern, and wise Judge in a courtroom parody game. You have two distinct functions: ruling on objections and rendering a final verdict.
1.  **Ruling on Objections**: If the prompt asks you to "Rule on this objection", you must respond with ONLY ONE of two words: "Sustained." or "Overruled.". This must be followed by a single, brief sentence explaining your reasoning. Example: "Sustained. The prosecutor is badgering the witness."
2.  **Rendering a Final Verdict**: If the prompt asks you to "Render a final verdict", you must analyze the entire debate transcript provided. Based on the quality and persuasiveness of the arguments, you will declare a winner. Your response MUST begin with one of three phrases: "DEFENSE WINS.", "PROSECUTION WINS.", or "DEBATE CONTINUES.". This must be followed by a single, brief sentence summarizing your final decision. Example: "DEFENSE WINS. The defense successfully dismantled the prosecution's core argument." or "DEBATE CONTINUES. Both sides have made compelling points, but neither has landed a decisive blow."
Do not deviate from these formats. Do not add any other pleasantries, greetings, or text.`;


const VsAiPage = () => {
  const [debateHistory, setDebateHistory] = useState([]);
  const [userInput, setUserInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const [gameData, setGameData] = useState({ topic: '', prosecutor: null });
  const [flashVisual, setFlashVisual] = useState({ show: false, type: '', speaker: '' });
  const [gameState, setGameState] = useState('playing'); // playing, gameOver
  const [finalVerdict, setFinalVerdict] = useState({ winner: null, reason: '' });
  const [takeThatCounters, setTakeThatCounters] =useState({ player: 0, ai: 0 });
  const [attorneyName, setAttorneyName] = useState('the Defense Attorney');

  const dialogueEndRef = useRef(null);

  useEffect(() => {
    const selectedProsecutorJSON = sessionStorage.getItem(PROSECUTOR_KEY);
    if (!selectedProsecutorJSON) {
        window.location.href = '/prosecutor-selection.html';
        return;
    }
    const prosecutor = JSON.parse(selectedProsecutorJSON);
    
    const user = getCurrentUser();
    if (user && user.username) {
        setAttorneyName(user.username);
    }

    const initializeGame = async () => {
        setIsLoading(true);
        try {
            const response = await fetch('/topics.json');
            if (!response.ok) throw new Error(`Failed to fetch topics: ${response.statusText}`);
            
            const data = await response.json();
            const topics = data.topics;
            const selectedTopic = topics[Math.floor(Math.random() * topics.length)];
            
            setGameData({ topic: selectedTopic, prosecutor: prosecutor });

            setDebateHistory([
                { speaker: "Judge", text: `Court is now in session. Today's topic: ${selectedTopic}`},
                { speaker: "Judge", text: `The prosecution will be handled by ${prosecutor.name}.`}
            ]);
            setError(null);
        } catch (e) {
            console.error("Game Initialization Error:", e);
            setError("An unexpected error occurred during game setup. Failed to fetch topics.");
        } finally {
            setIsLoading(false);
        }
    };

    initializeGame();
  }, []);

  useEffect(() => {
    dialogueEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [debateHistory]);

  const triggerFlashAnimation = (type, speaker) => {
    return new Promise(resolve => {
        setFlashVisual({ show: true, type, speaker });
        setTimeout(() => {
            setFlashVisual({ show: false, type: '', speaker: '' });
            resolve(); 
        }, 2500);
    });
  };

  const handleEndGame = async (winner) => {
      setGameState('gameOver');
      setIsLoading(false);

      if (typeof getCurrentUser !== 'function' || typeof updateStats !== 'function') return;
      const user = getCurrentUser();
      if(user) {
        try {
          const result = winner === 'Defense' ? 'win' : 'loss';
          await updateStats(result);
        } catch(e) {
            console.error("Failed to update stats:", e.message);
            // Optionally, inform the user that stats couldn't be saved.
        }
      }
  };

  const handleVerdict = async (verdictText, originator) => {
      const parts = verdictText.split('.');
      const verdict = parts[0].trim().toUpperCase();
      const reason = parts.slice(1).join('.').trim();

      const newHistory = { speaker: "Judge", text: verdictText };
      setDebateHistory(prev => [...prev, newHistory]);
      setFinalVerdict({ winner: verdict.includes('DEFENSE') ? 'Defense' : 'Prosecutor', reason });


      if (verdict === 'DEFENSE WINS') {
          await handleEndGame('Defense');
      } else if (verdict === 'PROSECUTION WINS') {
          await handleEndGame('Prosecutor');
      } else { // DEBATE CONTINUES
          const newCounters = { ...takeThatCounters };
          let messageForProsecutor = '';
          
          if (originator === 'player') {
              newCounters.player++;
              if (newCounters.player >= 3) {
                  const loseReason = "The defense has exhausted its final arguments and failed to land a decisive blow. The court rules against you!";
                  setFinalVerdict({ winner: 'Prosecutor', reason: loseReason });
                  setDebateHistory(prev => [...prev, { speaker: "Judge", text: loseReason }]);
                  await handleEndGame('Prosecutor');
                  return;
              }
              messageForProsecutor = `The Judge has rejected the defense's attempt to end the debate, ruling: "${verdictText}". The defense has now tried this ${newCounters.player} time(s). Continue your counter-argument.`;
          } else { // originator === 'ai'
              newCounters.ai++;
               if (newCounters.ai >= 3) {
                  const winReason = "The prosecution has repeatedly failed to conclude the case. The court finds their desperation unconvincing and rules in your favor!";
                  setFinalVerdict({ winner: 'Defense', reason: winReason });
                  setDebateHistory(prev => [...prev, { speaker: "Judge", text: winReason }]);
                  await handleEndGame('Defense');
                  return;
              }
              messageForProsecutor = `The Judge has rejected your attempt to end the debate, ruling: "${verdictText}". You have now tried this ${newCounters.ai} time(s). Acknowledge this and continue your argument.`;
          }
          setTakeThatCounters(newCounters);
          await handleProsecutorResponse(messageForProsecutor, true);
      }
  };

  const callAI = async (persona, prompt, currentHistory) => {
      let systemInstruction;
      if (persona === 'judge') {
          systemInstruction = JUDGE_SYSTEM_INSTRUCTION;
      } else {
          systemInstruction = gameData.prosecutor.systemInstruction
              .replace('{TOPIC}', gameData.topic)
              .replace('{DEFENSE_ATTORNEY_NAME}', attorneyName);
      }
      
      try {
          const response = await getAiResponse(currentHistory, systemInstruction, prompt);
          return response.text;
      } catch (error) {
          console.error(`Error calling AI for ${persona}:`, error);
          setError(`The AI is unresponsive. Please check the server logs. (${error.message})`);
          throw error;
      }
  };

  const handleProsecutorResponse = async (prompt, isInternal = false) => {
    try {
      const currentHistory = debateHistory.filter(m => m.speaker !== 'System Alert');
      const responseText = await callAI('prosecutor', prompt, currentHistory);

      if (responseText.startsWith('[OBJECTION]')) {
          const reason = responseText.replace('[OBJECTION]', '').trim();
          await triggerFlashAnimation('objection', 'Prosecutor');
          setDebateHistory(prev => [...prev, { speaker: gameData.prosecutor.name, text: `(Objects) ${reason}` }]);
          
          const lastPlayerStatement = debateHistory.slice().reverse().find(m => m.speaker === 'Defense')?.text || "The defense's previous statement.";
          const judgePrompt = `The defense's last statement was: "${lastPlayerStatement}". The prosecution objects, stating: "${reason}". Rule on this objection.`;
          const judgeResponseText = await callAI('judge', judgePrompt, debateHistory);
          setDebateHistory(prev => [...prev, { speaker: "Judge", text: judgeResponseText }]);

      } else if (responseText.startsWith('[TAKE THAT!]')) {
          const finalArgument = responseText.replace('[TAKE THAT!]', '').trim();
          await triggerFlashAnimation('takethat', 'Prosecutor');
          setDebateHistory(prev => [...prev, { speaker: gameData.prosecutor.name, text: `(Attempts to conclude) ${finalArgument}` }]);
          
          const fullDebateText = debateHistory.map(d => `${d.speaker}: ${d.text}`).join('\n');
          const judgePrompt = `The prosecution is attempting to end the debate with this final statement: "${finalArgument}". Here is the full transcript of the debate so far:\n\n${fullDebateText}\n\nRender a final verdict.`;
          const judgeResponseText = await callAI('judge', judgePrompt, debateHistory);
          await handleVerdict(judgeResponseText, 'ai');

      } else {
          if(!isInternal) {
            setDebateHistory((prev) => [...prev, { speaker: gameData.prosecutor.name, text: responseText }]);
          }
      }
    } catch (error) {
        setDebateHistory((prev) => [...prev, { speaker: "System Alert", text: "The prosecutor AI call failed." }]);
    }
  };

  const submitToAI = async (type) => {
      if (!userInput.trim() || isLoading || gameState === 'gameOver') return;

      setIsLoading(true);
      const statement = userInput;
      setUserInput("");
      
      let newHistory = [...debateHistory];

      try {
        if (type === 'argument') {
            newHistory.push({ speaker: "Defense", text: statement });
            setDebateHistory(newHistory);
            await handleProsecutorResponse(statement);

        } else if (type === 'objection') {
            const lastProsecutorStatement = newHistory.slice().reverse().find(m => m.speaker === gameData.prosecutor.name)?.text;
            if (!lastProsecutorStatement) {
                setDebateHistory(prev => [...prev, { speaker: "Judge", text: "There is nothing to object to!" }]);
                setIsLoading(false);
                return;
            }
            await triggerFlashAnimation('objection', 'Defense');
            newHistory.push({ speaker: "Defense", text: `(Objects) ${statement}` });
            setDebateHistory(newHistory);
            
            const judgePrompt = `The prosecution's last statement was: "${lastProsecutorStatement}". The defense objects, stating: "${statement}". Rule on this objection.`;
            const judgeResponseText = await callAI('judge', judgePrompt, newHistory);
            newHistory.push({ speaker: "Judge", text: judgeResponseText });
            setDebateHistory([...newHistory]);
            
            const prosecutorPrompt = `The Judge has just ruled on an objection to your last statement. The ruling was: "${judgeResponseText}". Acknowledge the ruling and continue your argument.`;
            await handleProsecutorResponse(prosecutorPrompt, true);

        } else if (type === 'takethat') {
            await triggerFlashAnimation('takethat', 'Defense');
            newHistory.push({ speaker: "Defense", text: `(Attempts to conclude) ${statement}` });
            setDebateHistory(newHistory);
            
            const fullDebateText = newHistory.map(d => `${d.speaker}: ${d.text}`).join('\n');
            const judgePrompt = `The defense is attempting to end the debate with this final statement: "${statement}". Here is the full transcript of the debate so far:\n\n${fullDebateText}\n\nRender a final verdict.`;
            const judgeResponseText = await callAI('judge', judgePrompt, newHistory);
            await handleVerdict(judgeResponseText, 'player');
        }
      } catch (e) {
          // AI call errors are handled inside the callAI function by setting the error state
      } finally {
        if(gameState === 'playing') setIsLoading(false);
      }
  };
  
  const getSpeakerClass = (speaker) => {
    if (speaker === "Defense") return "text-blue-400";
    if (speaker === "Judge") return "text-yellow-300";
    if (speaker === "System Alert") return "text-orange-500";
    if (speaker === gameData.prosecutor?.name) return "text-red-400";
    return "text-gray-300";
  };
  
  const canObject = !isLoading && !!userInput.trim() && debateHistory.length > 0 && debateHistory[debateHistory.length - 1]?.speaker === gameData.prosecutor?.name;
  const canTakeThat = !isLoading && !!userInput.trim() && takeThatCounters.player < 3;

  const handleButtonClick = (action) => {
      if (typeof playUiSound === 'function') {
        playUiSound();
      }
      submitToAI(action);
  };

  if (error) {
    return React.createElement('div', { className: "text-center w-full max-w-4xl" },
        React.createElement('h2', { className: "text-2xl md:text-3xl font-bold mb-6 text-center title-text", style: { textShadow: '4px 4px 0 #000' } }, "System Error"),
        React.createElement('div', { className: "w-full h-auto bg-gray-900 bg-opacity-75 border-4 border-white p-6 text-lg md:text-xl leading-relaxed" },
            React.createElement('p', { className: "text-orange-500 font-bold" }, error)
        )
    );
  }
  if (!gameData.topic || !gameData.prosecutor) {
    return React.createElement('div', { className: "text-center w-full max-w-4xl" },
        React.createElement('h2', { className: "text-2xl md:text-3xl font-bold mb-6 text-center title-text", style: { textShadow: '4px 4px 0 #000' } }, "Loading Courtroom..."),
    );
  }

  return React.createElement(React.Fragment, null,
    flashVisual.show && React.createElement('div', { className: 'flash-overlay' },
      React.createElement('span', { className: `flash-text ${flashVisual.type === 'objection' ? (flashVisual.speaker === 'Defense' ? 'objection-defense' : 'objection-prosecutor') : 'takethat-flash'}` }, 
        flashVisual.type === 'objection' ? 'OBJECTION!' : 'TAKE THAT!'
      )
    ),

    gameState === 'gameOver' && React.createElement('div', { className: 'game-over-overlay' },
      React.createElement('div', { className: 'game-over-box' },
        React.createElement('h2', { className: `text-5xl md:text-7xl font-bold title-text mb-4 ${finalVerdict.winner === 'Defense' ? 'text-blue-400' : 'text-red-400'}`},
            finalVerdict.winner === 'Defense' ? 'YOU WIN!' : 'YOU LOSE!'
        ),
        React.createElement('p', { className: 'text-lg md:text-xl mb-8' }, `Judge's Reason: ${finalVerdict.reason}`),
        React.createElement('button', {
            onClick: () => window.location.reload(),
            className: 'btn text-xl md:text-2xl'
        }, 'Play Again')
      )
    ),

    React.createElement('h2', { className: "text-2xl md:text-3xl font-bold mb-6 text-center title-text", style: { textShadow: '4px 4px 0 #000' }}, `Topic: ${gameData.topic}`),
    React.createElement('div', { id: "courtroom-scene", className: "relative w-full max-w-4xl h-48 md:h-64 mb-6 bg-gray-700 border-4 border-black rounded-lg" },
        React.createElement('div', { className: "absolute top-2 left-1/2 -translate-x-1/2 w-24 h-16 bg-gray-800 border-4 border-black rounded-t-lg flex items-center justify-center text-xs text-center p-1" }, "Judge's Bench"),
        React.createElement('div', { className: "absolute bottom-2 left-8 w-40 h-20 bg-blue-800 border-4 border-black rounded-lg flex items-center justify-center text-center p-2" }, "Defense Bench"),
        React.createElement('div', { id: "prosecution-bench", className: "absolute bottom-2 right-8 w-40 h-20 bg-red-800 border-4 border-black rounded-lg flex items-center justify-center text-center p-2 text-sm" }, `Prosecutor: ${gameData.prosecutor.name}`)
    ),

    React.createElement('div', { id: "dialogue-box", className: "w-full max-w-4xl h-72 bg-gray-900 bg-opacity-75 border-4 border-white p-4 overflow-y-auto text-lg md:text-xl leading-relaxed" },
        debateHistory.map((entry, index) =>
            React.createElement('div', { key: index, className: "mb-4" },
                React.createElement('span', { className: `font-bold ${getSpeakerClass(entry.speaker)}` }, `${entry.speaker}:`),
                ` ${entry.text}`
            )
        ),
        isLoading && debateHistory.length > 1 && !flashVisual.show ? React.createElement('div', { className: "mb-4" },
            React.createElement('span', { className: "font-bold text-red-400" }, `${gameData.prosecutor.name} is thinking...`),
        ) : null,
        React.createElement('div', { ref: dialogueEndRef })
    ),

    React.createElement('div', { className: "w-full max-w-4xl mt-6" },
        React.createElement('textarea', { id: "argument-input", value: userInput, onChange: e => setUserInput(e.target.value), className: "form-input w-full h-28 resize-none text-lg", placeholder: "Your argument, objection reason, or final statement...", disabled: isLoading || gameState === 'gameOver', 'aria-label': "Your argument or objection reason" }),
        React.createElement('div', { className: "grid grid-cols-3 gap-4 items-center mt-4" },
            React.createElement('button', { type: "button", onClick: () => handleButtonClick('objection'), className: "btn text-2xl md:text-3xl !py-4 border-red-500 !text-red-500 hover:!border-red-400 hover:!text-red-400", style: { boxShadow: '6px 6px 0px #5B21B6' }, disabled: !canObject || gameState === 'gameOver'}, "OBJECTION!"),
            React.createElement('button', { type: "button", onClick: () => handleButtonClick('takethat'), className: "btn text-2xl md:text-3xl !py-4 border-yellow-400 !text-yellow-400 hover:!border-yellow-300 hover:!text-yellow-300", style: { boxShadow: '6px 6px 0px #000000' }, disabled: !canTakeThat || gameState === 'gameOver'}, "TAKE THAT!"),
            React.createElement('button', { type: "button", onClick: () => handleButtonClick('argument'), className: "btn text-lg md:text-xl", disabled: isLoading || !userInput.trim() || gameState === 'gameOver' }, isLoading ? "Waiting..." : "Present")
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