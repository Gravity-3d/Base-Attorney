const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

exports.handler = async (event, context) => {
    if (event.httpMethod !== 'POST') {
        return {
          statusCode: 405,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ error: 'Method Not Allowed' })
        };
    }

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Supabase URL or Anon Key is not set.');
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Server configuration error.' }),
        };
    }
    const supabase = createClient(supabaseUrl, supabaseAnonKey);

    try {
        const authHeader = event.headers.authorization;
        if (!authHeader) {
            return { statusCode: 401, body: JSON.stringify({ error: 'No authorization token provided.' }) };
        }
        const token = authHeader.split(' ')[1];

        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
            console.error('Auth error:', userError);
            return { statusCode: 401, body: JSON.stringify({ error: 'Invalid or expired token.' }) };
        }

        const { result } = JSON.parse(event.body);
        if (result !== 'win' && result !== 'loss') {
            return { statusCode: 400, body: JSON.stringify({ error: 'Invalid result provided.' }) };
        }

        const columnToUpdate = result === 'win' ? 'wins' : 'losses';

        const { error: rpcError } = await supabase.rpc('increment_stat', {
            user_id_in: user.id,
            stat_column: columnToUpdate
        });

        if (rpcError) {
            console.error('RPC Error updating stats:', rpcError);
            return { 
                statusCode: 500, 
                body: JSON.stringify({ error: 'Failed to update stats. Ensure the RPC function is set up in Supabase.' }) 
            };
        }

        return { 
            statusCode: 200, 
            body: JSON.stringify({ message: 'Stats updated successfully.' }) 
        };

    } catch (e) {
        console.error('Stats update function error:', e);
        return { 
            statusCode: 500, 
            body: JSON.stringify({ error: 'An internal server error occurred.' }) 
        };
    }
};