import dotenv from 'dotenv';
import express, { Request, Response } from 'express';
import http from 'http';
import cors from 'cors';
import { Server, Socket } from 'socket.io';
// Import socket controller as a regular module with any type
// @ts-ignore - Ignore the TypeScript error for the controller import
import { initializeGameState, setupSocketHandlers, getPlayers } from './controllers/socketController';
import * as authMiddleware from './middleware/authMiddleware';
import { verifySocketToken } from './middleware/authMiddleware';
import authRoutes from './routes/authRoutes';
import playerRoutes from './routes/playerRoutes';
import gameRoutes from './routes/gameRoutes';
import logger from './utils/logger';
import { configureSocketIO } from './middleware/corsMiddleware';
// Import the InventoryHandler class
import InventoryHandler from './controllers/handlers/InventoryHandler';

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
  origin: [
    'http://localhost:3000',
    'http://localhost:8080',
    'https://miniscape.vercel.app',
    'http://dev.miniscape.io',
    'https://dev.miniscape.io',
    'http://miniscape.io',
    'https://miniscape.io',
    'http://www.miniscape.io',
    'https://www.miniscape.io'
  ],
  credentials: true
}));
app.use(express.json());

// Health check route (public)
app.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
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
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4000',
      'http://localhost:4001',
      'http://localhost:5000',
      'http://localhost:8080',
      'https://localhost:3000',
      'https://localhost:3001',
      'https://localhost:4000',
      'https://miniscape.vercel.app',
      'http://dev.miniscape.io',
      'https://dev.miniscape.io',
      'http://miniscape.io',
      'https://miniscape.io',
      'http://www.miniscape.io',
      'https://www.miniscape.io',
      // Handle wildcards for subdomains
      /^https?:\/\/.*\.miniscape\.io$/
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true,
    // Allow all headers
    allowedHeaders: ['Authorization', 'Content-Type', 'X-Requested-With', 'Accept'],
    exposedHeaders: ['set-cookie']
  },
  path: '/socket.io',
  // Allow transport failover with longer timeout
  transports: ['websocket', 'polling'],
  connectTimeout: 10000,
  pingTimeout: 10000
});

// Configure Socket.IO settings
configureSocketIO(io);

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
initializeGameState()
  .then(() => {
    logger.info('Game state initialized successfully');
    
    // Get the players object after initialization
    const players = getPlayers();
    
    // Initialize the InventoryHandler with the players object
    const inventoryHandler = new InventoryHandler(io, players);
    
    // Setup socket handlers
    io.on('connection', (socket: ExtendedSocket) => {
      const socketId = socket.id;
      logger.info(`Client connected: ${socketId}`);
      
      // Log relevant information
      logger.info('New connection details', {
        connectionId: socketId,
        userAgent: socket.handshake.headers['user-agent'],
        remoteAddress: socket.handshake.address,
        time: new Date().toISOString()
      });
      
      // Check for authentication
      const userId = socket.user?.id;
      if (userId) {
        // Log authenticated connection
        logger.info(`Authenticated connection: ${socketId} (User: ${userId})`);
        socket.emit('authStatus', { authenticated: true, userId });
      } else {
        // Log anonymous connection
        logger.info(`Anonymous connection: ${socketId}`);
        socket.emit('authStatus', { authenticated: false });
      }
      
      // Set up all inventory handlers
      inventoryHandler.setupAllHandlers(socket);
      
      // Set up other socket handlers
      setupSocketHandlers(io, socket);
    });
  })
  .catch((error) => {
    logger.error('Failed to initialize game state', error);
  });

// Start server
server.listen(PORT, () => {
  logger.info(`MiniScape backend server running on port ${PORT}`);
  logger.info(`Socket.IO server available at path /socket.io`);
  
  // Broadcast initial player count in case there are any connected players
  setTimeout(() => {
    // Import broadcastPlayerCount function from socketController
    const { broadcastPlayerCount } = require('./controllers/socketController');
    if (typeof broadcastPlayerCount === 'function') {
      broadcastPlayerCount(io);
      logger.info('Initial player count broadcast sent');
    }
  }, 5000); // Wait 5 seconds to ensure everything is initialized
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