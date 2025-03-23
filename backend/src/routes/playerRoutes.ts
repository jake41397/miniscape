import express, { Request, Response, NextFunction, Router } from 'express';
import supabase from '../config/supabase';
import logger from '../utils/logger';

// Extended Request interface with user property
interface AuthenticatedRequest extends Request {
  user: {
    id: string;
    [key: string]: any;
  };
}

// Define interfaces for request body types
interface ProfileUpdateRequest {
  username?: string;
  avatar_url?: string;
}

const router: Router = express.Router();

// Type for route handlers to fix TypeScript errors
type RouteHandler = (
  req: Request | AuthenticatedRequest,
  res: Response,
  next?: NextFunction
) => Promise<any> | any;

/**
 * Get current player profile
 */
router.get('/profile', (async (req: AuthenticatedRequest, res: Response) => {
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
    logger.error('Error fetching profile', error instanceof Error ? error : new Error('Unknown error'));
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
}) as RouteHandler);

/**
 * Update player profile
 */
router.put('/profile', (async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user.id;
    const { username, avatar_url } = req.body as ProfileUpdateRequest;
    
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
    logger.error('Error updating profile', error instanceof Error ? error : new Error('Unknown error'));
    res.status(500).json({ error: 'Failed to update profile' });
  }
}) as RouteHandler);

/**
 * Get player game data
 */
router.get('/data', (async (req: AuthenticatedRequest, res: Response) => {
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
    logger.error('Error fetching player data', error instanceof Error ? error : new Error('Unknown error'));
    res.status(500).json({ error: 'Failed to fetch player data' });
  }
}) as RouteHandler);

/**
 * Get all online players
 */
router.get('/online', (async (req: Request, res: Response) => {
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
    logger.error('Error fetching online players', error instanceof Error ? error : new Error('Unknown error'));
    res.status(500).json({ error: 'Failed to fetch online players' });
  }
}) as RouteHandler);

export default router; 