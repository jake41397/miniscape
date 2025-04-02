import express, { Request, Response } from 'express';
import logger from '../utils/logger';
import { verifyJwtToken } from '../middleware/authMiddleware';
import { 
  registerUser, 
  loginUser, 
  createGuestSession, 
  getUserProfile,
  verifyUserToken 
} from '../services/authService';
import { generateTokenPair } from '../utils/jwt';
import Profile from '../models/mongodb/profileModel';
import PlayerData from '../models/mongodb/playerDataModel';

const router = express.Router();

// Extend the Express Request interface
interface AuthRequest extends Request {
  user?: any;
  isGuest?: boolean;
}

interface AuthCodeRequest {
  code: string;
}

interface TokenRequest {
  token: string;
}

/**
 * Exchange auth code for session
 */
router.post('/callback', async (req: Request<{}, {}, AuthCodeRequest>, res: Response) => {
  try {
    const { code } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Auth code is required' });
    }
    
    // Exchange auth code for session using our own authentication service
    // instead of Supabase
    try {
      const { userId, email } = await verifyUserToken(code);
      
      // Check if user profile exists in MongoDB
      const profile = await Profile.findOne({ userId });
      
      // If profile doesn't exist, create it
      if (!profile) {
        // Create username from email
        const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
        
        try {
          // Create new profile in MongoDB
          const newProfile = await Profile.create({
            userId,
            username: username,
            lastLogin: new Date()
          });
          
          // Create initial player data in MongoDB
          const newPlayerData = await PlayerData.create({
            userId,
            x: 0,
            y: 1,
            z: 0,
            inventory: [],
            stats: {},
            isTemporary: false,
            createdAt: new Date(),
            updatedAt: new Date()
          });
          
          logger.info(`Created new profile and player data for ${userId}`);
        } catch (err) {
          const createError = err instanceof Error ? err : new Error(String(err));
          logger.error('Error creating profile/player data', createError);
          return res.status(500).json({ error: 'Failed to create user profile' });
        }
      } else {
        // Update last login time
        await Profile.updateOne(
          { userId },
          { lastLogin: new Date() }
        );
      }
      
      // Generate new tokens
      const { accessToken, refreshToken } = await loginUser(email, '');
      
      res.status(200).json({ 
        session: {
          access_token: accessToken,
          refresh_token: refreshToken,
          user: { id: userId, email }
        } 
      });
    } catch (err) {
      const error = err instanceof Error ? err : new Error(String(err));
      logger.error('Auth code verification failed', error);
      return res.status(401).json({ error: 'Invalid auth code' });
    }
    
  } catch (error) {
    logger.error('Auth callback error', error instanceof Error ? error : new Error('Unknown error'));
    res.status(500).json({ error: 'Authentication failed' });
  }
});

/**
 * Verify a token
 */
router.post('/verify', async (req: Request<{}, {}, TokenRequest>, res: Response) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({ error: 'Token is required' });
    }
    
    try {
      // Verify token using our JWT util
      const decoded = await verifyUserToken(token);
      
      if (!decoded || !decoded.userId) {
        return res.status(401).json({ error: 'Invalid token' });
      }
      
      // Get user data from MongoDB
      const user = await getUserProfile(decoded.userId);
      
      res.status(200).json({ user });
    } catch (err) {
      logger.error('Token verification failed', err instanceof Error ? err : new Error(String(err)));
      return res.status(401).json({ error: 'Invalid token' });
    }
    
  } catch (error) {
    logger.error('Token verification error', error instanceof Error ? error : new Error('Unknown error'));
    res.status(500).json({ error: 'Token verification failed' });
  }
});

/**
 * @route POST /api/auth/register
 * @description Register a new user
 * @access Public
 */
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { email, password, username } = req.body;

    // Validate input
    if (!email || !password || !username) {
      return res.status(400).json({ error: 'Please provide all required fields' });
    }

    if (username.length < 3 || username.length > 32) {
      return res.status(400).json({ error: 'Username must be between 3 and 32 characters' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters' });
    }

    // Register user
    const { user, tokens } = await registerUser(email, password, username);

    // Return user data and tokens
    return res.status(201).json({
      message: 'User registered successfully',
      user,
      tokens
    });
  } catch (error) {
    logger.error('Registration error', error instanceof Error ? error : new Error('Unknown error'));
    
    // Return appropriate error messages
    if (error instanceof Error) {
      if (error.message === 'User already exists') {
        return res.status(400).json({ error: 'User already exists' });
      }
      if (error.message === 'Username already taken') {
        return res.status(400).json({ error: 'Username already taken' });
      }
    }

    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @route POST /api/auth/login
 * @description Login a user
 * @access Public
 */
router.post('/login', async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Please provide email and password' });
    }

    // Login user
    const { user, accessToken, refreshToken } = await loginUser(email, password);

    // Return user data and tokens
    return res.status(200).json({
      message: 'Login successful',
      user,
      tokens: { accessToken, refreshToken }
    });
  } catch (error) {
    logger.error('Login error', error instanceof Error ? error : new Error('Unknown error'));
    
    // Return appropriate error messages
    if (error instanceof Error && error.message === 'Invalid credentials') {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @route POST /api/auth/guest
 * @description Create a guest session
 * @access Public
 */
router.post('/guest', async (req: Request, res: Response) => {
  try {
    const { existingSessionId } = req.body;
    let sessionId, token;

    // Check if client provided an existing session ID
    if (existingSessionId) {
      // Check if this session exists in the database
      const existingSession = await PlayerData.findOne({ sessionId: existingSessionId });
      
      if (existingSession) {
        // Session exists, update lastActive and return the same sessionId
        await PlayerData.updateOne(
          { sessionId: existingSessionId },
          { lastActive: new Date() }
        );
        
        // Generate a new token for the existing session
        sessionId = existingSessionId;
        token = generateTokenPair(sessionId, undefined, true).accessToken;
        
        logger.info(`Restored existing guest session: ${sessionId}`);
      } else {
        // Session doesn't exist or expired, create a new one
        logger.info(`Session ${existingSessionId} not found, creating new session`);
        const newSession = await createGuestSession();
        sessionId = newSession.sessionId;
        token = newSession.token;
      }
    } else {
      // No existing session ID, create a new guest session
      const newSession = await createGuestSession();
      sessionId = newSession.sessionId;
      token = newSession.token;
    }

    // Return session data
    return res.status(200).json({
      message: 'Guest session created',
      sessionId,
      token
    });
  } catch (error) {
    logger.error('Guest session error', error instanceof Error ? error : new Error('Unknown error'));
    return res.status(500).json({ error: 'Server error' });
  }
});

/**
 * @route GET /api/auth/me
 * @description Get current user profile
 * @access Private
 */
router.get('/me', verifyJwtToken, async (req: AuthRequest, res: Response) => {
  try {
    // Check if user is guest
    if (req.isGuest) {
      return res.status(200).json({
        isGuest: true,
        sessionId: req.user.id
      });
    }

    // Get user profile
    const profile = await getUserProfile(req.user._id);

    // Return user profile
    return res.status(200).json(profile);
  } catch (error) {
    logger.error('Profile fetch error', error instanceof Error ? error : new Error('Unknown error'));
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router; 