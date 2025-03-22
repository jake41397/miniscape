const express = require('express');
const supabase = require('../config/supabase');
const router = express.Router();

/**
 * Get current player profile
 */
router.get('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get player profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (profileError) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.status(200).json({ profile });
  } catch (error) {
    console.error('Error fetching profile:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * Update player profile
 */
router.put('/profile', async (req, res) => {
  try {
    const userId = req.user.id;
    const { username, avatar_url } = req.body;
    
    // Update profile
    const { data, error } = await supabase
      .from('profiles')
      .update({ 
        username: username,
        avatar_url: avatar_url,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId)
      .select()
      .single();
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.status(200).json({ profile: data });
  } catch (error) {
    console.error('Error updating profile:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * Get player game data
 */
router.get('/data', async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get player data
    const { data: playerData, error: playerError } = await supabase
      .from('player_data')
      .select('*')
      .eq('user_id', userId)
      .single();
    
    if (playerError) {
      return res.status(404).json({ error: 'Player data not found' });
    }
    
    // Parse JSON fields
    const parsedData = {
      ...playerData,
      inventory: JSON.parse(playerData.inventory || '[]'),
      stats: JSON.parse(playerData.stats || '{}')
    };
    
    res.status(200).json({ playerData: parsedData });
  } catch (error) {
    console.error('Error fetching player data:', error);
    res.status(500).json({ error: 'Failed to fetch player data' });
  }
});

/**
 * Get all online players
 */
router.get('/online', async (req, res) => {
  try {
    // This would be more efficient with a real-time player list
    // But for demo purposes, we'll use "last login within the last 5 minutes" as "online"
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    
    const { data, error } = await supabase
      .from('profiles')
      .select('id, username, avatar_url, last_login')
      .gt('last_login', fiveMinutesAgo);
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.status(200).json({ onlinePlayers: data });
  } catch (error) {
    console.error('Error fetching online players:', error);
    res.status(500).json({ error: 'Failed to fetch online players' });
  }
});

module.exports = router; 