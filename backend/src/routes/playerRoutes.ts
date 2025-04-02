import express, { Request, Response, NextFunction, Router } from 'express';
import logger from '../utils/logger';
// Import MongoDB models
import Profile from '../models/mongodb/profileModel';
import PlayerData from '../models/mongodb/playerDataModel';

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
    
    // Get player profile from MongoDB
    const profile = await Profile.findOne({ userId }).lean();
    
    if (!profile) {
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
    
    // Update profile in MongoDB
    const result = await Profile.findOneAndUpdate(
      { userId },
      { 
        username: username,
        avatarUrl: avatar_url,
        updatedAt: new Date()
      },
      { new: true }
    );
    
    if (!result) {
      return res.status(404).json({ error: 'Profile not found' });
    }
    
    res.status(200).json({ profile: result });
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
    
    // Get player data from MongoDB
    const playerData = await PlayerData.findOne({ userId }).lean();
    
    if (!playerData) {
      return res.status(404).json({ error: 'Player data not found' });
    }
    
    res.status(200).json({ playerData });
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
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
    
    const onlinePlayers = await Profile.find({
      lastLogin: { $gt: fiveMinutesAgo }
    }).select('id username avatarUrl lastLogin').lean();
    
    res.status(200).json({ onlinePlayers });
  } catch (error) {
    logger.error('Error fetching online players', error instanceof Error ? error : new Error('Unknown error'));
    res.status(500).json({ error: 'Failed to fetch online players' });
  }
}) as RouteHandler);

export default router; 