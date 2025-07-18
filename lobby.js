const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const getAuthenticatedUser = async (event) => {
    const authHeader = event.headers.authorization;
    if (!authHeader) {
        throw new Error('Unauthorized: No token provided.');
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
        throw new Error('Unauthorized: Invalid token.');
    }
    return user;
};

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    try {
        const user = await getAuthenticatedUser(event);
        const gameId = event.queryStringParameters.id;

        if (!gameId) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Game ID is required.' }),
            };
        }

        // RLS policy "Players can view their own games." handles security.
        // We must also join with profiles to get usernames for the UI.
        const { data: game, error } = await supabase
            .from('games')
            .select('*, host:host_id(username), opponent:opponent_id(username)')
            .eq('id', gameId)
            .single();

        if (error) {
            console.error("Supabase fetch error for game state:", error);
            throw new Error("Game not found or you don't have access.");
        }
        
        if (!game) {
             throw new Error("Game not found.");
        }

        // While RLS should prevent this, an extra server-side check is good practice.
        if (game.host_id !== user.id && game.opponent_id !== user.id) {
             return {
                statusCode: 403,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: "Forbidden: You are not a player in this game." }),
            };
        }

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(game),
        };

    } catch (e) {
        console.error('Game State Error:', e.message);
        const statusCode = e.message.startsWith('Unauthorized') ? 401 : 500;
        return {
            statusCode: statusCode,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: e.message || 'An internal server error occurred.' }),
        };
    }
};