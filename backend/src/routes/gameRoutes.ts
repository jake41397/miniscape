import express, { Request, Response, NextFunction, Router } from 'express';
import * as gameModel from '../models/mongodb/gameModel';
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
    // This should be updated to use a WorldMap model when created
    // For now, return a placeholder response
    res.status(200).json({ 
      worldMap: [], 
      message: 'World map data is now stored in MongoDB and needs to be implemented' 
    });
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
    // Import the required models
    const { PlayerData, Profile } = await import('../models/mongodb');
    
    // Get top players based on their level
    const players = await PlayerData.find()
      .sort({ level: -1 })
      .limit(10);
    
    // Create a formatted leaderboard with joined profile information
    const formattedLeaderboard = await Promise.all(
      players.map(async (player: any) => {
        // Find the profile for this player
        const profile = await Profile.findOne({ userId: player.userId });
        
        return {
          userId: player.userId,
          username: profile ? profile.username : 'Unknown Player',
          avatarUrl: profile ? profile.avatarUrl : null,
          level: player.level || 1,
          experience: player.experience || 0
        };
      })
    );
    
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