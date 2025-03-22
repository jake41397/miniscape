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
  error: (errorMessage: string) => void;
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

// Get the current socket status
export const getSocketStatus = () => {
  return {
    connected: socket?.connected || false,
    id: socket?.id || null,
    reconnectAttempts: 0, // We don't track this currently
    paused: false // We don't track this currently
  };
};

// Initialize socket connection
export const initializeSocket = async () => {
  if (!socket) {
    try {
      // Get the session token for authentication
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      
      // Don't connect if not authenticated
      if (!token) {
        console.warn('No auth token available, not connecting to socket server');
        return null;
      }
      
      // Always use the backend socket server with auth token
      // We're standardizing on the backend implementation
      const BACKEND_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:4000';
      console.log('Connecting to backend socket server at:', BACKEND_URL);
      
      // Log token information for debugging (limited for security)
      console.log('Auth token info:', {
        available: !!token,
        length: token.length,
        format: token.split('.').length === 3 ? 'JWT' : 'unknown',
        prefix: token.substring(0, 6) + '...',
      });
      
      // Create socket connection with better reconnection and error handling
      socket = io(BACKEND_URL, {
        transports: ['websocket', 'polling'],
        path: '/socket.io', // Ensure correct path for backend server
        auth: {
          token
        },
        extraHeaders: {
          'Authorization': `Bearer ${token}`
        },
        reconnectionAttempts: 5,
        reconnectionDelay: 1000,
        timeout: 10000,
        forceNew: true, // Force a new connection each time
      });

      // Enhanced logging and error handling
      socket.on('connect', () => {
        console.log(`Socket connected successfully! ID: ${socket?.id}`);
        // Save connection time for debugging
        localStorage.setItem('socket_connected_at', Date.now().toString());
      });

      socket.on('disconnect', (reason) => {
        console.log(`Socket disconnected, reason: ${reason}`);
        if (reason === 'io server disconnect') {
          // The server has forcefully disconnected the socket
          console.log('Socket was disconnected by the server, will not reconnect automatically');
        }
      });

      socket.on('connect_error', (err) => {
        console.error('Socket connection error:', err.message);
        
        // Handle authentication errors specifically
        if (err.message.includes('Authentication') || err.message.includes('auth') || err.message.includes('401')) {
          console.log('Authentication error detected, attempting token refresh');
          
          // Clean up the failed socket
          socket?.disconnect();
          socket = null;
          
          // Try to refresh the auth token
          supabase.auth.refreshSession().then(({ data, error }) => {
            if (error) {
              console.error('Token refresh failed:', error.message);
              return;
            }
            
            if (data.session) {
              console.log('Token refreshed successfully, will reconnect on next getSocket call');
              localStorage.setItem('token_refreshed_at', Date.now().toString());
            }
          });
        }
      });

      // Listen for custom error events from the server
      socket.on('error', (errorMsg) => {
        console.error('Received error from socket server:', errorMsg);
      });
    } catch (error) {
      console.error('Error initializing socket:', error);
      socket = null;
      return null;
    }
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

// Setup socket cleanup for navigation
export const setupSocketCleanup = () => {
  // This function ensures the socket is properly cleaned up during navigation
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => {
      console.log('Window unloading, disconnecting socket');
      disconnectSocket();
    });
  }
  
  return () => {
    // This return function will be called when the component using this unmounts
    console.log('Component unmounting, disconnecting socket');
    disconnectSocket();
  };
}; 