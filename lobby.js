
const authGate = document.getElementById('auth-gate');
const lobbyContent = document.getElementById('lobby-content');
const usernameDisplay = document.getElementById('username-display');
const createGameBtn = document.getElementById('create-game-btn');
const gameListContainer = document.getElementById('game-list');
const loadingGamesP = document.getElementById('loading-games');
const errorP = document.getElementById('lobby-error');

let pollingInterval = null;
let currentUser = null;

const displayError = (message) => {
    errorP.textContent = message;
}

const renderGameList = (games) => {
    if (!games || games.length === 0) {
        gameListContainer.innerHTML = '<p class="text-gray-400">No open games found. Why not create one?</p>';
        return;
    }

    gameListContainer.innerHTML = ''; // Clear previous list
    let joinableGamesFound = false;
    games.forEach(game => {
        // Don't show your own waiting games in the list to join
        if (game.host_id === currentUser.id) return;
        joinableGamesFound = true;

        const gameItem = document.createElement('div');
        gameItem.className = 'game-list-item';
        gameItem.innerHTML = `
            <div>
                <p class="font-bold">${game.host.username}'s Game</p>
                <p class="text-xs text-gray-400 mt-1">Topic: ${game.topic}</p>
            </div>
            <button class="btn btn-sm join-btn" data-game-id="${game.id}">Join</button>
        `;
        gameListContainer.appendChild(gameItem);
    });
    
    if (!joinableGamesFound) {
         gameListContainer.innerHTML = '<p class="text-gray-400">No open games to join. Create one or wait for an opponent.</p>';
    }

    document.querySelectorAll('.join-btn').forEach(button => {
        button.addEventListener('click', handleJoinGame);
    });
};

const fetchAndRenderGames = async () => {
    try {
        loadingGamesP.textContent = "Loading open games...";
        const openGames = await window.getOpenGames();
        renderGameList(openGames);
    } catch (error) {
        console.error('Error fetching games:', error);
        displayError('Could not fetch open games.');
        loadingGamesP.textContent = "Error loading games.";
    }
};

const initializeLobby = () => {
    currentUser = window.getCurrentUser();

    if (!currentUser) {
        authGate.style.display = 'block';
        lobbyContent.classList.add('hidden');
        return;
    }

    authGate.style.display = 'none';
    lobbyContent.classList.remove('hidden');
    usernameDisplay.textContent = currentUser.username;

    // Fetch games immediately and then start polling
    fetchAndRenderGames();
    pollingInterval = setInterval(fetchAndRenderGames, 5000);
};

const handleCreateGame = async () => {
    createGameBtn.disabled = true;
    createGameBtn.textContent = 'Creating...';
    displayError('');

    try {
        const newGame = await window.createGame();
        if (newGame && newGame.id) {
            window.location.href = `/human-vs-human.html?id=${newGame.id}`;
        } else {
            throw new Error("Failed to get a valid game ID from the server.");
        }
    } catch (error) {
        console.error('Error creating game:', error);
        displayError(error.message || 'Could not create game.');
        createGameBtn.disabled = false;
        createGameBtn.textContent = 'Create New Game';
    }
};

const handleJoinGame = async (event) => {
    const gameId = event.target.getAttribute('data-game-id');
    event.target.disabled = true;
    event.target.textContent = 'Joining...';
    displayError('');

    try {
        const joinedGame = await window.joinGame(gameId);
        if (joinedGame && joinedGame.id) {
            window.location.href = `/human-vs-human.html?id=${joinedGame.id}`;
        } else {
             throw new Error("Could not join the game.");
        }
    } catch (error) {
        console.error('Error joining game:', error);
        displayError(error.message || 'Could not join game. It might have been taken.');
        // Re-render to update list in case the game was just taken
        fetchAndRenderGames();
    }
};

createGameBtn.addEventListener('click', handleCreateGame);
initializeLobby();

// Clean up subscription when the user navigates away
window.addEventListener('beforeunload', () => {
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }
});
