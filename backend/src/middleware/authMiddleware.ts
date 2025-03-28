import { Request, Response, NextFunction } from 'express';
import { Socket } from 'socket.io';
import supabase from '../config/supabase';
import logger from '../utils/logger';

// Define extended socket interface
interface ExtendedSocket extends Socket {
  user?: any;
}

/**
 * Extended Express Request interface to include user property
 */
interface AuthenticatedRequest extends Request {
  user?: any;
}

/**
 * Middleware to verify JWT token
 */
export const verifyToken = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void | Response> => {
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
    
    // Verify the token with Supabase
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data.user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }
    
    // Attach user to request object
    req.user = data.user;
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
    
    // If no token in auth, try to get from headers
    if (!token && socket.handshake.headers.authorization) {
      const authHeader = socket.handshake.headers.authorization as string;
      const parts = authHeader.split(' ');
      if (parts.length === 2 && parts[0] === 'Bearer') {
        token = parts[1];
      }
    }
    
    if (!token) {
      // Allow connection without authentication
      logger.info('No authentication token provided for socket - allowing as guest', { socketId: socket.id });
      return next();
    }
    
    // Verify the token with Supabase
    const { data, error } = await supabase.auth.getUser(token);
    
    if (error || !data.user) {
      logger.error('Invalid token for socket', error instanceof Error ? error : null, { socketId: socket.id });
      // Still allow connection without authentication if token is invalid
      logger.info('Invalid token - allowing as guest', { socketId: socket.id });
      return next();
    }
    
    // Attach user to socket
    socket.user = data.user;
    logger.info(`Socket authenticated as user`, { socketId: socket.id, userId: data.user.id });
    next();
  } catch (error) {
    logger.error('Socket authentication error', error instanceof Error ? error : new Error('Unknown error'));
    // Allow connection despite authentication error
    logger.info('Auth error - allowing as guest', { socketId: socket.id });
    next();
  }
}; 