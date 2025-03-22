# Supabase and Google SSO Setup Guide

This document provides detailed instructions for setting up Supabase with Google SSO authentication for MiniScape.

## Setting up Supabase

### 1. Create a Supabase Account and Project

1. Go to [Supabase](https://supabase.com/) and sign up for an account
2. Create a new project
3. Choose a name for your project
4. Set a secure database password (save this somewhere safe)
5. Choose a region close to your target audience
6. Wait for your project to be created (this may take a few minutes)

### 2. Get Your API Keys

Once your project is created:

1. Go to the Supabase dashboard
2. Click on the "Settings" icon (gear) in the sidebar
3. Go to "API" in the settings menu
4. You'll find:
   - **Project URL**: Your Supabase project URL
   - **anon/public** key: For client-side access with limited permissions
   - **service_role** key: For server-side access with full admin rights

Copy these values and add them to your `.env.local` file:

```
NEXT_PUBLIC_SUPABASE_URL=your-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 3. Set Up Database Tables

You can set up the required database tables in two ways:

#### Option 1: Using the migration script (recommended)

1. Ensure your `.env.local` file has the correct Supabase keys
2. Run the migration script:
   ```bash
   npm run migrate
   ```

#### Option 2: Manual setup in Supabase dashboard

1. Go to the "SQL Editor" in your Supabase dashboard
2. Copy the SQL code from `migrations/01_initial_schema.sql` and execute it
3. Copy the SQL code from `migrations/02_seed_data.sql` and execute it

## Setting up Google SSO

### 1. Create a Google OAuth Client

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to "APIs & Services" > "Credentials"
4. Click "Create Credentials" and select "OAuth client ID"
5. Configure the OAuth consent screen:
   - User Type: External
   - App name: MiniScape
   - User support email: Your email
   - Developer contact information: Your email
   - Authorized domains: Add your domains (e.g., localhost for development)
6. Create the OAuth client ID:
   - Application type: Web application
   - Name: MiniScape
   - Authorized JavaScript origins: Add `http://localhost:3000` (for development) and your production URL if applicable
   - Authorized redirect URIs: Add `http://localhost:3000/api/auth/callback` and your production callback URL

### 2. Configure Supabase Authentication

1. In your Supabase dashboard, go to "Authentication" > "Providers"
2. Find "Google" and enable it
3. Enter the Client ID and Client Secret from your Google OAuth credentials
4. Set the Authorized redirect URI to `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
5. Save the configuration

### 3. Add Google Client ID to Environment Variables

Add your Google Client ID to your `.env.local` file:

```
NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
```

## Enabling the Supabase Row-Level Security (RLS)

The migration scripts already handle the RLS setup, but here's how it works:

1. Each table has RLS enabled to protect the data
2. Policies are created to:
   - Allow public reading of most data
   - Restrict writes so users can only modify their own data
   - Ensure administrators have proper access

## Testing Authentication

To test if everything is set up correctly:

1. Run your app locally:
   ```bash
   npm run dev
   ```
2. Navigate to `http://localhost:3000`
3. You should be redirected to the sign-in page
4. Click "Sign in with Google"
5. Complete the Google authentication flow
6. You should be redirected back to the game with your Google profile info

## Troubleshooting

### Common Issues

1. **Redirect URI Mismatch**: Ensure the redirect URI in Google Cloud Console matches the one in your app and Supabase settings.

2. **CORS Errors**: If you see CORS errors, check that your domain is properly added to the allowed origins in Google Cloud Console.

3. **Database Connection Errors**: Ensure your Supabase service role key has the proper permissions.

4. **Migration Script Errors**: Check the console output for specific error details. Common issues include:
   - Missing environment variables
   - Incorrect Supabase keys
   - Existing tables without proper CASCADE options

Contact the development team for additional assistance. 