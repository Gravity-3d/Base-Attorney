import React, { useState, useEffect, useRef } from "react";
import ReactDOM from "react-dom/client";

const { getCurrentUser, sendGameUpdate, getGameState, joinGame, playUiSound } = window;

const VsHumanPage = () => {
    const [game, setGame] = useState(null);
    const [error, setError] = useState(null);
    const [isLoading, setIsLoading] = useState(false); // For local actions
    const [userInput, setUserInput] = useState("");
    const [currentUser, setCurrentUser] = useState(null);
    const [flashVisual, setFlashVisual] = useState({ show: false, type: '', speakerRole: '' });

    const dialogueEndRef = useRef(null);
    const gameIdRef = useRef(null);
    const pollingRef = useRef(null);
    
    useEffect(() => {
        const user = getCurrentUser();
        if (!user) {
            setError("You must be signed in to play.");
            window.location.href = '/sign-in.html';
            return;
        }
        setCurrentUser(user);

        const params = new URLSearchParams(window.location.search);
        const gameId = params.get('id');
        if (!gameId) {
            setError("No game ID found. Redirecting to lobby.");
            window.location.href = '/vs-human.html';
            return;
        }
        gameIdRef.current = gameId;

        let hasAttemptedJoin = false; // Flag to prevent multiple join attempts

        const fetchGameState = async () => {
            if (!gameIdRef.current) return;
            try {
                const updatedGame = await getGameState(gameIdRef.current);

                // If the game is waiting for an opponent and this user isn't the host, try to join.
                if (updatedGame && updatedGame.status === 'waiting' && updatedGame.host_id !== user.id && !hasAttemptedJoin) {
                    hasAttemptedJoin = true; // Set flag to prevent re-joining on every poll
                    try {
                        // Capture the result of joinGame and update state immediately.
                        const joinedGame = await joinGame(gameIdRef.current);
                        setGame(joinedGame); // This fixes the race condition.
                    } catch (joinError) {
                        setError(joinError.message || "Failed to join game. It may have been taken by another player.");
                        if (pollingRef.current) clearInterval(pollingRef.current); // Stop polling on join failure.
                    }
                } else {
                     setGame(updatedGame);
                }
                
                if (updatedGame && updatedGame.status === 'finished' && pollingRef.current) {
                    clearInterval(pollingRef.current);
                }
            } catch (err) {
                setError(err.message || "Failed to fetch game state. The game may no longer exist.");
                if (pollingRef.current) {
                    clearInterval(pollingRef.current);
                }
            }
        };

        // Initial fetch, then start polling
        fetchGameState();
        pollingRef.current = setInterval(fetchGameState, 3000);

        // Cleanup polling on component unmount
        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
            }
        };
    }, []);

    useEffect(() => {
        dialogueEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [game?.history]);

    const triggerFlashAnimation = (type, speakerRole) => {
        return new Promise(resolve => {
            setFlashVisual({ show: true, type, speakerRole });
            setTimeout(() => {
                setFlashVisual({ show: false, type: '', speakerRole: '' });
                resolve();
            }, 2500);
        });
    };

    const handlePlayerAction = async (actionType) => {
        if (!userInput.trim() || isLoading) return;
        setIsLoading(true);
        const text = userInput;
        setUserInput("");
        
        try {
            if (actionType === 'objection' || actionType === 'takethat') {
                const playerRole = game.defense_player_id === currentUser.id ? 'Defense' : 'Prosecution';
                await triggerFlashAnimation(actionType, playerRole);
            }
            // The polling mechanism will automatically fetch the result of our action.
            await sendGameUpdate(gameIdRef.current, actionType, text);
        } catch (e) {
            setError(e.message || `Failed to perform action: ${actionType}`);
            setUserInput(text); // Restore input if action failed
        } finally {
            setIsLoading(false);
        }
    };
    
    if (error) {
        return React.createElement('div', { className: "text-center w-full max-w-4xl" },
            React.createElement('h2', { className: "text-2xl md:text-3xl font-bold mb-6 text-center title-text", style: { textShadow: '4px 4px 0 #000' } }, "A Problem Occurred"),
            React.createElement('div', { className: "w-full h-auto bg-gray-900 bg-opacity-75 border-4 border-white p-6 text-lg md:text-xl leading-relaxed" },
                React.createElement('p', { className: "text-orange-500 font-bold" }, error)
            )
        );
    }
    
    if (!game) {
        return React.createElement('div', { className: "text-center w-full max-w-4xl" },
            React.createElement('h2', { className: "text-2xl md:text-3xl font-bold mb-6 text-center title-text", style: { textShadow: '4px 4px 0 #000' } }, "Loading Courtroom..."),
        );
    }

    if (game.status === 'waiting') {
        return React.createElement('div', { className: "text-center w-full max-w-4xl" },
            React.createElement('h2', { className: "text-2xl md:text-3xl font-bold mb-6 text-center title-text", style: { textShadow: '4px 4px 0 #000' } }, "Waiting for Opponent"),
            React.createElement('div', { className: "w-full h-auto bg-gray-900 bg-opacity-75 border-4 border-white p-6 text-lg md:text-xl leading-relaxed" },
                React.createElement('p', null, `Share this page's URL to invite someone to the game.`),
                React.createElement('p', {className: 'mt-4 text-yellow-300'}, `Topic: ${game.topic}`)
            )
        );
    }

    const playerRole = game.defense_player_id === currentUser.id ? 'Defense' : 'Prosecution';
    const opponentRole = playerRole === 'Defense' ? 'Prosecution' : 'Defense';
    const isMyTurn = game.current_turn === currentUser.id;
    const takeThatCount = game.take_that_counters?.[playerRole] || 0;
    
    const getSpeakerClass = (speakerRole) => {
        if (speakerRole === "Defense") return "text-blue-400";
        if (speakerRole === "Prosecution") return "text-red-400";
        if (speakerRole === "Judge") return "text-yellow-300";
        return "text-gray-300";
    };

    const getSpeakerName = (entry) => {
        if(entry.speakerRole === 'Defense') return game.defense_player_id === game.host_id ? game.host.username : game.opponent.username;
        if(entry.speakerRole === 'Prosecution') return game.prosecution_player_id === game.host_id ? game.host.username : game.opponent.username;
        return entry.speakerRole; // Judge
    }

    const canObject = isMyTurn && !!userInput.trim() && game.history.length > 0 && game.history[game.history.length - 1]?.speakerRole === opponentRole;
    const canTakeThat = isMyTurn && !!userInput.trim() && takeThatCount < 3;
    const isGameOver = game.status === 'finished';

    let gameOverMessage, gameOverReason;
    if (isGameOver) {
        const winnerId = game.winner_id;
        const won = winnerId === currentUser.id;
        gameOverMessage = won ? 'YOU WIN!' : 'YOU LOSE!';
        gameOverReason = game.verdict_reason || "The Judge has made a decision.";
    }

    const handleButtonClick = (action) => {
        // Sound effect is handled globally by api.js
        handlePlayerAction(action);
    };

    return React.createElement(React.Fragment, null,
        flashVisual.show && React.createElement('div', { className: 'flash-overlay' },
          React.createElement('span', { className: `flash-text ${flashVisual.type === 'objection' ? (flashVisual.speakerRole === 'Defense' ? 'objection-defense' : 'objection-prosecutor') : 'takethat-flash'}` }, 
            flashVisual.type === 'objection' ? 'OBJECTION!' : 'TAKE THAT!'
          )
        ),

        isGameOver && React.createElement('div', { className: 'game-over-overlay' },
            React.createElement('div', { className: 'game-over-box' },
                React.createElement('h2', { className: `text-5xl md:text-7xl font-bold title-text mb-4 ${gameOverMessage === 'YOU WIN!' ? 'text-blue-400' : 'text-red-400'}` }, gameOverMessage),
                React.createElement('p', { className: 'text-lg md:text-xl mb-8' }, `Judge's Reason: ${gameOverReason}`),
                React.createElement('a', { href: '/vs-human.html', className: 'btn text-xl md:text-2xl' }, 'Back to Lobby')
            )
        ),

        React.createElement('h2', { className: "text-2xl md:text-3xl font-bold mb-2 text-center title-text", style: { textShadow: '4px 4px 0 #000' } }, `Topic: ${game.topic}`),
        React.createElement('p', { className: 'text-center mb-6 text-base' }, `You are the ${playerRole}.`),


        React.createElement('div', { id: "courtroom-scene", className: "relative w-full max-w-4xl h-48 md:h-64 mb-6 bg-gray-700 border-4 border-black rounded-lg" },
            React.createElement('div', { className: "absolute top-2 left-1/2 -translate-x-1/2 w-24 h-16 bg-gray-800 border-4 border-black rounded-t-lg flex items-center justify-center text-xs text-center p-1" }, "Judge's Bench"),
            React.createElement('div', { className: `absolute bottom-2 left-8 w-40 h-20 bg-blue-800 border-4 border-black rounded-lg flex flex-col items-center justify-center text-center p-2 ${playerRole === 'Defense' ? 'border-yellow-300' : ''}` }, 
                React.createElement('span', { className: 'text-sm' }, 'Defense'),
                React.createElement('span', { className: 'text-xs truncate w-full' }, game.host && game.opponent ? (game.defense_player_id === game.host_id ? game.host.username : game.opponent.username) : '...')
            ),
            React.createElement('div', { id: "prosecution-bench", className: `absolute bottom-2 right-8 w-40 h-20 bg-red-800 border-4 border-black rounded-lg flex flex-col items-center justify-center text-center p-2 ${playerRole === 'Prosecution' ? 'border-yellow-300' : ''}` }, 
                 React.createElement('span', { className: 'text-sm' }, 'Prosecution'),
                 React.createElement('span', { className: 'text-xs truncate w-full' }, game.host && game.opponent ? (game.prosecution_player_id === game.host_id ? game.host.username : game.opponent.username) : '...')
            )
        ),

        React.createElement('div', { id: "dialogue-box", className: "w-full max-w-4xl h-72 bg-gray-900 bg-opacity-75 border-4 border-white p-4 overflow-y-auto text-lg md:text-xl leading-relaxed" },
            game.history.map((entry, index) =>
                React.createElement('div', { key: index, className: "mb-4" },
                    React.createElement('span', { className: `font-bold ${getSpeakerClass(entry.speakerRole)}` }, `${getSpeakerName(entry)}:`),
                    ` ${entry.text}`
                )
            ),
            !isMyTurn && !isGameOver ? React.createElement('div', { className: "mb-4" },
                React.createElement('span', { className: "font-bold text-gray-400" }, `Waiting for opponent...`),
            ) : null,
            React.createElement('div', { ref: dialogueEndRef })
        ),

        React.createElement('div', { className: "w-full max-w-4xl mt-6" },
            React.createElement('textarea', { value: userInput, onChange: e => setUserInput(e.target.value), className: "form-input w-full h-28 resize-none text-lg", placeholder: isMyTurn ? "Your argument, objection reason, or final statement..." : "Wait for your turn...", disabled: !isMyTurn || isLoading || isGameOver, 'aria-label': "Your argument or objection reason" }),
            React.createElement('div', { className: "grid grid-cols-3 gap-4 items-center mt-4" },
                React.createElement('button', { type: "button", onClick: () => handleButtonClick('objection'), className: "btn text-2xl md:text-3xl !py-4 border-red-500 !text-red-500 hover:!border-red-400 hover:!text-red-400", style: { boxShadow: '6px 6px 0px #5B21B6' }, disabled: !canObject || isLoading || isGameOver }, "OBJECTION!"),
                React.createElement('button', { type: "button", onClick: () => handleButtonClick('takethat'), className: "btn text-2xl md:text-3xl !py-4 border-yellow-400 !text-yellow-400 hover:!border-yellow-300 hover:!text-yellow-300", style: { boxShadow: '6px 6px 0px #000000' }, disabled: !canTakeThat || isLoading || isGameOver }, "TAKE THAT!"),
                React.createElement('button', { type: "button", onClick: () => handleButtonClick('present'), className: "btn text-lg md:text-xl", disabled: !isMyTurn || isLoading || !userInput.trim() || isGameOver }, isLoading ? "Sending..." : "Present")
            )
        )
    );
};

const container = document.getElementById('root');
if (container) {
    const root = ReactDOM.createRoot(container);
    root.render(
        React.createElement(React.StrictMode, null,
            React.createElement(VsHumanPage)
        )
    );
}