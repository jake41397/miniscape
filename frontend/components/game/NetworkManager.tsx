import { useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { 
  initializeSocket, 
  disconnectSocket, 
  getSocket, 
  isSocketReady, 
  getSocketStatus
} from '../../game/network/socket';
import soundManager from '../../game/audio/soundManager';

// Define PlayerMoveData interface here since it might not be exported from player.ts
interface PlayerMoveData {
  id: string;
  x: number;
  y: number;
  z: number;
  timestamp?: number;
}

// Network settings
const SEND_INTERVAL = 20; // ms for position updates
const WORLD_BOUNDS = {
  minX: -50, 
  maxX: 50,
  minZ: -50,
  maxZ: 50
};

interface NetworkManagerProps {
  onInitPlayers: (players: any[]) => void;
  onPlayerJoined: (player: any) => void;
  onPlayerLeft: (playerId: string) => void;
  onPlayerMoved: (data: PlayerMoveData) => void;
  onChatMessage: (message: { name: string; text: string; playerId: string; timestamp: number }) => void;
  onItemDropped: (data: any) => void;
  onItemRemoved: (dropId: string) => void;
  onConnectionChange: (isConnected: boolean, socketId?: string | null) => void;
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  setPlayerName: (name: string) => void;
  playersRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  cleanupPlayerMeshes: () => void;
}

export const useNetworkManager = ({
  onInitPlayers,
  onPlayerJoined,
  onPlayerLeft,
  onPlayerMoved,
  onChatMessage,
  onItemDropped,
  onItemRemoved,
  onConnectionChange,
  playerRef,
  setPlayerName,
  playersRef,
  cleanupPlayerMeshes
}: NetworkManagerProps) => {
  const lastSentPosition = useRef({ x: 0, y: 1, z: 0 });
  const lastSendTime = useRef(0);
  const movementChanged = useRef(false);

  // Setup connection monitor
  useEffect(() => {
    const connectionMonitor = setInterval(() => {
      const status = getSocketStatus();
      onConnectionChange(status.connected, status.id);
    }, 5000);
    
    return () => clearInterval(connectionMonitor);
  }, [onConnectionChange]);

  // Connect socket on component mount
  useEffect(() => {
    let connectionAttempts = 0;
    const MAX_CONNECTION_ATTEMPTS = 3;
    
    async function connectSocket() {
      try {
        // Check if socket bypass is enabled
        const bypassSocketCheck = localStorage.getItem('bypass_socket_check') === 'true';
        
        if (bypassSocketCheck) {
          console.log('Socket check bypass is enabled, skipping socket initialization');
          // Remove the bypass flag to prevent it from persisting indefinitely
          localStorage.removeItem('bypass_socket_check');
          // Just report as connected without actually connecting
          onConnectionChange(true, '');
          return;
        }
        
        console.log(`Attempting to connect socket (attempt ${connectionAttempts + 1}/${MAX_CONNECTION_ATTEMPTS})`);
        const socket = await initializeSocket();
        
        // If no socket (not authenticated), retry a few times before redirecting
        if (!socket) {
          connectionAttempts++;
          console.warn(`Socket connection failed (attempt ${connectionAttempts}/${MAX_CONNECTION_ATTEMPTS})`);
          
          if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
            console.error('Max socket connection attempts reached, redirecting to login');
            // Store the redirect reason to prevent infinite loops
            localStorage.setItem('socket_redirect_reason', 'max_attempts_reached');
            window.location.href = '/auth/signin';
            return;
          }
          
          // Wait and try again
          setTimeout(connectSocket, 3000);
          return;
        }
        
        // Connection successful, reset attempt counter
        connectionAttempts = 0;
        localStorage.removeItem('socket_redirect_reason');
        
        // Track socket connection state
        socket.on('connect', () => {
          console.log('Socket connected with ID:', socket.id);
          onConnectionChange(true, socket.id);
          
          // Clear player refs on reconnect to avoid stale references
          if (playersRef.current.size > 0) {
            console.log('Clearing player references on reconnect to avoid stale data');
            playersRef.current = new Map();
          }
          
          // Removed cached position restoration
        });
        
        socket.on('disconnect', () => {
          console.log('Socket disconnected, updating connection state');
          onConnectionChange(false, '');
        });

        // Add custom event listeners for socket state changes
        const handleSocketConnected = () => {
          console.log('Socket connected event received');
          onConnectionChange(true, socket.id);
        };
        
        const handleSocketDisconnected = () => {
          console.log('Socket disconnected event received');
          onConnectionChange(false, '');
        };
        
        window.addEventListener('socket_connected', handleSocketConnected);
        window.addEventListener('socket_disconnected', handleSocketDisconnected);
        
        // Initial connection state
        onConnectionChange(socket.connected, socket.id);

        // Set up socket events
        setupSocketListeners(socket);
        
        return () => {
          // Disconnect socket on unmount
          disconnectSocket();
          
          // Clean up event listeners
          window.removeEventListener('socket_connected', handleSocketConnected);
          window.removeEventListener('socket_disconnected', handleSocketDisconnected);
        };
      } catch (error) {
        console.error('Error connecting socket:', error);
        connectionAttempts++;
        
        if (connectionAttempts >= MAX_CONNECTION_ATTEMPTS) {
          console.error('Max socket connection attempts reached after error');
          localStorage.setItem('socket_redirect_reason', 'connection_error');
          window.location.href = '/auth/signin';
          return;
        }
        
        // Wait and try again
        setTimeout(connectSocket, 3000);
      }
    }
    
    connectSocket();
  }, [onConnectionChange, onInitPlayers, onPlayerJoined, onPlayerLeft, onPlayerMoved, 
      onItemDropped, onItemRemoved, onChatMessage, playerRef, setPlayerName, playersRef]);

  const setupSocketListeners = (socket: any) => {
    // Handle initial players
    socket.on('initPlayers', (players: any[]) => {
      console.log('Received initial players:', players);
      
      // Run cleanup to remove any potential duplicates before adding new players
      cleanupPlayerMeshes();
      
      // Set player name from the player data if it exists
      const ownPlayerData = players.find(p => p.id === socket.id);
      if (ownPlayerData) {
        setPlayerName(ownPlayerData.name);
      }
      
      onInitPlayers(players);
    });
    
    // Handle new player joins
    socket.on('playerJoined', (player: any) => {
      console.log('Player joined:', player);
      
      // Play sound for new player joining
      soundManager.play('playerJoin');
      
      onPlayerJoined(player);
    });
    
    // Handle player disconnects
    socket.on('playerLeft', (playerId: string) => {
      console.log('Player left:', playerId);
      onPlayerLeft(playerId);
    });
    
    // Handle player movements
    socket.on('playerMoved', (data: PlayerMoveData) => {
      onPlayerMoved(data);
    });
    
    // Handle item drops in the world
    socket.on('itemDropped', (data: any) => {
      console.log('Item dropped:', data);
      
      // Play drop sound
      soundManager.play('itemDrop');
      
      onItemDropped(data);
    });
    
    // Handle item removals
    socket.on('itemRemoved', (dropId: string) => {
      console.log('Item removed:', dropId);
      onItemRemoved(dropId);
    });
    
    // Listen for chat messages
    socket.on('chatMessage', (message: { 
      name: string; 
      text: string; 
      playerId: string; 
      timestamp: number;
    }) => {
      console.log('Chat message received:', message);
      onChatMessage(message);
    });
  };

  // Function to send position update to server
  const sendPositionUpdate = useCallback(async () => {
    if (!playerRef.current || !isSocketReady() || !movementChanged.current) {
      return;
    }
    
    const now = Date.now();
    // Check if we should send an update (throttle)
    if (now - lastSendTime.current >= SEND_INTERVAL) {
      const position = {
        x: playerRef.current.position.x,
        y: playerRef.current.position.y,
        z: playerRef.current.position.z,
        timestamp: Date.now()
      };
      
      // Check if position has changed significantly
      const dx = Math.abs(position.x - lastSentPosition.current.x);
      const dz = Math.abs(position.z - lastSentPosition.current.z);
      
      if (dx > 0.003 || dz > 0.003) {
        // Ensure position is still within bounds before sending
        const validX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, position.x));
        const validZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, position.z));
        
        const validatedPosition = {
          x: validX,
          y: position.y,
          z: validZ,
          timestamp: position.timestamp
        };
        
        try {
          // Send position to server
          const socket = await getSocket();
          if (socket && socket.connected) {
            console.log('Sending playerMove event:', {
              position: validatedPosition,
              socketId: socket.id,
              connected: socket.connected,
              distance: { dx, dz },
              timeSinceLastSend: now - lastSendTime.current
            });
            
            socket.emit('playerMove', validatedPosition);
            
            // Update last sent position and time with validated coordinates
            lastSentPosition.current = { ...validatedPosition };
            lastSendTime.current = now;
          }
        } catch (error) {
          console.error('Error sending position update:', error);
        }
      }
    }
    
    // Reset movement flag
    movementChanged.current = false;
  }, [playerRef]);

  // Gather resource
  const gatherResource = useCallback(async (resourceId: string) => {
    const socket = await getSocket();
    if (socket) {
      socket.emit('gather', resourceId);
    }
  }, []);

  // Pick up item
  const pickupItem = useCallback(async (dropId: string) => {
    const socket = await getSocket();
    if (socket) {
      socket.emit('pickup', dropId);
    }
  }, []);

  // Manual reconnect
  const reconnect = useCallback(async () => {
    console.log('Manual reconnect requested');
    
    // Clear any connection block flags
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem('socket_disable_auto_reconnect');
      localStorage.removeItem('socket_disable_until');
      localStorage.removeItem('socket_total_attempts');
      localStorage.setItem('last_socket_connection_id', '');
      
      // Check if we should enable test mode
      const isTestMode = window.location.hostname.includes('localhost') || 
                         window.location.hostname.includes('127.0.0.1') ||
                         localStorage.getItem('force_local_dev') === 'true';
      
      if (isTestMode) {
        console.log('Development environment detected, enabling test mode for reconnection');
        localStorage.setItem('test_mode_enabled', 'true');
        localStorage.setItem('bypass_socket_check', 'true');
      }
    }
    
    // Attempt to reconnect
    await initializeSocket();
    console.log('Manual reconnect attempt completed');
  }, []);

  // Notify of movement change
  const notifyMovementChanged = useCallback(() => {
    movementChanged.current = true;
  }, []);

  // Return methods instead of rendering (custom hook pattern)
  return {
    sendPositionUpdate,
    gatherResource,
    pickupItem,
    reconnect,
    notifyMovementChanged,
    cleanup: () => disconnectSocket()
  };
};

export default useNetworkManager; 