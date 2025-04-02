import jwt, { SignOptions } from 'jsonwebtoken';
import { Types } from 'mongoose';
import dotenv from 'dotenv';
import logger from './logger';

// Load environment variables
dotenv.config();

// Get JWT settings from environment variables or use defaults
const JWT_SECRET = process.env.JWT_SECRET || 'your-default-jwt-secret-dev-only';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';

// Convert string secret to buffer
const secretBuffer = Buffer.from(JWT_SECRET, 'utf-8');

// Log JWT configuration (without exposing the secret)
logger.info('JWT configuration', {
  expiresIn: JWT_EXPIRES_IN,
  refreshExpiresIn: JWT_REFRESH_EXPIRES_IN,
  secretConfigured: !!process.env.JWT_SECRET
});

// Check if JWT_SECRET is set in production
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  logger.error('JWT_SECRET not set in production environment');
  throw new Error('JWT_SECRET must be set in production environment');
}

// Interface for JWT payload
export interface JwtPayload {
  userId: string;
  email?: string;
  isGuest?: boolean;
  sessionId?: string;
  iat?: number;
  exp?: number;
}

/**
 * Generate a JWT for a user
 */
export const generateToken = (payload: JwtPayload): string => {
  try {
    const options: SignOptions = { expiresIn: Number(JWT_EXPIRES_IN) || '1h' };
    return jwt.sign(payload, secretBuffer, options);
  } catch (error) {
    logger.error('Error generating JWT', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
};

/**
 * Generate a refresh token for a user
 */
export const generateRefreshToken = (userId: string | Types.ObjectId): string => {
  try {
    const options: SignOptions = { expiresIn: Number(JWT_REFRESH_EXPIRES_IN) || '7d' };
    return jwt.sign({ userId: userId.toString() }, secretBuffer, options);
  } catch (error) {
    logger.error('Error generating refresh token', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
};

/**
 * Verify a JWT and return the decoded payload
 */
export const verifyToken = (token: string): JwtPayload | null => {
  try {
    return jwt.verify(token, secretBuffer) as JwtPayload;
  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError) {
      // Don't log expected errors like token expiration as errors
      if (error instanceof jwt.TokenExpiredError) {
        logger.debug('JWT expired', { exp: (error as jwt.TokenExpiredError).expiredAt });
      } else {
        logger.warn('JWT verification failed', { error: error.message });
      }
    } else {
      logger.error('Unexpected JWT verification error', error instanceof Error ? error : new Error('Unknown error'));
    }
    return null;
  }
};

/**
 * Verify a refresh token
 */
export const verifyRefreshToken = (token: string): { userId: string } | null => {
  try {
    const decoded = jwt.verify(token, secretBuffer) as { userId: string };
    return decoded;
  } catch (error) {
    logger.warn('Refresh token verification failed', { error: error instanceof Error ? error.message : 'Unknown error' });
    return null;
  }
};

/**
 * Generate token pair (access token and refresh token)
 */
export const generateTokenPair = (
  userId: string | Types.ObjectId,
  email?: string,
  isGuest = false
): { accessToken: string; refreshToken: string } => {
  const payload: JwtPayload = {
    userId: userId.toString(),
    email,
    isGuest
  };

  // Generate tokens
  const accessToken = generateToken(payload);
  const refreshToken = generateRefreshToken(userId);

  return { accessToken, refreshToken };
};

export default {
  generateToken,
  generateRefreshToken,
  verifyToken,
  verifyRefreshToken,
  generateTokenPair
}; 