import { createClient } from '@supabase/supabase-js';

// These environment variables are set in your Netlify build settings.
const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and/or Anon Key are not set in environment variables.');
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async (req, context) => {
    if (req.method !== 'POST') {
        return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { status: 405 });
    }

    try {
        // 1. Get the user's JWT from the Authorization header
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            return new Response(JSON.stringify({ error: 'No authorization token provided.' }), { status: 401 });
        }
        const token = authHeader.split(' ')[1]; // Bearer <token>

        // 2. Verify the token and get the user
        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
            console.error('Auth error:', userError);
            return new Response(JSON.stringify({ error: 'Invalid or expired token.' }), { status: 401 });
        }

        // 3. Get the game result from the request body
        const { result } = JSON.parse(req.body); // 'win' or 'loss'
        if (result !== 'win' && result !== 'loss') {
            return new Response(JSON.stringify({ error: 'Invalid result provided.' }), { status: 400 });
        }

        // 4. Atomically update the user's stats using an RPC call
        // This is safer than a SELECT then UPDATE, as it prevents race conditions.
        // The `increment_stat` function must be created in your Supabase SQL Editor as per the README.md instructions.
        const columnToUpdate = result === 'win' ? 'wins' : 'losses';

        const { error: rpcError } = await supabase.rpc('increment_stat', {
            user_id_in: user.id,
            stat_column: columnToUpdate
        });

        if (rpcError) {
            console.error('RPC Error updating stats:', rpcError);
            // Before deploying, make sure you have created the `increment_stat` function in your Supabase SQL editor!
            return new Response(JSON.stringify({ error: 'Failed to update stats. Ensure the RPC function is set up in Supabase.' }), { status: 500 });
        }

        return new Response(JSON.stringify({ message: 'Stats updated successfully.' }), { status: 200 });

    } catch (e) {
        console.error('Stats update function error:', e);
        return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), { status: 500 });
    }
};