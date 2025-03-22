import { io, Socket } from 'socket.io-client';
import { Player, Item } from '../../types/player';
import { supabase } from '../../lib/supabase';

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
  initWorldItems: (items: { dropId: string, itemType: string, x: number, y: number, z: number }[]) => void;
  initResourceNodes: (nodes: { id: string, type: string, x: number, y: number, z: number }[]) => void;
}

export interface ClientToServerEvents {
  playerMove: (position: { x: number, y: number, z: number }) => void;
  chat: (text: string) => void;
  dropItem: (item: { itemId: string, itemType: string }) => void;
  pickup: (dropId: string) => void;
  gather: (resourceId: string) => void;
}

// Create a socket instance
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;

// Initialize socket connection
export const initializeSocket = async () => {
  if (!socket) {
    // Get the session token for authentication
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    
    // Don't connect if not authenticated
    if (!token) {
      console.warn('No auth token available, not connecting to socket server');
      return null;
    }
    
    // Connect to the backend socket server with auth token
    const BACKEND_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:4000';
    console.log('Connecting to backend socket server at:', BACKEND_URL);
    console.log('Auth token available:', !!token);
    
    socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],
      auth: {
        token: token
      },
      extraHeaders: {
        'Authorization': `Bearer ${token}`
      }
    });

    // Log socket connection events
    socket.on('connect', () => {
      console.log('Socket connected to backend! ID:', socket?.id);
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
export const getSocket = async () => {
  if (!socket) {
    return await initializeSocket();
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