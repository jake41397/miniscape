import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import { Server, Socket } from 'socket.io';
// Import socket controller as a regular module with any type
// @ts-ignore - Ignore the TypeScript error for the controller import
import { initializeGameState, setupSocketHandlers } from './controllers/socketController';
import * as authMiddleware from './middleware/authMiddleware';
import { verifySocketToken } from './middleware/authMiddleware';
import authRoutes from './routes/authRoutes';
import playerRoutes from './routes/playerRoutes';
import gameRoutes from './routes/gameRoutes';
import logger from './utils/logger';

// Define the extended Socket interface
interface ExtendedSocket extends Socket {
  user?: {
    id: string;
    [key: string]: any;
  };
}

// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());

// Health check route (public)
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok' });
});

// Auth routes (public)
app.use('/auth', authRoutes);

// Protected routes
app.use('/api/player', authMiddleware.verifyToken, playerRoutes);
app.use('/api/game', authMiddleware.verifyToken, gameRoutes);

// Create HTTP Server
const server = http.createServer(app);

// Initialize Socket.IO
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Apply socket authentication middleware
io.use(async (socket: ExtendedSocket, next) => {
  try {
    await verifySocketToken(socket, next);
  } catch (err: any) {
    logger.error('Socket middleware error', err instanceof Error ? err : new Error(String(err)));
    next(new Error('Authentication error'));
  }
});

// Initialize game state
initializeGameState().catch((err: any) => {
  logger.error('Failed to initialize game state', err instanceof Error ? err : new Error(String(err)));
  process.exit(1);
});

// Setup socket handlers
io.on('connection', (socket: ExtendedSocket) => {
  logger.info('New socket connection', { socketId: socket.id });
  
  // Verify that socket has a user attached after authentication
  if (!socket.user) {
    logger.error('Socket connected but has no user object', null, { socketId: socket.id });
    socket.disconnect();
    return;
  }
  
  logger.info('Socket authenticated', { socketId: socket.id, userId: socket.user.id });
  setupSocketHandlers(io, socket);
});

// Start server
server.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`, { 
    environment: process.env.NODE_ENV,
    version: process.env.APP_VERSION || '1.0.0'
  });
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
}); 