import { io, Socket } from 'socket.io-client';
import { Player, Item } from '../../types/player';
import { supabase } from '../../lib/supabase';

// Define our socket events
export interface ServerToClientEvents {
  initPlayers: (players: Player[]) => void;
  playerJoined: (player: Player) => void;
  playerLeft: (playerId: string) => void;
  playerMoved: (player: { id: string, x: number, y: number, z: number }) => void;
  playerCount: (data: { count: number }) => void;
  chatMessage: (message: { 
    name: string, 
    text: string,
    playerId: string,
    timestamp: number,
    sender?: string // For backward compatibility
  }) => void;
  inventoryUpdate: (inventory: Item[]) => void;
  itemDropped: (drop: { dropId: string, itemType: string, x: number, y: number, z: number }) => void;
  itemRemoved: (dropId: string) => void;
  initWorldItems: (items: { dropId: string, itemType: string, x: number, y: number, z: number }[]) => void;
  initResourceNodes: (nodes: { id: string, type: string, x: number, y: number, z: number }[]) => void;
  getPlayerResponse: (player: Player | null) => void;
  error: (errorMessage: string) => void;
  checkPlayersSync: (playerIds: string[], callback: (missingPlayerIds: string[]) => void) => void;
}

export interface ClientToServerEvents {
  playerMove: (position: { x: number, y: number, z: number }) => void;
  chat: (text: string) => void;
  dropItem: (item: { itemId: string, itemType: string }) => void;
  pickup: (dropId: string) => void;
  gather: (resourceId: string) => void;
  getPlayerData: (playerId: string, callback: (player: Player | null) => void) => void;
  ping: (callback: () => void) => void;
  updateDisplayName: (data: { name: string }) => void;
}

// Create socket instance with better lifecycle management
let socket: Socket<ServerToClientEvents, ClientToServerEvents> | null = null;
let reconnectAttempts = 0;
const MAX_RECONNECT_ATTEMPTS = 10;
let reconnectTimer: NodeJS.Timeout | null = null;
let connectionState = {
  connected: false,
  connecting: false,
  lastConnected: 0,
  error: null as Error | null
};

// Add caching for last known position to prevent position resets
export const saveLastKnownPosition = (position: {x: number, y: number, z: number}) => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('last_player_position', JSON.stringify(position));
    console.log('Saved last known position:', position);
  }
};

export const getLastKnownPosition = (): {x: number, y: number, z: number} | null => {
  if (typeof localStorage !== 'undefined') {
    const positionStr = localStorage.getItem('last_player_position');
    if (positionStr) {
      try {
        const position = JSON.parse(positionStr);
        console.log('Retrieved cached position:', position);
        return position;
      } catch (e) {
        console.error('Failed to parse cached position:', e);
      }
    }
  }
  return null;
};

// Get the current socket status
export const getSocketStatus = () => {
  return {
    connected: socket?.connected || false,
    connecting: connectionState.connecting,
    id: socket?.id || null,
    reconnectAttempts,
    lastConnected: connectionState.lastConnected,
    error: connectionState.error
  };
};

// Generate/get persistent temp user ID
export const getTempUserId = (): string => {
  if (typeof localStorage !== 'undefined') {
    // Try to get existing temp user ID
    let tempUserId = localStorage.getItem('miniscape_temp_user_id');
    
    // If no temp user ID exists, generate one
    if (!tempUserId) {
      tempUserId = 'temp-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
      localStorage.setItem('miniscape_temp_user_id', tempUserId);
      console.log('Generated new temp user ID:', tempUserId);
    } else {
      console.log('Using existing temp user ID:', tempUserId);
    }
    
    return tempUserId;
  }
  
  // Fallback for server-side rendering
  return 'temp-' + Date.now() + '-' + Math.floor(Math.random() * 100000);
};

