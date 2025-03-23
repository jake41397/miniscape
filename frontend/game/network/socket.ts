import { io, Socket } from 'socket.io-client';
import { Player, Item } from '../../types/player';
import { supabase } from '../../lib/supabase';

// Define our socket events
export interface ServerToClientEvents {
  initPlayers: (players: Player[]) => void;
  playerJoined: (player: Player) => void;
  playerLeft: (playerId: string) => void;
  playerMoved: (player: { id: string, x: number, y: number, z: number }) => void;
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

// Track if we've added the custom event listeners to prevent duplicates
let customEventListenersAdded = false;

// Add a new global counter to track total connection attempts (persisted across reconnects)
let totalConnectionAttempts = 0;
const MAX_TOTAL_ATTEMPTS = 5;

// Function to handle connection state changes
const onConnectionChange = (connected: boolean, socketId: string) => {
  connectionState.connected = connected;
  connectionState.connecting = false;
  
  if (connected) {
    connectionState.lastConnected = Date.now();
    reconnectAttempts = 0; // Reset reconnect attempts on successful connection
  }
  
  // Dispatch additional custom event for components that need the connection state
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('socket_state_change', { 
      detail: { connected, socketId }
    }));
  }
};

// Remove the position caching functions
const saveLastKnownPosition = (position: {x: number, y: number, z: number}) => {
  // Removed localStorage functionality
  console.log('Position update:', position);
};

