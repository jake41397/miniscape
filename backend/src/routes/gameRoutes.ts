import express, { Request, Response, NextFunction, Router } from 'express';
import supabase from '../config/supabase';
import * as gameModel from '../models/gameModel';
import logger from '../utils/logger';

const router: Router = express.Router();

// Type for route handlers to fix TypeScript errors
type RouteHandler = (
  req: Request,
  res: Response,
  next?: NextFunction
) => Promise<any> | any;

/**
 * Get world map data
 */
router.get('/world', (async (req: Request, res: Response) => {
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
    logger.error('Error fetching world map', error instanceof Error ? error : new Error('Unknown error'));
    res.status(500).json({ error: 'Failed to fetch world map data' });
  }
}) as RouteHandler);

/**
 * Get resource nodes
 */
router.get('/resources', (async (req: Request, res: Response) => {
  try {
    const resourceNodes = await gameModel.loadResourceNodes();
    res.status(200).json({ resourceNodes });
  } catch (error) {
    logger.error('Error fetching resource nodes', error instanceof Error ? error : new Error('Unknown error'));
    res.status(500).json({ error: 'Failed to fetch resource nodes' });
  }
}) as RouteHandler);

/**
 * Get world items
 */
router.get('/items', (async (req: Request, res: Response) => {
  try {
    const worldItems = await gameModel.loadWorldItems();
    res.status(200).json({ worldItems });
  } catch (error) {
    logger.error('Error fetching world items', error instanceof Error ? error : new Error('Unknown error'));
    res.status(500).json({ error: 'Failed to fetch world items' });
  }
}) as RouteHandler);

/**
 * Get game leaderboard
 */
router.get('/leaderboard', (async (req: Request, res: Response) => {
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
    
    const formattedLeaderboard = leaderboard.map((player: any) => ({
      userId: player.user_id,
      username: player.profiles.username,
      avatarUrl: player.profiles.avatar_url,
      level: player.level,
      experience: player.experience
    }));
    
    res.status(200).json({ leaderboard: formattedLeaderboard });
  } catch (error) {
    logger.error('Error fetching leaderboard', error instanceof Error ? error : new Error('Unknown error'));
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
}) as RouteHandler);

/**
 * Get server status
 */
router.get('/status', ((req: Request, res: Response) => {
  // Simple health check endpoint
  const status = {
    server: 'online',
    version: process.env.APP_VERSION || '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  };
  
  res.status(200).json(status);
}) as RouteHandler);

export default router; 