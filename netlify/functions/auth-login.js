import { createClient } from '@supabase/supabase-js';

// These environment variables are set in your Netlify build settings.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Supabase URL and/or Anon Key are not set in environment variables.');
}
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export default async (req, context) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { email, password } = JSON.parse(req.body);

    if (!email || !password) {
      return new Response(JSON.stringify({ error: 'Email and password are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Sign in the user
    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      console.error('Supabase sign-in error:', signInError);
      return new Response(JSON.stringify({ error: 'Invalid login credentials.' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get the user's profile information
    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('username, wins, losses')
      .eq('id', signInData.user.id)
      .single();

    if (profileError) {
        console.error('Supabase profile fetch error:', profileError);
        return new Response(JSON.stringify({ error: 'Could not retrieve user profile.' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
        });
    }

    const responsePayload = {
        message: "Sign in successful!",
        user: {
            id: signInData.user.id,
            email: signInData.user.email,
            ...profileData
        },
        session: signInData.session
    };

    return new Response(JSON.stringify(responsePayload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('Login function error:', e);
    return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};