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
    const { email, password } = JSON.parse(event.body);

    if (!email || !password) {
      return {
        statusCode: 400,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Email and password are required.' }),
      };
    }

    const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (signInError) {
      console.error('Supabase sign-in error:', signInError);
      return {
        statusCode: 401,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'Invalid login credentials.' }),
      };
    }

    const { data: profileData, error: profileError } = await supabase
      .from('profiles')
      .select('username, wins, losses')
      .eq('id', signInData.user.id)
      .single();

    if (profileError) {
        console.error('Supabase profile fetch error:', profileError);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Could not retrieve user profile.' }),
        };
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

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(responsePayload),
    };

  } catch (e) {
    console.error('Login function error:', e);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'An internal server error occurred.' }),
    };
  }
};