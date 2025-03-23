import { Server } from 'socket.io';
import logger from '../utils/logger';

/**
 * Configure CORS and other settings for Socket.IO server
 * @param io - Socket.IO server instance
 */
export const configureSocketIO = (io: Server): void => {
  // Allow connections from frontend
  const allowedOrigins = [
    'http://localhost:3000',    // Local Next.js dev server
    'http://localhost:8080',
    'https://dev.miniscape.io',
    'https://miniscape.io',
    'https://www.miniscape.io',
    'https://miniscape.vercel.app' // Production URL (update to match your domain)
  ];
  
  // Log CORS configuration
  logger.info('Configuring Socket.IO CORS settings', { allowedOrigins });

  io.engine.on('headers', (headers: any) => {
    // Add any custom headers needed
    headers['Access-Control-Allow-Credentials'] = true;
  });

  // Configure Socket.IO server
  io.on('connection', (socket) => {
    const origin = socket.handshake.headers.origin;
    logger.info(`New socket connection from origin: ${origin || 'unknown'}`, { 
      socketId: socket.id,
      userAgent: socket.handshake.headers['user-agent']
    });
  });
}; 