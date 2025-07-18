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
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { email, password, username } = JSON.parse(req.body);

    if (!email || !password || !username) {
      return new Response(JSON.stringify({ error: 'Email, password, and username are required.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        // Pass the username to be used by the trigger function in Supabase
        data: {
          username: username,
        }
      }
    });

    if (error) {
      console.error('Supabase signup error:', error);
      // Provide a more user-friendly message
      const userMessage = error.message.includes('unique constraint') 
        ? 'A user with this email or username already exists.' 
        : error.message;
      return new Response(JSON.stringify({ error: userMessage }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // The trigger in Supabase will create the profile.
    // The user object might not contain session info immediately if email confirmation is on.
    return new Response(JSON.stringify({ message: 'Registration successful! Please check your email to confirm your account.', user: data.user }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (e) {
    console.error('Registration function error:', e);
    return new Response(JSON.stringify({ error: 'An internal server error occurred.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};