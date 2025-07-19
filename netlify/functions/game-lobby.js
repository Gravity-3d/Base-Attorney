

const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

const fetchRandomTopic = () => {
    // In a serverless environment, it's often easier to hardcode small lists
    // than to handle file system access.
    const topics = [
        "Is cereal a soup?", "Should pineapple go on pizza?", "Is a hot dog a sandwich?",
        "Is water wet?", "Is Die Hard a Christmas movie?", "Are cats better than dogs?",
        "Are there more doors or wheels in the world?", "Is a wrap a sandwich?",
        "Is cold pizza a valid breakfast choice?", "Is the Oxford comma necessary?"
    ];
    return topics[Math.floor(Math.random() * topics.length)];
}

const createAuthedClient = (token) => {
    if (!token) throw new Error('Auth token is required.');
    return createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${token}` } }
    });
};

exports.handler = async (event) => {
    // --- Authentication and Client Setup ---
    const authHeader = event.headers.authorization;
    if (!authHeader) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Authorization token is required.' }) };
    }
    const token = authHeader.split(' ')[1];
    const supabase = createAuthedClient(token);

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
        return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token.' }) };
    }

    // --- GET: List open games ---
    if (event.httpMethod === 'GET') {
        try {
            const { data, error } = await supabase
                .from('games')
                .select('*, host:profiles!host_id(username)')
                .eq('status', 'waiting')
                .neq('host_id', user.id); // Don't show user their own games

            if (error) throw error;
            return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data || []) };
        } catch (e) {
            console.error("Error fetching open games:", e.message);
            return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
        }
    }

    // --- POST: Create or Join a game ---
    if (event.httpMethod === 'POST') {
        try {
            const { action, gameId } = JSON.parse(event.body);

            if (action === 'create') {
                const topic = fetchRandomTopic();
                const { data, error } = await supabase
                    .from('games')
                    .insert({ host_id: user.id, topic: topic })
                    .select()
                    .single();
                if (error) throw error;
                return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
            }

            if (action === 'join') {
                if (!gameId) return { statusCode: 400, body: JSON.stringify({ error: 'Game ID is required to join.' }) };
                
                const { data: gameToJoin, error: fetchError } = await supabase
                    .from('games').select('*').eq('id', gameId).single();

                if (fetchError || !gameToJoin) throw new Error('Game not found or already started.');

                // Randomly assign roles
                const defensePlayerId = Math.random() < 0.5 ? user.id : gameToJoin.host_id;
                const prosecutionPlayerId = defensePlayerId === user.id ? gameToJoin.host_id : user.id;

                const { data, error } = await supabase
                    .from('games')
                    .update({ 
                        opponent_id: user.id, 
                        status: 'active',
                        defense_player_id: defensePlayerId,
                        prosecution_player_id: prosecutionPlayerId,
                        current_turn: defensePlayerId, // Defense always goes first
                        history: [{ speakerRole: 'Judge', text: `Court is now in session. Today's topic: ${gameToJoin.topic}`}]
                     })
                    .eq('id', gameId)
                    .eq('status', 'waiting') // Atomic update to prevent race conditions
                    .select()
                    .single();

                if (error || !data) throw new Error('Failed to join game. It may have just been taken by another player.');
                return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) };
            }

            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action specified.' }) };
        } catch (e) {
            return { statusCode: 500, body: JSON.stringify({ error: e.message }) };
        }
    }

    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method Not Allowed' }) };
};