import { io, Socket } from 'socket.io-client';
import { Player, Item } from '../../types/player';
import { supabase } from '../../lib/supabase';
import { ServerToClientEvents, ClientToServerEvents } from './socketEvents';

// Define our socket events
export type { ServerToClientEvents, ClientToServerEvents };

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
    //console.log('Saved last known position:', position);
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

// Store guest session ID in local storage
export const saveGuestSessionId = (sessionId: string): void => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('guest_session_id', sessionId);
    console.log('Saved guest session ID to localStorage:', sessionId);
  }
};

// Retrieve guest session ID from local storage
export const getGuestSessionId = (): string | null => {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('guest_session_id');
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

// Get JWT token for socket authentication
export const getAuthToken = (): string | null => {
  if (typeof localStorage !== 'undefined') {
    return localStorage.getItem('auth_token');
  }
  return null;
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
    let BACKEND_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:3001';
    
    // Use same domain for WebSocket connections to avoid CORS issues
    if (typeof window !== 'undefined') {
      // Always use the same origin for socket.io connections
      const protocol = window.location.protocol === 'https:' ? 'https://' : 'http://';
      const hostname = window.location.hostname;
      
      // For production or development server, use the same hostname
      if (hostname.includes('miniscape.io')) {
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
    
    // Get JWT token for authentication
    const token = getAuthToken();
    console.log('Auth token available for socket connection:', !!token);
    
    // Get guest session ID if available
    const guestSessionId = getGuestSessionId();
    console.log('Guest session ID available:', !!guestSessionId);
    
    // Create socket connection with better reconnection and error handling
    socket = io(BACKEND_URL, {
      transports: ['websocket'],  // Use only WebSocket for faster connection
      path: '/socket.io',
      reconnectionAttempts: 5,    // Reduced from 15 to 5
      reconnectionDelay: 1000,
      reconnectionDelayMax: 3000, // Reduced from 5000 to 3000
      timeout: 8000,              // Reduced from 20000 to 8000 for faster timeout
      forceNew: true,
      // Include auth data
      auth: {
        token: token || '',
        guestSessionId: guestSessionId || ''
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
      
      // If we have a socket auth object, check for sessionId or save the socket.id for reconnects
      if (!guestSessionId && socket?.id) {
        saveGuestSessionId(socket.id);
        console.log('Saved socket.id as guest session ID for future reconnects:', socket.id);
      } else if (guestSessionId && socket) {
        console.log('Connected using existing guest session ID:', guestSessionId);
        
        // Verify the session ID was properly used by checking auth data
        const sessionUsed = socket.auth && typeof socket.auth === 'object' && 'guestSessionId' in socket.auth 
          ? socket.auth.guestSessionId === guestSessionId 
          : false;
        console.log('Session ID was correctly used in authentication:', sessionUsed);
        
        // Save session debug info for diagnostics
        localStorage.setItem('last_session_connection', JSON.stringify({
          connectedAt: Date.now(),
          socketId: socket.id,
          sessionId: guestSessionId,
          sessionUsed
        }));
      }
      
      // Broadcast event for components to know the socket is ready
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('socket_connected', { 
          detail: { socketId: socket?.id, sessionId: guestSessionId }
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
      // Fix error creation to handle if errorMsg is an object
      connectionState.error = typeof errorMsg === 'string' 
        ? new Error(errorMsg) 
        : new Error(errorMsg?.message || String(errorMsg));
    });
    
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

// Get the socket instance, initializing if needed
export const getSocket = async (): Promise<Socket<ServerToClientEvents, ClientToServerEvents> | null> => {
  if (!socket || !socket.connected) {
    console.log('Socket not connected, initializing...');
    return initializeSocket();
  }
  return socket;
};

// Check if socket is ready
export const isSocketReady = () => {
  return socket && socket.connected;
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