// Initialize socket connection
export const initializeSocket = async () => {
  // If already connecting, don't try again
  if (connectionState.connecting) {
    console.log('Socket already connecting, skipping duplicate initialization');
    return socket;
  }
  
  // If already have a socket, return it
  if (socket && socket.connected) {
    console.log('Socket already connected, reusing existing connection:', socket.id);
    return socket;
  }
  
  // Clear any existing reconnect timers
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  
  // Mark as connecting
  connectionState.connecting = true;
  connectionState.error = null;
  
  try {
    // Default backend URL for fallback
    let BACKEND_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:4000';
    
    // Use same domain for WebSocket connections to avoid CORS issues
    if (typeof window !== 'undefined') {
      // Always use the same origin for socket.io connections
      const protocol = window.location.protocol === 'https:' ? 'https://' : 'http://';
      const hostname = window.location.hostname;
      
      // For production or development server, use the same hostname
      if (hostname.includes('miniscape.io') || hostname === 'localhost') {
        BACKEND_URL = `${protocol}${hostname}`;
        console.log('Using same-origin WebSocket URL:', BACKEND_URL);
      }
    }
    
    console.log('Connecting to socket server at:', BACKEND_URL);
    
    // Clean up any existing socket before creating a new one
    if (socket) {
      console.log('Cleaning up existing socket before reconnecting');
      socket.removeAllListeners();
      socket.disconnect();
      socket = null;
    }
    
    // Create socket connection with better reconnection and error handling
    socket = io(BACKEND_URL, {
      transports: ['websocket', 'polling'],  // Allow both WebSocket and polling for better compatibility
      path: '/socket.io',
      reconnectionAttempts: 15,       // Increased from 8 to 15
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,     // Cap the exponential backoff
      timeout: 20000,                 // Increased from 15s to 20s for slower networks
      forceNew: true,
      // Include the temp user ID in auth
      auth: {
        tempUserId: getTempUserId()
      }
    });

    // Enhanced logging and error handling
    socket.on('connect', () => {
      console.log(`Socket connected successfully! ID: ${socket?.id}`);
      connectionState.connected = true;
      connectionState.connecting = false;
      connectionState.lastConnected = Date.now();
      reconnectAttempts = 0;
      
      // Reset the error state
      connectionState.error = null;
      
      // Save connection time for debugging
      localStorage.setItem('socket_connected_at', Date.now().toString());
      
      // Broadcast event for components to know the socket is ready
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('socket_connected', { 
          detail: { socketId: socket?.id }
        }));
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected, reason: ${reason}`);
      connectionState.connected = false;
      
      // Save current player position before disconnection
      const playerPosition = document.querySelector('[data-player-position]')?.getAttribute('data-position');
      if (playerPosition) {
        try {
          const position = JSON.parse(playerPosition);
          saveLastKnownPosition(position);
        } catch (e) {
          console.error('Failed to save position on disconnect:', e);
        }
      }
      
      if (reason === 'io server disconnect') {
        // The server has forcefully disconnected the socket
        console.log('Socket was disconnected by the server, attempting manual reconnect in 5s');
        // Try to reconnect manually after a delay
        reconnectTimer = setTimeout(() => {
          console.log('Attempting manual reconnect after server disconnect');
          reconnectAttempts++;
          initializeSocket(); // Try to reconnect
        }, 5000);
      } else if (reason === 'transport close' || reason === 'ping timeout') {
        console.log('Transport closed or ping timeout, attempting manual reconnect');
        // Only try to reconnect if there's no active reconnection
        if (socket && !socket.connected) {
          // Wait a moment to avoid immediate reconnection
          reconnectTimer = setTimeout(() => {
            if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
              console.log(`Attempting manual reconnect after transport issue (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
              reconnectAttempts++;
              initializeSocket(); // Try to reconnect
            } else {
              console.error(`Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached`);
              connectionState.error = new Error(`Failed to reconnect after ${MAX_RECONNECT_ATTEMPTS} attempts`);
              
              // Broadcast disconnect event for components
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('socket_failed', { 
                  detail: { reason, attempts: reconnectAttempts }
                }));
              }
            }
          }, 2000);
        }
      }
      
      // Broadcast disconnect event for components
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('socket_disconnected', { 
          detail: { reason }
        }));
      }
    });

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      connectionState.connecting = false;
      connectionState.connected = false;
      connectionState.error = err;
      
      // For non-auth errors, try to reconnect after delay
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        const delay = Math.min(1000 * (reconnectAttempts + 1), 10000); // Increasing delay with backoff
        console.log(`Will attempt to reconnect in ${delay/1000}s (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
        
        reconnectTimer = setTimeout(() => {
          reconnectAttempts++;
          initializeSocket();
        }, delay);
      } else {
        console.error(`Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached`);
        
        // Broadcast failure event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('socket_failed', { 
            detail: { error: err.message, attempts: reconnectAttempts }
          }));
        }
      }
    });

    // Listen for custom error events from the server
    socket.on('error', (errorMsg) => {
      console.error('Received error from socket server:', errorMsg);
      connectionState.error = new Error(errorMsg);
    });
    
    // Add ping/pong monitoring to detect zombies
    let lastPong = Date.now();
    const pingInterval = setInterval(() => {
      if (!socket || !socket.connected) {
        clearInterval(pingInterval);
        return;
      }
      
      const start = Date.now();
      socket.emit('ping', () => {
        lastPong = Date.now();
        const duration = lastPong - start;
        console.log(`Pong received! Round trip: ${duration}ms`);
      });
      
      // Check if we've missed too many pongs
      if (Date.now() - lastPong > 15000) {
        console.warn('No pong received for 15s, socket may be zombie. Reconnecting...');
        clearInterval(pingInterval);
        
        // Force a reconnection
        socket.disconnect();
        reconnectAttempts++;
        initializeSocket();
      }
    }, 10000); // Check every 10 seconds
    
    // Add timeout for connection to prevent hanging
    const connectTimeout = setTimeout(() => {
      if (socket && !socket.connected) {
        console.warn('Socket connection timed out after 15 seconds, forcing reconnection');
        connectionState.connecting = false;
        
        // Force a reconnection attempt
        if (socket) {
          socket.disconnect();
          reconnectAttempts++;
          initializeSocket();
        }
      }
    }, 15000);  // Increased from 12s to 15s
    
    // Clear timeout when connected or error
    socket.once('connect', () => clearTimeout(connectTimeout));
    socket.once('connect_error', () => clearTimeout(connectTimeout));
    
  } catch (error) {
    console.error('Error initializing socket:', error);
    connectionState.connecting = false;
    connectionState.connected = false;
    connectionState.error = error instanceof Error ? error : new Error(String(error));
    socket = null;
    
    // Try to reconnect after delay
    if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
      const delay = Math.min(1000 * (reconnectAttempts + 1), 10000);
      console.log(`Will attempt to reconnect in ${delay/1000}s (attempt ${reconnectAttempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
      
      reconnectTimer = setTimeout(() => {
        reconnectAttempts++;
        initializeSocket();
      }, delay);
    }
    
    return null;
  }

  return socket;
};

// Get the socket instance with additional validation
export const getSocket = async () => {
  // If we have a socket and it's connected, just return it
  if (socket && socket.connected) {
    return socket;
  }
  
  // If we have a socket but it's not connected, check if it's a zombie
  if (socket && !socket.connected && !connectionState.connecting) {
    console.log('Socket exists but is disconnected, attempting to reconnect');
    return await initializeSocket();
  }
  
  // No socket or already attempting to connect
  if (!socket || connectionState.connecting) {
    // If we're already connecting, just return the current socket (which might be null)
    if (connectionState.connecting) {
      console.log('Socket connection in progress, waiting...');
      return socket;
    }
    return await initializeSocket();
  }
  
  return socket;
};

// Check if socket is actually usable
export const isSocketReady = () => {
  return !!(socket && socket.connected);
};

// Disconnect socket
export const disconnectSocket = () => {
  if (socket) {
    console.log('Manually disconnecting socket');
    socket.disconnect();
    socket = null;
    connectionState.connected = false;
    connectionState.connecting = false;
  }
  
  // Clear any reconnect timers
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
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