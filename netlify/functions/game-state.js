
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'GET') {
        return {
            statusCode: 405,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Method Not Allowed' }),
        };
    }

    try {
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            throw new Error('Unauthorized: No token provided.');
        }
        const token = authHeader.split(' ')[1];

        // Create a user-scoped client to respect RLS
        const supabase = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });
        
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
            throw new Error('Unauthorized: Invalid token.');
        }

        const gameId = event.queryStringParameters.id;
        if (!gameId) {
            return {
                statusCode: 400,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ error: 'Game ID is required.' }),
            };
        }

        // RLS policy is handled by using the authenticated client.
        // We join with profiles to get usernames for the UI.
        const { data: game, error } = await supabase
            .from('games')
            .select('*, host:profiles!host_id(username), opponent:profiles!opponent_id(username)')
            .eq('id', gameId)
            .single();

        if (error) {
            console.error("Supabase fetch error for game state:", error);
            throw new Error("Game not found or you don't have access.");
        }
        
        if (!game) {
             throw new Error("Game not found.");
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
