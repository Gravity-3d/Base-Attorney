
const { createClient } = require('@supabase/supabase-js');

// These environment variables are set in your Netlify project settings.
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;


exports.handler = async (event, context) => {
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method Not Allowed' }),
    };
  }

  if (!event.body) {
    return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Request body is missing.' }),
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
    const { email, password, username } = JSON.parse(event.body);

    if (!email || !password || !username) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Email, password, and username are required.' }),
      };
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username,
        }
      }
    });

    if (error) {
      console.error('Supabase signup error:', error);
      const userMessage = error.message.includes('unique constraint') 
        ? 'A user with this email or username already exists.' 
        : error.message;
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: userMessage }),
      };
    }
    
    // Check if email confirmation is required. If the session is null, it is.
    const confirmationPending = data.session === null;
    let message = '';
    
    if (confirmationPending) {
        // User-friendly message, as requested by the user.
        message = "Check your email for authentication.";
    } else {
        message = 'Registration successful! You can now sign in.';
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
          message: message, 
          user: data.user,
          confirmationPending: confirmationPending 
      }),
    };

  } catch (e) {
    console.error('Registration function error:', e);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'An internal server error occurred.' }),
    };
  }
};