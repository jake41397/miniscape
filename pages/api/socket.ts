import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { Socket as NetSocket } from 'net';
import { Player } from '../../types/player';

interface SocketServer extends HTTPServer {
  io?: SocketIOServer | null;
}

interface SocketWithIO extends NetSocket {
  server: SocketServer;
}

interface NextApiResponseWithSocket extends NextApiResponse {
  socket: SocketWithIO;
}

// Main socket handling
const socket = async (req: NextApiRequest, res: NextApiResponseWithSocket) => {
  // Skip if socket is already initialized
  if (res.socket.server.io) {
    console.log('Socket is already running');
    res.end();
    return;
  }

  console.log('Setting up socket');
  
  // Create a new Socket.IO server
  const io = new SocketIOServer(res.socket.server, {
    path: '/api/socket',
    addTrailingSlash: false,
  });
  res.socket.server.io = io;

  // Store connected players
  const players: Record<string, Player> = {};

  // Socket event handlers
  io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);
    
    // Create placeholder player
    const newPlayer: Player = {
      id: socket.id,
      name: `Player${socket.id.substring(0, 4)}`,
      x: 0,
      y: 1, // Standing on ground
      z: 0
    };
    
    // Store the player in our players object
    players[socket.id] = newPlayer;
    
    // Tell all other clients about the new player
    socket.broadcast.emit('playerJoined', newPlayer);
    
    // Send the new player the list of existing players
    const existingPlayers = Object.values(players).filter(p => p.id !== socket.id);
    socket.emit('initPlayers', existingPlayers);
    
    // Handle player movement
    socket.on('playerMove', (position) => {
      // Update player position in server state
      if (players[socket.id]) {
        players[socket.id].x = position.x;
        players[socket.id].y = position.y;
        players[socket.id].z = position.z;
        
        // Broadcast new position to all other clients
        socket.broadcast.emit('playerMoved', {
          id: socket.id,
          ...position
        });
      }
    });
    
    // Handle chat messages
    socket.on('chat', (text) => {
      const playerName = players[socket.id]?.name || 'Unknown';
      io.emit('chatMessage', { name: playerName, text });
    });
    
    // Custom join with name
    socket.on('join', (name) => {
      if (players[socket.id]) {
        players[socket.id].name = name;
        // Inform others of name change
        socket.broadcast.emit('playerJoined', players[socket.id]);
      }
    });
    
    // Handle player disconnection
    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${socket.id}`);
      // Remove player from our players object
      delete players[socket.id];
      // Tell everyone this player left
      io.emit('playerLeft', socket.id);
    });
  });

  res.end();
};

// Disable the bodyParser for this route
export const config = {
  api: {
    bodyParser: false,
  },
};

export default socket; 