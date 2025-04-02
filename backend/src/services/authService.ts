import bcrypt from 'bcryptjs';
import mongoose, { Document } from 'mongoose';
import { User, Profile, PlayerData } from '../models/mongodb';
import { generateTokenPair, verifyToken } from '../utils/jwt';
import logger from '../utils/logger';

// Define interface for User document
interface IUser extends Document {
  _id: mongoose.Types.ObjectId;
  email: string;
  comparePassword(candidatePassword: string): Promise<boolean>;
  lastLogin: Date;
}

/**
 * Register a new user
 */
export const registerUser = async (
  email: string, 
  password: string, 
  username: string
): Promise<{ user: any; tokens: { accessToken: string; refreshToken: string } }> => {
  try {
    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      throw new Error('User already exists');
    }

    // Check if username is taken
    const existingUsername = await Profile.findOne({ username });
    if (existingUsername) {
      throw new Error('Username already taken');
    }

    // Create user transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Create user
      const user = await User.create([{
        email,
        password,
        isGuest: false,
        lastLogin: new Date()
      }], { session });

      // Create profile
      const profile = await Profile.create([{
        userId: user[0]._id,
        username,
        lastLogin: new Date()
      }], { session });

      // Create player data
      await PlayerData.create([{
        userId: user[0]._id,
        isTemporary: false
      }], { session });

      // Commit transaction
      await session.commitTransaction();
      session.endSession();

      // Generate JWT
      const tokens = generateTokenPair(String(user[0]._id), user[0].email);

      // Return user data without password
      const userWithoutPassword = {
        _id: user[0]._id,
        email: user[0].email,
        profile: {
          username: profile[0].username,
          avatarUrl: profile[0].avatarUrl
        }
      };

      return { user: userWithoutPassword, tokens };
    } catch (error) {
      // Rollback transaction on error
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    logger.error('Error registering user', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
};

/**
 * Login a user
 */
export const loginUser = async (
  email: string, 
  password: string
): Promise<{ user: any; accessToken: string; refreshToken: string }> => {
  try {
    // Find user
    const user = await User.findOne({ email }).select('+password') as IUser | null;
    if (!user) {
      throw new Error('Invalid credentials');
    }

    // Check password - skip if empty (used for OAuth flows)
    if (password) {
      const isMatch = await user.comparePassword(password);
      if (!isMatch) {
        throw new Error('Invalid credentials');
      }
    }

    // Update last login
    user.lastLogin = new Date();
    await user.save();

    // Find profile
    const profile = await Profile.findOne({ userId: user._id });
    if (!profile) {
      throw new Error('User profile not found');
    }

    // Update profile last login
    profile.lastLogin = new Date();
    await profile.save();

    // Generate tokens
    const { accessToken, refreshToken } = generateTokenPair(user._id.toString(), user.email);

    // Return user data without password
    const userWithoutPassword = {
      _id: user._id,
      email: user.email,
      profile: {
        username: profile.username,
        avatarUrl: profile.avatarUrl
      }
    };

    return { user: userWithoutPassword, accessToken, refreshToken };
  } catch (error) {
    logger.error('Error logging in user', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
};

/**
 * Verify a user token (OAuth code or JWT)
 */
export const verifyUserToken = async (
  token: string
): Promise<{ userId: string; email: string }> => {
  try {
    // Try to verify as a JWT token
    const decoded = verifyToken(token);
    
    if (!decoded || !decoded.userId) {
      throw new Error('Invalid token');
    }
    
    // Get user from database
    const user = await User.findById(decoded.userId) as IUser | null;
    if (!user) {
      throw new Error('User not found');
    }
    
    return {
      userId: user._id.toString(),
      email: user.email
    };
  } catch (error) {
    logger.error('Error verifying user token', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
};

/**
 * Create a guest user
 */
export const createGuestSession = async (): Promise<{ sessionId: string; token: string }> => {
  try {
    // Generate unique session ID
    const sessionId = `temp-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    
    // Generate guest username
    const guestUsername = `Guest-${sessionId.substring(5, 9)}`;
    
    // Create temporary player data in MongoDB
    await PlayerData.create({
      isTemporary: true,
      sessionId,
      username: guestUsername,
      lastActive: new Date()
    });
    
    // Generate token with guest flag and session ID
    const payload = {
      userId: sessionId,
      isGuest: true,
      sessionId
    };
    
    const token = generateTokenPair(sessionId, undefined, true).accessToken;
    
    return { sessionId, token };
  } catch (error) {
    logger.error('Error creating guest session', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
};

/**
 * Get user profile by ID
 */
export const getUserProfile = async (userId: string): Promise<any> => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const profile = await Profile.findOne({ userId: user._id });
    if (!profile) {
      throw new Error('Profile not found');
    }

    return {
      _id: user._id,
      email: user.email,
      profile: {
        username: profile.username,
        avatarUrl: profile.avatarUrl
      }
    };
  } catch (error) {
    logger.error('Error getting user profile', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}; 