const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const fetchRandomTopic = async () => {
    // This is a simplified version. In a real app, you might fetch this from a file or another service.
    // For now, we'll hardcode a few topics to avoid file system access in serverless func.
    const topics = [
        "Is cereal a soup?", "Should pineapple go on pizza?", "Is a hot dog a sandwich?",
        "Is water wet?", "Is Die Hard a Christmas movie?", "Are cats better than dogs?",
        "Are there more doors or wheels in the world?", "Is a wrap a sandwich?",
        "Is cold pizza a valid breakfast choice?", "Is the Oxford comma necessary?"
    ];
    return topics[Math.floor(Math.random() * topics.length)];
}

const getAuthenticatedUser = async (event) => {
    const authHeader = event.headers.authorization;
    if (!authHeader) {
        throw new Error('No authorization token provided.');
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
        throw new Error('Invalid or expired token.');
    }
    return user;
};

exports.handler = async (event) => {
    try {
        if (event.httpMethod === 'GET') {
            // --- LIST OPEN GAMES ---
            const { data, error } = await supabase
                .from('games')
                .select('id, topic, host_id, host:profiles!host_id(username)')
                .eq('status', 'waiting')
                .order('created_at', { ascending: false });

            if (error) throw error;
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data),
            };

        } else if (event.httpMethod === 'POST') {
            // --- CREATE OR JOIN A GAME ---
            const user = await getAuthenticatedUser(event);
            const { action, gameId } = JSON.parse(event.body);

            if (action === 'create') {
                const topic = await fetchRandomTopic();
                const { data: newGame, error: createError } = await supabase
                    .from('games')
                    .insert({ host_id: user.id, topic: topic })
                    .select()
                    .single();
                
                if (createError) throw createError;
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(newGame),
                };
            } else if (action === 'join' && gameId) {
                // Fetch game to ensure it's still waiting
                const { data: gameToJoin, error: fetchError } = await supabase
                    .from('games')
                    .select('*')
                    .eq('id', gameId)
                    .single();

                if (fetchError || !gameToJoin) throw new Error("Game not found.");
                if (gameToJoin.status !== 'waiting') throw new Error("This game is no longer available.");
                if (gameToJoin.host_id === user.id) throw new Error("You can't join your own game.");

                // Assign roles randomly
                const roles = [user.id, gameToJoin.host_id];
                const defensePlayerId = roles.splice(Math.floor(Math.random() * roles.length), 1)[0];
                const prosecutionPlayerId = roles[0];

                const { data: updatedGame, error: updateError } = await supabase
                    .from('games')
                    .update({ 
                        opponent_id: user.id, 
                        status: 'active',
                        defense_player_id: defensePlayerId,
                        prosecution_player_id: prosecutionPlayerId,
                        current_turn: defensePlayerId, // Defense always starts
                        history: [{ speakerRole: 'Judge', text: `Court is now in session. Today's topic: ${gameToJoin.topic}` }]
                    })
                    .eq('id', gameId)
                    .select()
                    .single();

                if (updateError) throw updateError;
                return {
                    statusCode: 200,
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(updatedGame),
                };
            } else {
                return { statusCode: 400, body: JSON.stringify({ error: 'Invalid action or missing gameId.' }) };
            }
        } else {
            return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
        }
    } catch (e) {
        console.error('Lobby Error:', e.message);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: e.message || 'An internal server error occurred.' }),
        };
    }
};