const express = require('express');
const supabase = require('../config/supabase');
const router = express.Router();

/**
 * Exchange auth code for session
 */
router.post('/callback', async (req, res) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Auth code is required' });
    }
    
    // Exchange auth code for session
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      return res.status(401).json({ error: error.message });
    }
    
    // Check if user profile exists, create one if not
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', data.user.id)
      .single();
    
    if (profileError && profileError.code !== 'PGRST116') { // PGRST116 is "row not found"
      return res.status(500).json({ error: profileError.message });
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
        return res.status(500).json({ error: insertError.message });
      }
      
      // Create initial player data 
      const { error: playerDataError } = await supabase
        .from('player_data')
        .insert({
          user_id: data.user.id,
          x: 0,
          y: 1,
          z: 0,
          inventory: '[]', 
          stats: '{}'
        });
      
      if (playerDataError) {
        return res.status(500).json({ error: playerDataError.message });
      }
    } else {
      // Update last login time
      await supabase
        .from('profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('user_id', data.user.id);
    }
    
    res.status(200).json({ session: data });
  } catch (error) {
    console.error('Auth callback error:', error);
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * Verify a token
 */
router.post('/verify', async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error) {
      return res.status(401).json({ error: error.message });
    }
    
    res.status(200).json({ user: data.user });
  } catch (error) {
    console.error('Token verification error:', error);
    res.status(500).json({ error: 'Token verification failed' });
  }
});

module.exports = router; 