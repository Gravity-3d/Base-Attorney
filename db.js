
// --- IndexedDB Constants ---
const DB_NAME = 'objectionYourHonorDB';
const DB_VERSION = 1;
const STORE_USERS = 'users';
const CURRENT_USER_KEY = 'oyh_current_user';

let db;

/**
 * Initializes and opens the IndexedDB database.
 * This function is called internally by other DB functions.
 * @returns {Promise<IDBDatabase>} A promise that resolves with the database instance.
 */
function initDB() {
    return new Promise((resolve, reject) => {
        // If the database connection is already open, resolve with it.
        if (db) {
            return resolve(db);
        }

        const request = indexedDB.open(DB_NAME, DB_VERSION);

        request.onerror = (event) => {
            console.error("Database error:", request.error);
            reject("Database error: " + request.error);
        };

        request.onsuccess = (event) => {
            db = event.target.result;
            resolve(db);
        };

        // This event only runs if the DB_VERSION is increased or the DB doesn't exist.
        request.onupgradeneeded = (event) => {
            const tempDb = event.target.result;
            if (!tempDb.objectStoreNames.contains(STORE_USERS)) {
                // Create the 'users' object store (like a table).
                const userStore = tempDb.createObjectStore(STORE_USERS, { keyPath: 'id' });
                // Create indexes for fast, unique lookups.
                userStore.createIndex('email', 'email', { unique: true });
                userStore.createIndex('username', 'username', { unique: true });
            }
        };
    });
}

/**
 * Creates a new user and saves them to the database.
 * @param {string} username - The user's chosen username.
 * @param {string} email - The user's email address.
 * @param {string} password - The user's password.
 * @returns {Promise<{success: boolean, message: string}>} An object indicating success and a message.
 */
async function createUser(username, email, password) {
    const db = await initDB();
    const emailLower = email.toLowerCase();
    const usernameLower = username.toLowerCase();

    return new Promise((resolve) => {
        // Start a read-only transaction to check for existing users.
        const checkTransaction = db.transaction([STORE_USERS], 'readonly');
        const store = checkTransaction.objectStore(STORE_USERS);
        
        const emailRequest = store.index('email').get(emailLower);
        emailRequest.onsuccess = () => {
            if (emailRequest.result) {
                return resolve({ success: false, message: "An account with this email already exists." });
            }

            // If email is not found, check for username.
            const usernameRequest = store.index('username').get(usernameLower);
            usernameRequest.onsuccess = () => {
                if (usernameRequest.result) {
                    return resolve({ success: false, message: "This username is already taken." });
                }

                // All checks passed, create the user in a new read-write transaction.
                const writeTransaction = db.transaction([STORE_USERS], 'readwrite');
                const writeStore = writeTransaction.objectStore(STORE_USERS);
                
                // NOTE: In a real-world application, NEVER store plain text passwords.
                const newUser = { id: Date.now().toString(), username, email: emailLower, password, wins: 0, losses: 0 };
                const addRequest = writeStore.add(newUser);

                addRequest.onsuccess = () => resolve({ success: true, message: "Account created successfully! Redirecting..." });
                addRequest.onerror = () => resolve({ success: false, message: "Failed to create account." });
            };
            usernameRequest.onerror = () => resolve({ success: false, message: "Database check failed." });
        };
        emailRequest.onerror = () => resolve({ success: false, message: "Database check failed." });
    });
}

/**
 * Signs in a user by verifying credentials and stores their session.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @returns {Promise<{success: boolean, message: string}>} An object indicating success and a message.
 */
async function signInUser(email, password) {
    const db = await initDB();
    const emailLower = email.toLowerCase();

    return new Promise((resolve) => {
        const transaction = db.transaction([STORE_USERS], 'readonly');
        const store = transaction.objectStore(STORE_USERS);
        const index = store.index('email');
        const request = index.get(emailLower);

        request.onerror = () => {
            resolve({ success: false, message: "Error accessing database." });
        };

        request.onsuccess = () => {
            const user = request.result;
            // NOTE: In a real app, you would compare hashed passwords.
            if (!user || user.password !== password) {
                return resolve({ success: false, message: "Invalid email or password." });
            }
            
            // Use sessionStorage to keep the user logged in for the current tab session.
            try {
                sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
                resolve({ success: true, message: "Sign in successful! Redirecting..." });
            } catch (e) {
                console.error("Error saving current user to sessionStorage", e);
                resolve({ success: false, message: "Could not start user session." });
            }
        };
    });
}

/**
 * Signs out the current user by clearing their session data.
 */
function signOutUser() {
    try {
        sessionStorage.removeItem(CURRENT_USER_KEY);
    } catch(e) {
        console.error("Error signing out user", e);
    }
}

/**
 * Retrieves the currently signed-in user from the session.
 * This remains synchronous as it reads from sessionStorage.
 * @returns {Object|null} The current user object or null if not signed in.
 */
function getCurrentUser() {
    try {
        const user = sessionStorage.getItem(CURRENT_USER_KEY);
        return user ? JSON.parse(user) : null;
    } catch(e) {
        console.error("Error retrieving current user", e);
        return null;
    }
}

/**
 * Finds a user by their username.
 * @param {string} username - The username to search for.
 * @returns {Promise<Object|undefined>} The user object or undefined if not found.
 */
async function findUserByUsername(username) {
     const db = await initDB();
     const usernameLower = username.toLowerCase();

     return new Promise((resolve) => {
        const transaction = db.transaction([STORE_USERS], 'readonly');
        const store = transaction.objectStore(STORE_USERS);
        const index = store.index('username');
        const request = index.get(usernameLower);

        request.onerror = () => {
            console.error('Error finding user by username', request.error);
            resolve(undefined);
        };
        request.onsuccess = () => resolve(request.result);
    });
}

/**
 * Updates a user's data in the database.
 * @param {Object} updatedUser - The user object with updated properties.
 * @returns {Promise<void>}
 */
async function updateUser(updatedUser) {
    const db = await initDB();

    return new Promise((resolve, reject) => {
        const transaction = db.transaction([STORE_USERS], 'readwrite');
        const store = transaction.objectStore(STORE_USERS);
        const request = store.put(updatedUser);

        request.onerror = () => {
            console.error('Error updating user', request.error);
            reject(request.error);
        };

        request.onsuccess = () => {
            const currentUser = getCurrentUser();
            if (currentUser && currentUser.id === updatedUser.id) {
                try {
                    sessionStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updatedUser));
                } catch (e) {
                    console.error("Error updating session user", e);
                }
            }
            resolve();
        };
    });
}
