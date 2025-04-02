import mongoose from 'mongoose';
import { connectToMongoDB, closeMongoDBConnection, validateDatabaseConnection } from '../config/mongodb';
import logger from '../utils/logger';
import models from '../models/mongodb';

/**
 * Initialize database connection
 */
export async function initDatabase(): Promise<void> {
  try {
    // First, validate database connection is available
    const isValid = await validateDatabaseConnection();
    
    if (!isValid) {
      logger.error('Failed to validate database connection - cannot proceed');
      throw new Error('Database connection validation failed');
    }
    
    // Then connect with full options
    await connectToMongoDB();
    logger.info('Database initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize database', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}

/**
 * Get all models from MongoDB
 */
export function getModels() {
  return models;
}

/**
 * Get mongoose instance
 */
export function getMongoose() {
  return mongoose;
}

/**
 * Close the database connection
 */
export async function closeDatabase(): Promise<void> {
  try {
    await closeMongoDBConnection();
    logger.info('Database connection closed');
  } catch (error) {
    logger.error('Error closing database connection', error instanceof Error ? error : new Error('Unknown error'));
  }
}

/**
 * Check database connection
 */
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    const state = mongoose.connection.readyState;
    const connected = state === 1; // 1 = connected
    logger.info(`Database connection check: ${connected ? 'Connected' : 'Disconnected'}`);
    return connected;
  } catch (error) {
    logger.error('Error checking database connection', error instanceof Error ? error : new Error('Unknown error'));
    return false;
  }
}

export default {
  initDatabase,
  getModels,
  getMongoose,
  closeDatabase,
  checkDatabaseConnection
}; 