import express from 'express';
import http from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import { initDatabase, closeDatabase } from './db/database';
import logger from './utils/logger';
import { setupSocketHandlers } from './controllers/socketController';
import { verifySocketToken } from './middleware/authMiddleware';

// Create Express application
const app = express();

// Apply middleware
app.use(cors());
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'healthy', timestamp: new Date().toISOString() });
});

// Create HTTP server
const server = http.createServer(app);

// Create Socket.IO server
const io = new SocketIOServer(server, {
  cors: {
    origin: process.env.NODE_ENV === 'production' 
      ? ['https://miniscape.io', /\.miniscape\.io$/]
      : ['http://localhost:3000', 'http://127.0.0.1:3000'],
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingInterval: 10000, // Check connection every 10 seconds
  pingTimeout: 5000 // Allow 5 seconds for client to respond before considered disconnected
});

// Setup Socket.IO authentication middleware
io.use(verifySocketToken);

// Initialize the server
export async function initServer(): Promise<http.Server> {
  try {
    // Initialize database connection
    await initDatabase();
    logger.info('Database connection established');
    
    // Setup socket handlers
    setupSocketHandlers(io);
    logger.info('Socket handlers initialized');
    
    return server;
  } catch (error) {
    logger.error('Server initialization error', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}

// Handle server shutdown
export function shutdownServer(): void {
  logger.info('Server shutting down...');
  
  // Close database connection
  closeDatabase()
    .then(() => logger.info('Database connection closed'))
    .catch(err => logger.error('Error closing database', err));
}

// Export app for testing
export { app, io };

// Handle unexpected errors
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', error);
  shutdownServer();
  process.exit(1);
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled rejection', 
    reason instanceof Error ? reason : new Error(String(reason))
  );
});

// Handle termination signals
process.on('SIGTERM', () => {
  logger.info('SIGTERM received');
  shutdownServer();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received');
  shutdownServer();
  process.exit(0);
}); 