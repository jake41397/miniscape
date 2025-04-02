import mongoose from 'mongoose';
import dotenv from 'dotenv';
import dotenvExpand from 'dotenv-expand';
import logger from '../utils/logger';

// Load and expand environment variables
const env = dotenv.config();
dotenvExpand.expand(env);

// Get MongoDB connection string from environment variables
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/miniscape';

// Maximum number of connection attempts
const MAX_CONNECTION_ATTEMPTS = 5;
const CONNECTION_RETRY_DELAY_MS = 3000;

/**
 * Perform a connection validation to ensure MongoDB is available
 * This should be called during server startup to ensure database is accessible
 */
export const validateDatabaseConnection = async (): Promise<boolean> => {
  let attempts = 0;
  
  while (attempts < MAX_CONNECTION_ATTEMPTS) {
    attempts++;
    logger.info(`MongoDB connection validation attempt ${attempts}/${MAX_CONNECTION_ATTEMPTS}...`);
    
    if (mongoose.connection.readyState === 1) {
      logger.info('MongoDB connection already established');
      return true;
    }
    
    try {
      await mongoose.connect(MONGODB_URI, {
        serverSelectionTimeoutMS: 5000, // Shorter timeout for validation
        connectTimeoutMS: 5000,
        socketTimeoutMS: 5000,
        bufferCommands: false,
      });
      
      // Test connection with a simple query
      if (mongoose.connection.db) {
        // Try a simple command to verify the connection
        await mongoose.connection.db.command({ ping: 1 });
        logger.info('MongoDB connection validated successfully');
        return true;
      }
    } catch (error) {
      logger.error(`MongoDB connection validation failed (attempt ${attempts}/${MAX_CONNECTION_ATTEMPTS})`, 
        error instanceof Error ? error : new Error('Unknown error'));
      
      if (attempts >= MAX_CONNECTION_ATTEMPTS) {
        logger.error('All MongoDB connection validation attempts failed');
        return false;
      }
      
      logger.info(`Retrying in ${CONNECTION_RETRY_DELAY_MS / 1000} seconds...`);
      await new Promise(resolve => setTimeout(resolve, CONNECTION_RETRY_DELAY_MS));
    }
  }
  
  return false;
};

// Connect to MongoDB with advanced options
const connectToMongoDB = async (): Promise<void> => {
  try {
    logger.info('Connecting to MongoDB...', { 
      uri: MONGODB_URI.includes('mongodb+srv://') 
        ? MONGODB_URI.split('@')[0].replace(/mongodb\+srv:\/\/[^:]+:[^@]+/, 'mongodb+srv://****:****') + '@' + MONGODB_URI.split('@')[1]
        : 'mongodb://localhost:27017/miniscape'
    });

    await mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 30000, // Increase from 10s to 30s
      connectTimeoutMS: 30000,
      socketTimeoutMS: 45000,
      // Prevent buffering commands until connected
      bufferCommands: false,
      // Set connection pool size
      maxPoolSize: 10,
      minPoolSize: 1
    });

    logger.info('Successfully connected to MongoDB');
    
    // Test connection with a simple query
    if (mongoose.connection.db) {
      const collections = await mongoose.connection.db.listCollections().toArray();
      logger.info(`MongoDB collections count: ${collections.length}`);
    } else {
      logger.warn('MongoDB connected but db instance is not available');
    }
  } catch (error) {
    logger.error('MongoDB connection error', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
};

// Close MongoDB connection
const closeMongoDBConnection = async (): Promise<void> => {
  try {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
  } catch (error) {
    logger.error('Error closing MongoDB connection', error instanceof Error ? error : new Error('Unknown error'));
  }
};

// Listen for MongoDB connection events
mongoose.connection.on('error', (err) => {
  logger.error('MongoDB connection error', err);
});

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected, attempting to reconnect');
});

mongoose.connection.on('reconnected', () => {
  logger.info('MongoDB reconnected');
});

// Export the connection functions
export { 
  connectToMongoDB, 
  closeMongoDBConnection 
};

export default mongoose; 