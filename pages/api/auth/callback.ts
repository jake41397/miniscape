import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get auth code from URL
  const { code } = req.query;

  if (code) {
    try {
      // Exchange auth code for user session
      const { data, error } = await supabase.auth.exchangeCodeForSession(String(code));
      
      if (error) {
        throw error;
      }

      // Check if user profile exists, create one if not
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', data.user.id)
        .single();

      if (profileError && profileError.code !== 'PGRST116') { // PGRST116 is "row not found"
        throw profileError;
      }

      // If profile doesn't exist, create it
      if (!profile) {
        // Get user email from auth data
        const email = data.user.email || '';
        const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
        
        // Create new profile
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            user_id: data.user.id,
            username: username,
            avatar_url: data.user.user_metadata.avatar_url || null,
            last_login: new Date().toISOString()
          });

        if (insertError) {
          throw insertError;
        }

        // Create initial player data 
        const { error: playerDataError } = await supabase
          .from('player_data')
          .insert({
            user_id: data.user.id,
            x: 0,
            y: 1,
            z: 0,
            inventory: [], 
            stats: {}
          });

        if (playerDataError) {
          throw playerDataError;
        }
      } else {
        // Update last login time
        await supabase
          .from('profiles')
          .update({ last_login: new Date().toISOString() })
          .eq('user_id', data.user.id);
      }

      // Redirect to app
      return res.redirect(302, '/');
    } catch (error) {
      console.error('Auth callback error:', error);
      return res.redirect(302, '/auth/error');
    }
  }

  // If no code, redirect to sign in
  return res.redirect(302, '/auth/signin');
} 