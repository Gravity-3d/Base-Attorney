
const { createClient } = require('@supabase/supabase-js');
const { GoogleGenAI } = require("@google/genai");

// --- Environment & AI Setup ---
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const geminiApiKey = "AIzaSyAUmC9UftOENS_Rl-o9_AqPwHPmTuUb2zE";

let ai;
if (geminiApiKey) {
    ai = new GoogleGenAI({ apiKey: geminiApiKey });
}

const JUDGE_SYSTEM_INSTRUCTION = `You are an impartial, stern, and wise Judge in a courtroom parody game. You have two distinct functions: ruling on objections and rendering a final verdict.
1.  **Ruling on Objections**: If the prompt asks you to "Rule on this objection", you must respond with ONLY ONE of two words: "Sustained." or "Overruled.". This must be followed by a single, brief sentence explaining your reasoning. Example: "Sustained. The prosecutor is badgering the witness."
2.  **Rendering a Final Verdict**: If the prompt asks you to "Render a final verdict", you must analyze the entire debate transcript provided. Based on the quality and persuasiveness of the arguments, you will declare a winner. Your response MUST begin with one of three phrases: "DEFENSE WINS.", "PROSECUTION WINS.", or "DEBATE CONTINUES.". This must be followed by a single, brief sentence summarizing your final decision. Example: "DEFENSE WINS. The defense successfully dismantled the prosecution's core argument." or "DEBATE CONTINUES. Both sides have made compelling points, but neither has landed a decisive blow."
Do not deviate from these formats. Do not add any other pleasantries, greetings, or text.`;

// --- Helper Functions ---
const createAuthedClient = (token) => {
    if (!token) throw new Error('Auth token is required.');
    return createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } }
    });
};

const callAIJudge = async (prompt) => {
    if (!ai) throw new Error("AI Service is not configured on the server.");
    const response = await ai.models.generateContent({
        model: "gemini-2.5-flash",
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { systemInstruction: JUDGE_SYSTEM_INSTRUCTION }
    });
    return response.text;
};

/**
 * A robust helper to update win/loss stats for both players.
 * This is fire-and-forget and does not block game flow on failure.
 * @param {SupabaseClient} supabase - The Supabase client instance.
 * @param {string} winnerId - The UUID of the winning player.
 * @param {string} loserId - The UUID of the losing player.
 */
const updateGameStats = async (supabase, winnerId, loserId) => {
    try {
        await Promise.all([
            supabase.rpc('increment_stat', { user_id_in: winnerId, stat_column: 'wins' }),
            supabase.rpc('increment_stat', { user_id_in: loserId, stat_column: 'losses' })
        ]);
    } catch (e) {
        // Log the error but don't let it block the game from finishing.
        console.error("Non-critical error updating stats:", e.message);
    }
};


// --- Main Handler ---
exports.handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    try {
        // --- Authentication & Setup ---
        const authHeader = event.headers.authorization;
        if (!authHeader) throw new Error('Unauthorized: No token provided.');
        const token = authHeader.split(' ')[1];
        const supabase = createAuthedClient(token);

        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) throw new Error('Unauthorized: Invalid token.');

        const { gameId, action, text } = JSON.parse(event.body);
        if (!gameId || !action || (text === undefined)) {
            return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields: gameId, action, text' }) };
        }

        // --- Fetch and Validate Game State ---
        const { data: game, error: fetchError } = await supabase.from('games').select('*').eq('id', gameId).single();
        if (fetchError || !game) throw new Error('Game not found.');
        if (game.status !== 'active') throw new Error('This game is not active.');
        if (game.current_turn !== user.id) throw new Error("It's not your turn.");
        if (!text.trim()) throw new Error("Your statement cannot be empty.");

        const playerRole = game.defense_player_id === user.id ? 'Defense' : 'Prosecution';
        const opponentId = playerRole === 'Defense' ? game.prosecution_player_id : game.defense_player_id;
        const opponentRole = playerRole === 'Defense' ? 'Prosecution' : 'Defense';
        let history = [...game.history];
        let updates = {};

        // --- Handle Player Actions ---
        switch (action) {
            case 'present':
                history.push({ speakerRole: playerRole, text: text });
                updates = { history, current_turn: opponentId };
                break;

            case 'objection':
                const lastStatement = history.slice().reverse().find(h => h.speakerRole === opponentRole);
                if (!lastStatement) throw new Error("There is nothing to object to.");
                history.push({ speakerRole: playerRole, text: `(Objects) ${text}` });
                const judgePrompt = `The ${opponentRole}'s last statement was: "${lastStatement.text}". The ${playerRole} objects, stating: "${text}". Rule on this objection.`;
                const judgeResponse = await callAIJudge(judgePrompt);
                history.push({ speakerRole: 'Judge', text: judgeResponse });
                updates = { history, current_turn: opponentId };
                break;

            case 'takethat':
                history.push({ speakerRole: playerRole, text: `(Attempts to conclude) ${text}` });
                let counters = { ...(game.take_that_counters || {}) };
                counters[playerRole] = (counters[playerRole] || 0) + 1;

                if (counters[playerRole] >= 3) {
                    const reason = `The ${playerRole} has exhausted their final arguments and failed to land a decisive blow.`;
                    history.push({ speakerRole: 'Judge', text: reason });
                    updates = { history, status: 'finished', winner_id: opponentId, verdict_reason: reason, current_turn: null };
                    await updateGameStats(supabase, opponentId, user.id); // Update stats on 3-strike loss
                } else {
                    const transcript = history.map(d => `${d.speakerRole}: ${d.text}`).join('\n');
                    const verdictPrompt = `The ${playerRole} is attempting to end the debate with this final statement: "${text}". Here is the full transcript:\n\n${transcript}\n\nRender a final verdict.`;
                    const verdict = await callAIJudge(verdictPrompt);
                    history.push({ speakerRole: 'Judge', text: verdict });
                    
                    const reason = verdict.split('.').slice(1).join('.').trim();

                    if (verdict.startsWith('DEBATE CONTINUES')) {
                        updates = { history, current_turn: opponentId, take_that_counters: counters };
                    } else {
                        const winnerId = verdict.startsWith('DEFENSE WINS') ? game.defense_player_id : game.prosecution_player_id;
                        updates = { history, status: 'finished', winner_id: winnerId, verdict_reason: reason, current_turn: null };
                        
                        const loserId = winnerId === game.defense_player_id ? game.prosecution_player_id : game.defense_player_id;
                        await updateGameStats(supabase, winnerId, loserId);
                    }
                }
                break;
            
            default:
                throw new Error('Invalid action.');
        }

        // --- Commit Updates to DB ---
        await supabase.from('games').update(updates).eq('id', gameId);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: 'Action processed successfully.' }),
        };

    } catch (e) {
        console.error('Game Update Error:', e);
        return {
            statusCode: e.message.startsWith('Unauthorized') ? 401 : (e.message.includes('not your turn') ? 403 : 500),
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: e.message || 'An internal server error occurred.' }),
        };
    }
};
