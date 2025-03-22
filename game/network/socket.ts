import { io, Socket } from 'socket.io-client';
import { Player, Item } from '../../types/player';

// Define our socket events
export interface ServerToClientEvents {
  initPlayers: (players: Player[]) => void;
  playerJoined: (player: Player) => void;
  playerLeft: (playerId: string) => void;
  playerMoved: (player: { id: string, x: number, y: number, z: number }) => void;
  chatMessage: (message: { name: string, text: string }) => void;
  inventoryUpdate: (inventory: Item[]) => void;
  itemDropped: (drop: { dropId: string, itemType: string, x: number, y: number, z: number }) => void;
  itemRemoved: (dropId: string) => void;
}

export interface ClientToServerEvents {
  join: (name: string) => void;
  playerMove: (position: { x: number, y: number, z: number }) => void;
  chat: (text: string) => void;
  dropItem: (item: { itemId: string, itemType: string }) => void;
  pickup: (dropId: string) => void;
  gather: (resourceId: string) => void;
}

// Create a socket instance
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

// Initialize socket connection
export const initializeSocket = () => {
  if (!socket) {
    // Connect to the socket server
    socket = io('/api/socket', {
      path: '/api/socket',
      transports: ['websocket']
    });

    // Log socket connection events
    socket.on('connect', () => {
      console.log('Socket connected! ID:', socket?.id);
    });

    socket.on('disconnect', () => {
      console.log('Socket disconnected');
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
    });
  }

  return socket;
};

// Get the socket instance
export const getSocket = () => {
  if (!socket) {
    return initializeSocket();
  }
  return socket;
};

// Disconnect socket
export const disconnectSocket = () => {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}; 