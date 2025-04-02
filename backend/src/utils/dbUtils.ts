import mongoose from 'mongoose';
import logger from './logger';

/**
 * A wrapper function for MongoDB operations that handles errors and implements retry logic
 * @param operation The MongoDB operation function to execute
 * @param operationName A name/description for the operation (for logging)
 * @param maxRetries Maximum number of retry attempts
 * @param retryDelayMs Delay between retries in milliseconds
 * @returns Result of the database operation
 */
export async function withDatabaseRetry<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries: number = 3,
  retryDelayMs: number = 1000
): Promise<T> {
  let lastError: Error | null = null;
  let retryCount = 0;

  // First, check if we're connected to the database
  if (mongoose.connection.readyState !== 1) {
    logger.warn(`Database not connected for operation: ${operationName}. Current state: ${mongoose.connection.readyState}`);
    throw new Error(`Database not connected for operation: ${operationName}`);
  }

  while (retryCount <= maxRetries) {
    try {
      // Attempt the database operation
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      retryCount++;

      // Log the error
      logger.error(`Database operation "${operationName}" failed (attempt ${retryCount}/${maxRetries}): ${lastError.message}`);

      // If this was the last retry, throw the error
      if (retryCount > maxRetries) {
        break;
      }

      // If error is a timeout, we might want to handle it differently
      const isTimeoutError = lastError.message.includes('buffering timed out') || 
                            lastError.message.includes('timeout') ||
                            lastError.name === 'MongooseError' ||
                            lastError.name === 'MongoServerSelectionError';

      if (isTimeoutError) {
        logger.warn(`Timeout detected in operation "${operationName}". Checking connection before retry...`);
        
        // Check connection state before retry
        if (mongoose.connection.readyState !== 1) {
          logger.error(`Database disconnected during operation "${operationName}". Connection state: ${mongoose.connection.readyState}`);
        }
      }

      // Wait before retrying
      const delay = retryDelayMs * Math.pow(2, retryCount - 1); // Exponential backoff
      logger.info(`Retrying operation "${operationName}" in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  // If we've exhausted all retries, throw the last error
  throw lastError || new Error(`Failed to execute database operation "${operationName}" after ${maxRetries} retries`);
}

/**
 * Checks if the database connection is active
 * @returns Boolean indicating if the database is connected
 */
export function isDatabaseConnected(): boolean {
  return mongoose.connection.readyState === 1;
}

export default {
  withDatabaseRetry,
  isDatabaseConnected
}; 