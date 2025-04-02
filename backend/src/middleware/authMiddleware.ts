import { Request, Response, NextFunction } from 'express';
import { Socket } from 'socket.io';
import { verifyToken } from '../utils/jwt';
import { User } from '../models/mongodb';
import logger from '../utils/logger';

// Define extended socket interface
interface ExtendedSocket extends Socket {
  user?: any;
  isGuest?: boolean;
  sessionId?: string;
}

/**
 * Extended Express Request interface to include user property
 */
interface AuthenticatedRequest extends Request {
  user?: any;
  isGuest?: boolean;
}

/**
 * Middleware to verify JWT token
 */
export const verifyJwtToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> => {
  try {
    // Get the authorization header
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
      return res.status(401).json({ error: 'No authorization header provided' });
    }
    
    // Check if it's Bearer token
    const parts = authHeader.split(' ');
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return res.status(401).json({ error: 'Invalid authorization format' });
    }
    
    const token = parts[1];
    
    // Verify the token
    const decoded = verifyToken(token);
    
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Check if it's a guest user
    if (decoded.isGuest) {
      // For guest users, just attach the payload to the request
      req.user = { id: decoded.userId };
      req.isGuest = true;
      next();
      return;
    }
    
    // For registered users, fetch from database
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      return res.status(401).json({ error: 'User not found' });
    }
    
    // Attach user to request object
    req.user = user;
    req.isGuest = false;
    next();
  } catch (error) {
    logger.error('Authentication error', error instanceof Error ? error : new Error('Unknown error'));
    return res.status(500).json({ error: 'Authentication failed' });
  }
};

/**
 * Socket.IO middleware to verify token
 */
export const verifySocketToken = async (socket: ExtendedSocket, next: (err?: Error) => void): Promise<void> => {
  try {
    // Try to get token from auth object first
    let token = socket.handshake.auth.token;
    
    // Check for guest session ID
    const guestSessionId = socket.handshake.auth.guestSessionId;
    
    // If no token in auth, try to get from headers
    if (!token && socket.handshake.headers.authorization) {
      const authHeader = socket.handshake.headers.authorization as string;
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }
    
    // If we have a guestSessionId, check if it exists in the database
    if (guestSessionId) {
      try {
        const { PlayerData } = require('../models/mongodb');
        const existingSession = await PlayerData.findOne({ sessionId: guestSessionId });
        
        if (existingSession) {
          // Found an existing session, use it
          socket.isGuest = true;
          socket.sessionId = guestSessionId;
          await PlayerData.updateOne(
            { sessionId: guestSessionId },
            { lastActive: new Date() }
          );
          logger.info('Restored guest session from provided sessionId', { socketId: socket.id, sessionId: guestSessionId });
          return next();
        } else {
          logger.info('Provided guest sessionId not found in database', { socketId: socket.id, sessionId: guestSessionId });
          // Continue with normal auth flow
        }
      } catch (error) {
        logger.error('Error checking for existing guest session', error instanceof Error ? error : new Error('Unknown error'));
        // Continue with normal auth flow
      }
    }
    
    if (!token) {
      // Allow connection without authentication as a guest
      socket.isGuest = true;
      socket.sessionId = `temp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      logger.info('No authentication token provided for socket - connecting as guest', { socketId: socket.id, sessionId: socket.sessionId });
      return next();
    }
    
    // Verify the token
    const decoded = verifyToken(token);
    
    if (!decoded) {
      logger.warn('Invalid token for socket', { socketId: socket.id });
      // Allow connection without authentication if token is invalid
      socket.isGuest = true;
      socket.sessionId = `temp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      logger.info('Invalid token - connecting as guest', { socketId: socket.id, sessionId: socket.sessionId });
      return next();
    }
    
    // Check if it's a guest user with a session ID
    if (decoded.isGuest && decoded.sessionId) {
      socket.isGuest = true;
      socket.sessionId = decoded.sessionId;
      logger.info('Socket authenticated as guest with session', { socketId: socket.id, sessionId: socket.sessionId });
      return next();
    }
    
    // For registered users, fetch from database
    const user = await User.findById(decoded.userId).select('-password');
    
    if (!user) {
      logger.warn('User not found in database', { socketId: socket.id, userId: decoded.userId });
      // Allow connection as guest if user not found
      socket.isGuest = true;
      socket.sessionId = `temp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
      return next();
    }
    
    // Attach user to socket
    socket.user = user;
    socket.isGuest = false;
    logger.info('Socket authenticated as registered user', { socketId: socket.id, userId: user.id });
    next();
  } catch (error) {
    logger.error('Socket authentication error', error instanceof Error ? error : new Error('Unknown error'));
    // Allow connection despite authentication error
    socket.isGuest = true;
    socket.sessionId = `temp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    logger.info('Auth error - connecting as guest', { socketId: socket.id, sessionId: socket.sessionId });
    next();
  }
}; 