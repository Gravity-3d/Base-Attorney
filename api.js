// --- Client-Side API Module ---

const USER_SESSION_KEY = 'oyh_user_session';

// --- UI Sound Effects ---
const UI_SOUND_B64 = 'data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YVEAAAAAAP9/AAAABwD/fQAABAAAAAAAAAAAAAAA//8A/38AAAEAAAAAAAAAAAAA/3wAAAEAAAAA/30AAAEAAAD/fAAAAQAAAAEAAAAAAAAA/3wAAAIAAAAA/30AAAD/fAAA//8AAAEAAAD/fQAAAgAAAP99AAAA//8AAAEAAAD/fQAAAgAAAP99AAAA//8AAAEAAAD/fQAAAgAAAP99AAAA//8AAAEAAAD/fQAAAgAAAP99AAAA//8AAAEAAAD/fQAAAgAAAP99AAAA//8AAAEAAAD/fQAAAgAAAP99AAAA//8=';
let uiAudio = null;
/**
 * Plays a short, retro-style UI sound effect.
 */
function playUiSound() {
    try {
        if (!uiAudio) {
            uiAudio = new Audio(UI_SOUND_B64);
            uiAudio.volume = 0.3;
        }
        // Allows playing the sound again before it has finished.
        uiAudio.currentTime = 0;
        uiAudio.play();
    } catch (e) {
        console.error("Could not play UI sound", e);
    }
}

// --- User & Session Management ---

/**
 * Stores user session data (user object and token) in localStorage.
 * @param {Object} sessionData - The session data from the login API.
 */
function saveUserSession(sessionData) {
  try {
    localStorage.setItem(USER_SESSION_KEY, JSON.stringify(sessionData));
  } catch (e) {
    console.error("Error saving user session to localStorage", e);
  }
}

/**
 * Retrieves the current user's session data from localStorage.
 * @returns {Object|null} The session object or null.
 */
function getUserSession() {
  try {
    const session = localStorage.getItem(USER_SESSION_KEY);
    return session ? JSON.parse(session) : null;
  } catch (e)
    {
    console.error("Error retrieving user session", e);
    return null;
  }
}

/**
 * Signs out the user by clearing their session data.
 */
function signOutUser() {
  try {
    localStorage.removeItem(USER_SESSION_KEY);
  } catch (e) {
    console.error("Error signing out user", e);
  }
}


/**
 * Gets just the user part of the session.
 * @returns {Object|null}
 */
function getCurrentUser() {
    const session = getUserSession();
    return session ? session.user : null;
}

// --- API Fetch Functions ---

/**
 * A helper function to handle fetch requests and responses.
 * @param {string} endpoint - The serverless function endpoint (e.g., '/api/auth-login').
 * @param {string} method - The HTTP method ('GET', 'POST', etc.).
 * @param {Object} [body] - The request payload for POST/PUT requests.
 * @param {string} [token] - The user's auth token.
 * @returns {Promise<Object>} The JSON response from the server.
 */
async function fetchApi(endpoint, method, body, token) {
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  if (token) {
    options.headers['Authorization'] = `Bearer ${token}`;
  } else {
      const session = getUserSession();
      if (session && session.session.access_token) {
          options.headers['Authorization'] = `Bearer ${session.session.access_token}`;
      }
  }

  try {
    const response = await fetch(endpoint, options);
    
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.indexOf("application/json") !== -1) {
        const data = await response.json();
        if (!response.ok) {
            throw new Error(data.error || `HTTP error! status: ${response.status}`);
        }
        return data;
    } else {
        const text = await response.text();
        console.error("Non-JSON response from server:", text);
        throw new Error(`Server returned a non-JSON response. Status: ${response.status}. Check Netlify function logs for endpoint ${endpoint}.`);
    }

  } catch (error) {
    console.error(`API call to ${endpoint} failed:`, error.message);
    throw error;
  }
}

// --- Exposed API Functions ---

// Auth
async function registerUser(username, email, password) {
  return fetchApi('/api/auth-register', 'POST', { username, email, password });
}
async function loginUser(email, password) {
  const data = await fetchApi('/api/auth-login', 'POST', { email, password });
  if (data.session) {
    saveUserSession(data);
  }
  return data;
}

// Vs. AI
async function getAiResponse(history, systemInstruction, prompt) {
    return fetchApi('/api/game-ai-handler', 'POST', { history, systemInstruction, prompt });
}
async function updateStats(result) {
    const session = getUserSession();
    if (!session || !session.session.access_token) {
        console.warn("Cannot update stats. User not logged in.");
        return Promise.resolve({ message: "Not logged in" });
    }
    return fetchApi('/api/user-stats', 'POST', { result }, session.session.access_token);
}

// Vs. Human
async function getOpenGames() {
    return fetchApi('/api/game-lobby', 'GET');
}
async function createGame() {
    return fetchApi('/api/game-lobby', 'POST', { action: 'create' });
}
async function joinGame(gameId) {
    return fetchApi('/api/game-lobby', 'POST', { action: 'join', gameId });
}
async function getGameState(gameId) {
    return fetchApi(`/api/game-state?id=${gameId}`, 'GET');
}
async function sendGameUpdate(gameId, action, text) {
    return fetchApi('/api/game-update', 'POST', { gameId, action, text });
}


// --- Global Event Listeners ---
document.addEventListener('click', (e) => {
    const button = e.target.closest('.btn');
    if (button && !button.disabled) {
        playUiSound();
    }
});


// --- Expose functions to the global scope ---
window.registerUser = registerUser;
window.loginUser = loginUser;
window.signOutUser = signOutUser;
window.getCurrentUser = getCurrentUser;
window.getAiResponse = getAiResponse;
window.updateStats = updateStats;
window.playUiSound = playUiSound;
window.getOpenGames = getOpenGames;
window.createGame = createGame;
window.joinGame = joinGame;
window.getGameState = getGameState;
window.sendGameUpdate = sendGameUpdate;