const getLastKnownPosition = (): {x: number, y: number, z: number} | null => {
  // Removed localStorage functionality
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

// Initialize socket connection
export const initializeSocket = async () => {
  // Remove localStorage reconnection checks
  
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
    console.log('Starting socket initialization process');
    
    // Add a promise with timeout to handle auth session retrieval
    const getSessionWithTimeout = () => {
      return Promise.race([
        supabase.auth.getSession(),
        new Promise<never>((_, reject) => 
          setTimeout(() => reject(new Error('Auth session retrieval timed out')), 10000)  // Increased timeout
        )
      ]);
    };
    
    // Get the session token for authentication with timeout
    console.log('Retrieving authentication session for socket connection');
    let sessionResult;
    try {
      sessionResult = await getSessionWithTimeout();
      console.log('Session retrieval complete, session exists:', !!sessionResult.data.session);
    } catch (authError) {
      console.error('Authentication error during getSession:', authError);
      
      // Check if test mode is enabled (development only)
      const testModeEnabled = localStorage.getItem('test_mode_enabled') === 'true';
      if (testModeEnabled) {
        console.log('TEST MODE ENABLED: Bypassing authentication error and proceeding');
        
        // Create a mock session result since we're in test mode
        sessionResult = {
          data: {
            session: null
          }
        };
      } else {
        // Log the error for debugging and possibly redirect
        connectionState.connecting = false;
        connectionState.error = authError instanceof Error ? authError : new Error(String(authError));
        console.error('Authentication failed and test mode is not enabled. Please enable test mode in settings or fix authentication.');
        return null;
      }
    }
    
    let token = sessionResult?.data?.session?.access_token;
    
    // Don't connect if not authenticated
    if (!token) {
      console.warn('No auth token available, checking for test mode');
      
      // Check if test mode is enabled (development only)
      const testModeEnabled = localStorage.getItem('test_mode_enabled') === 'true';
      if (testModeEnabled) {
        console.log('TEST MODE ENABLED: Proceeding without authentication');
        
        // Generate a fake token for testing
        const fakeToken = 'dev-test-token-' + Date.now();
        token = fakeToken;
        
        // Add a visual indicator that we're in test mode
        if (typeof document !== 'undefined') {
          const testModeIndicator = document.createElement('div');
          testModeIndicator.style.position = 'fixed';
          testModeIndicator.style.top = '5px';
          testModeIndicator.style.right = '100px';
          testModeIndicator.style.backgroundColor = 'purple';
          testModeIndicator.style.color = 'white';
          testModeIndicator.style.padding = '2px 5px';
          testModeIndicator.style.fontSize = '10px';
          testModeIndicator.style.borderRadius = '3px';
          testModeIndicator.style.zIndex = '9999';
          testModeIndicator.innerText = 'TEST MODE';
          document.body.appendChild(testModeIndicator);
        }
      } else {
        connectionState.connecting = false;
        connectionState.error = new Error('No auth token available');
        
        // Log user information from localStorage for debugging
        try {
          const authData = localStorage.getItem('supabase.auth.token');
          console.log('Local auth data exists:', !!authData);
        } catch (e) {
          console.error('Error checking local auth data:', e);
        }
        
        return null;
      }
    }
    
    // Default backend URL for fallback
    let BACKEND_URL = process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:4000';

    // Add extra debugging for env variable
    console.log('Environment socket URL:', {
      envUrl: process.env.NEXT_PUBLIC_SOCKET_SERVER_URL,
      finalUrl: BACKEND_URL
    });

    // Check if there's a manually configured backend URL in localStorage for development/testing
    const manualBackendUrl = localStorage.getItem('manual_backend_url');
    if (manualBackendUrl) {
      console.log('Using manually configured backend URL from localStorage:', manualBackendUrl);
      BACKEND_URL = manualBackendUrl;
    } else {
      // Use same domain for WebSocket connections to avoid CORS issues
      if (typeof window !== 'undefined') {
        // Check for forced local development mode
        const forceLocalDev = localStorage.getItem('force_local_dev') === 'true';
        
        // Detect if we're in a production environment
        const isProduction = !window.location.hostname.includes('localhost') && 
                            !window.location.hostname.includes('127.0.0.1') &&
                            !forceLocalDev;
        
        // For production, add a fallback
        if (isProduction && !BACKEND_URL) {
          // Only use this fallback if NEXT_PUBLIC_SOCKET_SERVER_URL is not defined
          BACKEND_URL = 'https://miniscape.io/api';
          console.log('Using production WebSocket URL fallback:', BACKEND_URL);
        } else if (!isProduction && !BACKEND_URL) {
          // For development, use localhost with the correct port if env var is not set
          BACKEND_URL = 'http://localhost:4000';
          console.log('Using development WebSocket URL fallback:', BACKEND_URL);
        }
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
    try {
      // Ensure BACKEND_URL has protocol
      if (!BACKEND_URL.startsWith('http://') && !BACKEND_URL.startsWith('https://')) {
        // Default to https in production, http in development
        const protocol = typeof window !== 'undefined' && 
          (window.location.protocol === 'https:' || !window.location.hostname.includes('localhost')) 
            ? 'https://' 
            : 'http://';
        BACKEND_URL = protocol + BACKEND_URL;
        console.log('Added protocol to backend URL:', BACKEND_URL);
      }
      
      // Extract just the domain (origin) from the URL for Socket.io
      // This prevents issues with paths like /api in the URL
      let socketBaseUrl = BACKEND_URL;
      try {
        const urlObj = new URL(BACKEND_URL);
        socketBaseUrl = urlObj.origin; // Just protocol + hostname + port
        console.log('Using socket base URL (origin only):', socketBaseUrl);
      } catch (e) {
        console.error('Failed to parse backend URL, using as-is:', e);
      }
      
      // IMPORTANT: Use WebSocket transport by default instead of polling
      const transports = ['websocket'];
      
      console.log('Creating socket connection with options:', {
        originalUrl: BACKEND_URL,
        socketUrl: socketBaseUrl,
        transports,
        usingWebsocket: true,
        tokenExists: !!token,
        tokenLength: token?.length,
        currentProtocol: typeof window !== 'undefined' ? window.location.protocol : 'unknown'
      });
      
      socket = io(socketBaseUrl, {
        transports,  // Default to websocket only
        path: '/socket.io',
        auth: {
          token
        },
        reconnectionAttempts: 3,
        reconnectionDelay: 2000,
        reconnectionDelayMax: 5000,
        timeout: 10000,
        forceNew: true,
        extraHeaders: {
          'Authorization': `Bearer ${token}`
        }
      });
    } catch (error) {
      console.error('Error creating socket instance:', error);
      connectionState.error = error instanceof Error ? error : new Error(String(error));
      connectionState.connecting = false;
      return null;
    }

    // Enhanced logging and error handling
    socket.on('connect', () => {
      console.log('Socket connected successfully! ID:', socket?.id);
      connectionState.connected = true;
      connectionState.connecting = false;
      connectionState.lastConnected = Date.now();
      connectionState.error = null;
      
      // Reset reconnect attempts on successful connection
      reconnectAttempts = 0;
      
      // Clear any reconnect timers
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      
      // Only dispatch the event if we have a valid socket ID to prevent duplicate events
      if (socket?.id && typeof window !== 'undefined') {
        // Check if we've already dispatched this connection event (prevent duplicates)
        const lastDispatchedId = window.localStorage.getItem('last_socket_connection_id');
        if (lastDispatchedId !== socket.id) {
          // Store the current socket ID to prevent duplicate events
          window.localStorage.setItem('last_socket_connection_id', socket.id);
          
          // Dispatch the event
          window.dispatchEvent(new CustomEvent('socket_connected', { 
            detail: { socketId: socket.id, transport: socket.io.engine.transport.name }
          }));
        } else {
          console.log('Prevented duplicate socket_connected event for ID:', socket.id);
        }
      }
    });

    socket.on('disconnect', (reason) => {
      console.log(`Socket disconnected, reason: ${reason}`);
      connectionState.connected = false;
      
      // Remove position saving on disconnect

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

    // Only add custom events if not added already
    if (!customEventListenersAdded && typeof window !== 'undefined' && socket) {
      // Store current socket ID for listeners
      const currentSocketId = socket.id || '';
      
      // Add custom event listeners for socket state changes
      const handleSocketConnected = () => {
        console.log('Socket connected event received');
        onConnectionChange(true, currentSocketId);
      };
      
      const handleSocketDisconnected = () => {
        console.log('Socket disconnected event received');
        onConnectionChange(false, '');
      };
      
      // Clean up existing listeners first (just in case)
      window.removeEventListener('socket_connected', handleSocketConnected);
      window.removeEventListener('socket_disconnected', handleSocketDisconnected);
      
      // Add new listeners
      window.addEventListener('socket_connected', handleSocketConnected);
      window.addEventListener('socket_disconnected', handleSocketDisconnected);
      
      customEventListenersAdded = true;
      
      // Clean up listeners when window unloads
      window.addEventListener('beforeunload', () => {
        window.removeEventListener('socket_connected', handleSocketConnected);
        window.removeEventListener('socket_disconnected', handleSocketDisconnected);
        customEventListenersAdded = false;
      });
    }

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      connectionState.connecting = false;
      connectionState.connected = false;
      connectionState.error = err;
      
      // Circuit breaker: if we've been trying to reconnect too rapidly, stop the loop
      const now = Date.now();
      const MIN_RECONNECT_INTERVAL = 2000; // 2 seconds
      
      // Check if the last connection was extremely recent (potential loop)
      if (connectionState.lastConnected > 0 && 
          now - connectionState.lastConnected < MIN_RECONNECT_INTERVAL) {
        console.warn('Detected potential reconnection loop, stopping all reconnection attempts');
        
        // Disable all further reconnection attempts
        if (socket) {
          socket.io.opts.reconnection = false;
          
          // Add to localStorage to prevent automatic reconnects on page refresh
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem('socket_disable_auto_reconnect', 'true');
            localStorage.setItem('socket_disable_until', (now + 60000).toString()); // 1 minute cooldown
          }
        }
        
        // Clear any existing timers
        if (reconnectTimer) {
          clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        
        // Set reconnect attempts to max to prevent further attempts
        reconnectAttempts = MAX_RECONNECT_ATTEMPTS;
        
        // Update UI to show disconnected state that requires manual reconnection
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('socket_failed', { 
            detail: { 
              reason: 'Reconnection loop detected, automatic reconnection disabled',
              requiresManualReconnect: true
            }
          }));
        }
        
        return;
      }
      
      // Only attempt reconnection if we're not already in a reconnecting state
      if (reconnectTimer) {
        console.log('Already have a pending reconnection, skipping duplicate attempt');
        return;
      }
      
      // Don't try reconnection if we've exceeded the limit
      if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        console.error(`Max reconnection attempts (${MAX_RECONNECT_ATTEMPTS}) reached`);
        
        // Disable automatic reconnects in socket.io
        if (socket) {
          socket.io.opts.reconnection = false;
        }
        
        // Broadcast failure event
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('socket_failed', { 
            detail: { 
              error: err.message,
              attempts: reconnectAttempts,
              requiresManualReconnect: true 
            }
          }));
        }
        
        return;
      }
      
      // Check if the error is WebSocket related
      if (err.message.includes('websocket') || err.message.includes('WebSocket')) {
        console.log('WebSocket error detected, attempting to reconnect');
        
        // Clean up the failed socket
        if (socket) {
          socket.removeAllListeners();
          socket.disconnect();
          socket = null;
        }
        
        // Instead of falling back to polling, just try reconnecting with websocket
        reconnectAttempts++;
        
        const delay = Math.min(1000 * reconnectAttempts, 10000);
        console.log(`Will attempt to reconnect in ${delay/1000}s (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);
        
        reconnectTimer = setTimeout(() => {
          initializeSocket();
        }, delay);
        
        return;
      }
      
      // Handle authentication errors specifically
      if (err.message.includes('Authentication') || err.message.includes('auth') || err.message.includes('401')) {
        console.log('Authentication error detected, attempting token refresh');
        
        // Clean up the failed socket
        if (socket) {
          socket.removeAllListeners();
          socket.disconnect();
          socket = null;
        }
        
        // Try to refresh the auth token with timeout
        Promise.race([
          supabase.auth.refreshSession(),
          new Promise<never>((_, reject) => 
            setTimeout(() => reject(new Error('Token refresh timed out')), 10000)  // Increased from 8s to 10s
          )
        ]).then((result: any) => {
          const { data, error } = result;
          if (error) {
            console.error('Token refresh failed:', error.message);
            return;
          }
          
          if (data?.session) {
            console.log('Token refreshed successfully, reconnecting in 2s');
            localStorage.setItem('token_refreshed_at', Date.now().toString());
            
            // Delay reconnect attempt to avoid race conditions
            setTimeout(() => {
              reconnectAttempts++;
              initializeSocket();
            }, 2000);
          }
        }).catch(error => {
          console.error('Token refresh error:', error.message);
          connectionState.error = error;
        });
      } else {
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
    
    return socket;
  } catch (error) {
    console.error('Error creating socket instance:', error);
    connectionState.error = error instanceof Error ? error : new Error(String(error));
    connectionState.connecting = false;
    return null;
  }
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
    
    // Remove reconnection attempt tracking
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
    
    // Reset connection state
    reconnectAttempts = 0;
    connectionState.connected = false;
    connectionState.connecting = false;
    connectionState.error = null;
    
    // Before disconnecting, remove all listeners to prevent reconnection attempts
    if (socket.hasListeners('connect_error')) {
      socket.off('connect_error');
    }
    if (socket.hasListeners('disconnect')) {
      socket.off('disconnect');
    }
    
    // Disconnect the socket
    socket.disconnect();
    socket = null;
    
    // Reset the last connection ID to prevent duplicate connection handling
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('last_socket_connection_id');
    }
    
    // Reset custom event listener tracking
    customEventListenersAdded = false;
    
    console.log('Socket disconnected and cleaned up');
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

// Export the position utility functions with no-op implementations
export const cachePlayerPosition = saveLastKnownPosition;
export const getCachedPlayerPosition = getLastKnownPosition; 