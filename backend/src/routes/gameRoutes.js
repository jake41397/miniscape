const express = require('express');
const router = express.Router();
const supabase = require('../config/supabase');
const gameModel = require('../models/gameModel');

/**
 * Get world map data
 */
router.get('/world', async (req, res) => {
  try {
    // Get world map data from database
    const { data: worldData, error } = await supabase
      .from('world_map')
      .select('*')
      .order('id');
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    res.status(200).json({ worldMap: worldData });
  } catch (error) {
    console.error('Error fetching world map:', error);
    res.status(500).json({ error: 'Failed to fetch world map data' });
  }
});

/**
 * Get resource nodes
 */
router.get('/resources', async (req, res) => {
  try {
    const resourceNodes = await gameModel.loadResourceNodes();
    res.status(200).json({ resourceNodes });
  } catch (error) {
    console.error('Error fetching resource nodes:', error);
    res.status(500).json({ error: 'Failed to fetch resource nodes' });
  }
});

/**
 * Get world items
 */
router.get('/items', async (req, res) => {
  try {
    const worldItems = await gameModel.loadWorldItems();
    res.status(200).json({ worldItems });
  } catch (error) {
    console.error('Error fetching world items:', error);
    res.status(500).json({ error: 'Failed to fetch world items' });
  }
});

/**
 * Get game leaderboard
 */
router.get('/leaderboard', async (req, res) => {
  try {
    // Get top players based on their level
    const { data: leaderboard, error } = await supabase
      .from('player_data')
      .select('*, profiles:user_id(username, avatar_url)')
      .order('level', { ascending: false })
      .limit(10);
    
    if (error) {
      return res.status(500).json({ error: error.message });
    }
    
    const formattedLeaderboard = leaderboard.map(player => ({
      userId: player.user_id,
      username: player.profiles.username,
      avatarUrl: player.profiles.avatar_url,
      level: player.level,
      experience: player.experience
    }));
    
    res.status(200).json({ leaderboard: formattedLeaderboard });
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

/**
 * Get server status
 */
router.get('/status', (req, res) => {
  // Simple health check endpoint
  const status = {
    server: 'online',
    version: process.env.APP_VERSION || '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
  
  res.status(200).json(status);
});

module.exports = router; 