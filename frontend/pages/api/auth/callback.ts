import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get auth code from URL
  const { code, error, error_description } = req.query;

  // Handle auth errors
  if (error) {
    console.error('Auth provider error:', error, error_description);
    return res.redirect(302, `/auth/error?error=${encodeURIComponent(String(error))}`);
  }

  if (!code) {
    console.error('No code provided in callback');
    return res.redirect(302, '/auth/error?error=no_code');
  }

  try {
    // When using PKCE flow, the code should be exchanged on the client side
    // Redirect back to a client-side handler with the code
    return res.redirect(302, `/auth/handle-callback?code=${code}`);
  } catch (error) {
    console.error('Auth callback error:', error);
    return res.redirect(302, '/auth/error');
  }
} 