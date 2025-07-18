// --- Client-Side API Module ---

const USER_SESSION_KEY = 'oyh_user_session';

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
  } catch (e) {
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
  // No need to call Supabase signout here, as the token becomes invalid when cleared.
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
  }

  try {
    const response = await fetch(endpoint, options);
    const data = await response.json();

    if (!response.ok) {
      // Use the error message from the API response if available, otherwise use a default.
      throw new Error(data.error || `HTTP error! status: ${response.status}`);
    }
    return data;
  } catch (error) {
    console.error(`API call to ${endpoint} failed:`, error);
    // Re-throw to be caught by the calling function, which can then update the UI.
    throw error;
  }
}

// --- Exposed API Functions ---

/**
 * Registers a new user.
 * @param {string} username
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>}
 */
async function registerUser(username, email, password) {
  return fetchApi('/api/auth-register', 'POST', { username, email, password });
}

/**
 * Logs in a user.
 * @param {string} email
 * @param {string} password
 * @returns {Promise<Object>}
 */
async function loginUser(email, password) {
  const data = await fetchApi('/api/auth-login', 'POST', { email, password });
  if (data.session) {
    saveUserSession(data);
  }
  return data;
}

/**
 * Gets a response from the AI.
 * @param {Array} history - The current debate history.
 * @param {string} systemInstruction - The system instruction for the AI persona.
 * @param {string} prompt - The new prompt for the AI.
 * @returns {Promise<Object>}
 */
async function getAiResponse(history, systemInstruction, prompt) {
    return fetchApi('/api/game-ai-handler', 'POST', { history, systemInstruction, prompt });
}


/**
 * Updates the user's game stats.
 * @param {'win' | 'loss'} result - The result of the game.
 * @returns {Promise<Object>}
 */
async function updateStats(result) {
    const session = getUserSession();
    if (!session || !session.session.access_token) {
        console.warn("Cannot update stats. User not logged in.");
        return Promise.resolve({ message: "Not logged in" });
    }
    
    return fetchApi('/api/user-stats', 'POST', { result }, session.session.access_token);
}


// --- Expose functions to the global scope for other scripts ---
window.registerUser = registerUser;
window.loginUser = loginUser;
window.signOutUser = signOutUser;
window.getCurrentUser = getCurrentUser;
window.getAiResponse = getAiResponse;
window.updateStats = updateStats;
