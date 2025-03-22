require('dotenv').config();
const express = require('express');
const http = require('http');
const cors = require('cors');
const socketIo = require('socket.io');
const { initializeGameState, setupSocketHandlers } = require('./controllers/socketController');
const authMiddleware = require('./middleware/authMiddleware');
const authRoutes = require('./routes/authRoutes');
const playerRoutes = require('./routes/playerRoutes');
const gameRoutes = require('./routes/gameRoutes');
const logger = require('./utils/logger');

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
app.get('/health', (req, res) => {
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
const io = socketIo(server, {
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
    credentials: true
  }
});

// Initialize game state
initializeGameState().catch(err => {
  logger.error('Failed to initialize game state', err);
  process.exit(1);
});

// Setup socket handlers
io.on('connection', (socket) => {
  logger.info('New socket connection', { socketId: socket.id });
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