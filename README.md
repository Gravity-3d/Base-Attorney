# Objection, Your Honor! - Backend Setup Guide

Welcome to the new, secure backend for our game! We are using **Netlify** for hosting and serverless functions, and **Supabase** for our database and user authentication.

Follow these steps carefully to get your application running.

## Step 1: Supabase Setup (Database & Auth)

We will use Supabase to store our user data (profiles, wins, losses).

### 1.1. Create a Supabase Project

If you haven't already, sign up at [supabase.com](https://supabase.com) and create a new project.

### 1.2. Create the `profiles` Table & Required Functions

Once your project is ready, we need to create a table to store user information and the helper functions our backend will use.

1.  Go to the **SQL Editor** in the left sidebar of your Supabase dashboard.
2.  Click **+ New query**.
3.  Copy and paste the entire SQL script below into the editor and click **RUN**.

```sql
-- Create a table for public user profiles
create table profiles (
  id uuid references auth.users not null primary key,
  updated_at timestamp with time zone,
  username text unique,
  wins integer default 0,
  losses integer default 0,

  constraint username_length check (char_length(username) >= 3)
);

-- Set up Row Level Security (RLS)
-- See https://supabase.com/docs/guides/auth/row-level-security
alter table profiles
  enable row level security;

create policy "Public profiles are viewable by everyone." on profiles
  for select using (true);

create policy "Users can insert their own profile." on profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on profiles
  for update using (auth.uid() = id);

-- This trigger automatically creates a profile entry for new users.
-- See https://supabase.com/docs/guides/auth/managing-user-data#using-triggers
create function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, username)
  values (new.id, new.raw_user_meta_data->>'username');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- This function allows securely incrementing a numeric column (e.g., wins or losses).
-- It's used by our user-stats serverless function to prevent race conditions.
CREATE OR REPLACE FUNCTION increment_stat(user_id_in uuid, stat_column text)
RETURNS void AS $$
BEGIN
    EXECUTE format('UPDATE profiles SET %I = %I + 1, updated_at = now() WHERE id = %L', stat_column, stat_column, user_id_in);
END;
$$ LANGUAGE plpgsql;

```

This script does four important things:
1.  Creates the `profiles` table for `username`, `wins`, and `losses`.
2.  Sets up security rules so users can only view public data and edit their own profile.
3.  Creates a trigger that automatically adds a new row to `profiles` whenever a new user signs up.
4.  Creates the `increment_stat` function that our backend needs to safely update scores.

### 1.3. Get Your Supabase Credentials

We need two pieces of information to connect our app to Supabase.
1.  In your Supabase dashboard, go to **Project Settings** (the gear icon).
2.  Click on **API**.
3.  Under **Project API Keys**, find your **URL** and your **anon (public) key**.
4.  Keep these two values handy. We'll need them in the next step.

---

## Step 2: Netlify Setup (Hosting & Functions)

We will use Netlify to host our site and run our secure backend functions.

### 2.1. Deploy Your Site
Connect your code repository (e.g., from GitHub) to a new site on Netlify. Netlify should automatically detect the `netlify.toml` file and set up the build settings correctly.

### 2.2. Set Environment Variables

This is the most important step for security. We will store our secret keys here, so they are never exposed in our frontend code.

1.  In your Netlify site dashboard, go to **Site configuration** > **Environment variables**.
2.  Add the following three variables:

    *   **`VITE_SUPABASE_URL`**:
        *   Paste the **URL** you copied from your Supabase project settings.

    *   **`VITE_SUPABASE_ANON_KEY`**:
        *   Paste the **anon (public) key** you copied from your Supabase project settings.

    *   **`GEMINI_API_KEY`**:
        *   Paste your **Google Gemini API Key**.

After adding these variables, you will need to trigger a new deploy for them to take effect. Go to the "Deploys" tab and trigger a new deploy of your `main` branch.

---

**You are now all set!** Your application is configured to use a secure, serverless backend.