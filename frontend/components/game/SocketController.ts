import { Socket } from 'socket.io-client';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { 
  getSocket, 
  initializeSocket, 
  disconnectSocket, 
  getSocketStatus,
  saveLastKnownPosition
} from '../../game/network/socket';
import { setupSocketListeners } from '../../game/network/gameSocketHandler';
import { Player } from '../../types/player';
import WorldManager from '../../game/world/WorldManager';
import ItemManager from '../../game/world/ItemManager';
import { ChatRefHandle } from '../chat/Chat';

// Add chat bubble interface
interface ChatBubble {
  object: CSS2DObject;
  expiry: number;
}

export interface SocketControllerOptions {
  scene: THREE.Scene;
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  playersRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  nameLabelsRef: React.MutableRefObject<Map<string, CSS2DObject>>;
  worldManagerRef: React.MutableRefObject<WorldManager | null>;
  itemManagerRef: React.MutableRefObject<ItemManager | null>;
  cleanupIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
  chatRef: React.MutableRefObject<ChatRefHandle | null>;
  setPlayerName: (name: string) => void;
  setIsConnected: (isConnected: boolean) => void;
  setCurrentZone: (zone: string) => void;
  createNameLabel: (name: string, mesh: THREE.Mesh) => CSS2DObject;
}

export class SocketController {
  private scene: THREE.Scene;
  private playerRef: React.MutableRefObject<THREE.Mesh | null>;
  private playersRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  private nameLabelsRef: React.MutableRefObject<Map<string, CSS2DObject>>;
  private worldManagerRef: React.MutableRefObject<WorldManager | null>;
  private itemManagerRef: React.MutableRefObject<ItemManager | null>;
  private cleanupIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
  private chatRef: React.MutableRefObject<ChatRefHandle | null>;
  private setPlayerName: (name: string) => void;
  private setIsConnected: (isConnected: boolean) => void;
  private setCurrentZone: (zone: string) => void;
  private createNameLabel: (name: string, mesh: THREE.Mesh) => CSS2DObject;
  private socket: Socket | null = null;
  private lastSentPosition: { x: number, y: number, z: number } = { x: 0, y: 0, z: 0 };
  private lastSendTime = 0;
  // Add chat bubbles tracking
  private chatBubbles: Map<string, ChatBubble> = new Map();
  // Add zone update debouncing
  private zoneUpdateTimeoutRef: NodeJS.Timeout | null = null;

  constructor(options: SocketControllerOptions) {
    // Initialize properties
    this.scene = options.scene;
    this.playerRef = options.playerRef;
    this.playersRef = options.playersRef;
    this.nameLabelsRef = options.nameLabelsRef;
    this.worldManagerRef = options.worldManagerRef;
    this.itemManagerRef = options.itemManagerRef;
    this.cleanupIntervalRef = options.cleanupIntervalRef;
    this.chatRef = options.chatRef;
    
    // Store callback functions
    this.setPlayerName = options.setPlayerName;
    this.setIsConnected = options.setIsConnected;
    this.setCurrentZone = options.setCurrentZone;
    this.createNameLabel = options.createNameLabel;

    // Initialize internal properties
    this.lastSentPosition = { x: 0, y: 0, z: 0 };
    this.lastSendTime = 0;
    this.cleanupTimer = null;
    
    // Force position test to check socket is working
    // This is crucial for diagnosing the issue
    if (this.playerRef.current) {
      console.log("%c 🧪 FORCING TEST POSITION SEND", "background: #ff0000; color: white; font-size: 18px;");
      setTimeout(() => {
        const player = this.playerRef.current;
        if (player) {
          // Force sending initial position with rotation
          this.sendPlayerPosition(
            player.position,
            player.rotation.y,
            true // Force send
          );
        }
      }, 2000); // Delay to ensure socket is connected
    }
  }

  async initialize(): Promise<boolean> {
    // Initialize socket
    this.socket = await initializeSocket();
    
    // If no socket (not authenticated), return false
    if (!this.socket) {
      return false;
    }
    
    // Track socket connection state
    this.socket.on('connect', this.handleConnect);
    this.socket.on('disconnect', this.handleDisconnect);
    
    // Setup all socket listeners
    this.setupListeners();
    
    // Set initial connection state
    this.setIsConnected(this.socket.connected);
    
    // Setup cleanup interval
    this.cleanupIntervalRef.current = setInterval(this.cleanupDisconnectedPlayers, 5000);
    
    // Explicitly request initial players data now that listeners are set up
    console.log("Explicitly requesting initial player data");
    this.requestPlayersData();
    this.requestWorldData();
    
    return true;
  }

  cleanup(): void {
    // Clear cleanup interval
    if (this.cleanupIntervalRef.current) {
      clearInterval(this.cleanupIntervalRef.current);
      this.cleanupIntervalRef.current = null;
    }
    
    // Clear zone update timeout
    if (this.zoneUpdateTimeoutRef) {
      clearTimeout(this.zoneUpdateTimeoutRef);
      this.zoneUpdateTimeoutRef = null;
    }
    
    // Clean up chat bubbles
    this.chatBubbles.forEach((bubble) => {
      if (bubble.object && bubble.object.parent) {
        bubble.object.parent.remove(bubble.object);
      }
    });
    this.chatBubbles.clear();
    
    // Disconnect socket
    disconnectSocket();
    
    // Remove event listeners
    window.removeEventListener('socket_connected', this.handleSocketConnected);
    window.removeEventListener('socket_disconnected', this.handleSocketDisconnected);
    window.removeEventListener('player_reference_check', this.handlePlayerReferenceCheck);
  }

  private handleConnect = (): void => {
    this.setIsConnected(true);
    
    // Clear player refs on reconnect to avoid stale references
    if (this.playersRef.current.size > 0) {
      this.clearAllPlayers(); // Use clean method to properly clear all players
    }
    
    // Send system message to chat
    this.sendSystemMessageToChat('Connected to server.');
    
    // Request fresh player data immediately
    this.requestPlayersData();
    
    // Request accurate player count
    this.requestPlayerCount();
  };

  private handleDisconnect = (): void => {
    this.setIsConnected(false);
    
    // Send system message to chat
    this.sendSystemMessageToChat('Disconnected from server. Attempting to reconnect...');
  };

  private handleSocketConnected = (): void => {
    this.setIsConnected(true);
  };
  
  private handleSocketDisconnected = (): void => {
    this.setIsConnected(false);
  };

  private setupListeners(): void {
    // Add custom event listeners for socket state changes
    window.addEventListener('socket_connected', this.handleSocketConnected);
    window.addEventListener('socket_disconnected', this.handleSocketDisconnected);
    
    // Add listener for player reference check
    window.addEventListener('player_reference_check', this.handlePlayerReferenceCheck);
    
    // Add listener for scene inspection
    window.addEventListener('scene_inspection', this.handleSceneInspection);
    
    // Add listener for regenerating all players
    window.addEventListener('regenerate_all_players', this.handleRegenerateAllPlayers);
    
    // Add debug logging for socket events
    const setupCriticalSocketEvents = async () => {
      const socket = await getSocket();
      if (!socket) return;
      
      console.log('🔥 Setting up CRITICAL socket event handlers manually');
      
      // Set up ping/heartbeat handler for connection stability
      socket.on('ping', (startTime: number, callback) => {
        // Respond immediately to pings from server
        if (typeof callback === 'function') {
          callback(startTime);
        } else {
          // If no callback provided, send a pong response
          socket.emit('pong', startTime);
        }
        
        // Update our own lastPing time
        if (this.playerRef.current) {
          this.playerRef.current.userData.lastPing = Date.now();
        }
      });
      
      // CRITICAL: Set up initPlayers handler
      socket.on('initPlayers', (players) => {
        console.log('🔥 Received initPlayers event:', {
          count: players.length,
          players: players.map((p: any) => ({ id: p.id, name: p.name }))
        });
        
        // First, identify any players that should be removed
        const existingPlayerIds = Array.from(this.playersRef.current.keys());
        const incomingPlayerIds = players.map((p: any) => p.id);
        
        // Players that exist locally but aren't in the server list should be removed
        const playersToRemove = existingPlayerIds.filter(id => !incomingPlayerIds.includes(id));
        
        // Remove players that shouldn't be here
        playersToRemove.forEach(id => {
          console.log(`Removing player ${id} as they're not in server's player list`);
          const playerMesh = this.playersRef.current.get(id);
          if (playerMesh) {
            // Remove player from scene and tracking
            this.scene.remove(playerMesh);
            this.playersRef.current.delete(id);
            
            // Clean up any associated resources
            if (playerMesh.geometry) playerMesh.geometry.dispose();
            if (playerMesh.material) {
              if (Array.isArray(playerMesh.material)) {
                playerMesh.material.forEach(m => m.dispose());
              } else {
                playerMesh.material.dispose();
              }
            }
          }
        });
        
        // Schedule a sync check after processing initPlayers
        setTimeout(() => {
          this.syncWithServer();
        }, 2000);
      });
      
      // CRITICAL: Set up playerJoined handler
      socket.on('playerJoined', (player) => {
        console.log('🔥 Received playerJoined event:', {
          player,
          isCurrentSocket: player.id === socket.id,
          currentPlayerRefs: Array.from(this.playersRef.current.keys())
        });
        
        // Add even more logging to check if players are being added
        if (!this.playersRef.current.has(player.id) && player.id !== socket.id) {
          console.log(`CRITICAL: Player ${player.id} should be added to the playersRef map.`);
        }
        
        // Don't create notifications for your own join event
        if (player.id !== socket.id) {
          // Create a system message for chat
          this.sendSystemMessageToChat(`${player.name} has joined the game.`);
          
          // Request accurate player count from server
          socket.emit('getPlayerCount');
        } else {
          console.log('This is our own player joining:', player);
          // Make sure we update our player name even for our own join
          if (player.name) {
            this.setPlayerName(player.name);
          }
        }
      });
      
      // CRITICAL: Set up playerLeft handler
      socket.on('playerLeft', (playerData) => {
        const playerId = typeof playerData === 'object' ? playerData.id : playerData;
        console.log('🔥 Received playerLeft event:', playerId);
        
        // Find player name if available
        const playerMesh = this.playersRef.current.get(playerId);
        const playerName = playerMesh?.userData?.playerName || 'A player';
        
        if (playerMesh) {
          // Create a system message for chat
          this.sendSystemMessageToChat(`${playerName} has left the game.`);
          
          // Remove player from scene and tracking
          this.scene.remove(playerMesh);
          
          // Dispose of resources
          if (playerMesh.geometry) playerMesh.geometry.dispose();
          if (playerMesh.material) {
            if (Array.isArray(playerMesh.material)) {
              playerMesh.material.forEach(m => m.dispose());
            } else {
              playerMesh.material.dispose();
            }
          }
          
          // Remove from tracking
          this.playersRef.current.delete(playerId);
        }
        
        // Request accurate count from server
        socket.emit('getPlayerCount');
      });
      
      // Listen for server's total player count updates
      socket.on('playerCount', (count) => {
        console.log(`🔢 Received server player count: ${count}`);
        
        // Always trust the server's count
        this.broadcastPlayerCount(count);
        
        // If our local tracking doesn't match server, schedule a sync
        const localCount = this.playersRef.current.size + (this.playerRef.current ? 1 : 0);
        if (localCount !== count) {
          console.log(`🔄 Count mismatch: server=${count}, local=${localCount}. Scheduling sync...`);
          setTimeout(() => this.syncWithServer(), 500);
        }
      });
      
      // Request an accurate player count from server on initialization
      socket.emit('getPlayerCount');
      
      // Set up a periodic sync with server
      setInterval(() => {
        this.syncWithServer();
      }, 30000); // Every 30 seconds
    };
    
    // Make sure we set up critical events ourselves
    setupCriticalSocketEvents();
    
    // Set up game-specific socket listeners
    setupSocketListeners({
      scene: this.scene,
      playerRef: this.playerRef,
      playersRef: this.playersRef,
      nameLabelsRef: this.nameLabelsRef,
      worldManagerRef: this.worldManagerRef,
      cleanupIntervalRef: this.cleanupIntervalRef,
      setPlayerName: this.setPlayerName,
      createNameLabel: this.createNameLabel
    });
    
    // Set up additional listeners that aren't handled by gameSocketHandler
    const setupAdditionalListeners = async () => {
      const socket = await getSocket();
      if (!socket) return;
      
      // Listen for chat messages and create bubbles
      socket.on('chatMessage', (message) => {
        console.log('🟢 Received chatMessage event:', message);
        this.handleChatMessage(message);
      });
    };
    
    setupAdditionalListeners();
  }

  /**
   * Sends a system message to the chat panel
   */
  private sendSystemMessageToChat(message: string): void {
    // Create a system message object
    const systemMessage = {
      name: 'System',
      text: message,
      playerId: 'system',
      timestamp: Date.now(),
      isSystem: true
    };
    
    // Dispatch a custom event for the ChatPanel
    const chatMessageEvent = new CustomEvent('chatMessage', { 
      detail: systemMessage 
    });
    
    // Dispatch the event
    window.dispatchEvent(chatMessageEvent);
    
    console.log('Sent system message to chat:', message);
  }

  public async sendPlayerPosition(position: THREE.Vector3, rotationY: number, force: boolean = false): Promise<void> {
    try {
      const now = Date.now();
      const socket = await getSocket();
      
      // EMERGENCY DEBUGGING - Always log position sends
      console.log("%c 📡 ATTEMPTING POSITION SEND", "background: #ff5722; color: white; font-weight: bold;", {
        position: { 
          x: position.x.toFixed(2), 
          y: position.y.toFixed(2), 
          z: position.z.toFixed(2) 
        },
        rotation: rotationY.toFixed(2),
        force,
        socketExists: !!socket,
        time: new Date().toISOString()
      });
      
      // Minimum time between position updates (to limit network traffic)
      const MIN_UPDATE_INTERVAL = 50; // milliseconds
      
      // Don't send position updates too frequently unless forced
      if (!force && now - this.lastSendTime < MIN_UPDATE_INTERVAL) {
        console.log("Skipping position update - too soon after last update");
        return;
      }
      
      // Calculate distance from last sent position
      const dx = position.x - this.lastSentPosition.x;
      const dy = position.y - this.lastSentPosition.y;
      const dz = position.z - this.lastSentPosition.z;
      const distanceSquared = dx * dx + dy * dy + dz * dz;
      
      // Only send position update if moved significantly or forced
      if (force || distanceSquared > 0.001) {
        // Update last sent position and time
        this.lastSentPosition = { x: position.x, y: position.y, z: position.z };
        this.lastSendTime = now;
        
        // Check if socket is available
        if (!socket) {
          console.error("%c ❌ SOCKET NOT AVAILABLE", "background: red; color: white; font-size: 16px;");
          return;
        }
        
        // Create position data object manually to ensure proper format
        const positionData = {
          x: position.x,
          y: position.y,
          z: position.z,
          rotation: rotationY,
          timestamp: now
        };
        
        // Send position to server
        console.log("%c 📤 EMITTING playerMove TO SERVER", "background: green; color: white; font-size: 14px;", positionData);
        
        socket.emit('playerMove', positionData);
        
        // Cache position for reconnection
        saveLastKnownPosition({
          x: position.x,
          y: position.y,
          z: position.z
        });
        
        console.log("%c ✅ Position update sent successfully", "color: green;");
      } else {
        console.log("Skipping position update - no significant movement");
      }
    } catch (error) {
      console.error("%c ❌ ERROR SENDING POSITION", "background: red; color: white;", error);
    }
  }

  public async sendChatMessage(message: string): Promise<void> {
    const socket = await getSocket();
    if (socket) {
      console.log('Sending chat message to server:', message);
      
      try {
        // For debugging, first add a direct message to chat
        const directMessage = {
          name: this.playerRef.current?.userData?.playerName || 'You',
          text: message,
          timestamp: Date.now(),
          playerId: socket.id,
          isLocal: true
        };
        
        // Dispatch direct version to local chat
        const directEvent = new CustomEvent('chatMessage', { detail: directMessage });
        window.dispatchEvent(directEvent);
        
        // Then send to server for broadcasting to other players
        socket.emit('chat', message, (error: any, response: any) => {
          if (error) {
            console.error('Error sending chat message:', error);
            this.sendSystemMessageToChat(`Error sending message: ${error}`);
          } else if (response) {
            console.log('Server acknowledged chat message:', response);
          }
        });
      } catch (error) {
        console.error('Exception sending chat message:', error);
        this.sendSystemMessageToChat(`Error: Could not send message`);
      }
    } else {
      this.sendSystemMessageToChat('Cannot send message - not connected to server');
    }
  }

  public async sendInteractWithResource(resourceId: string): Promise<void> {
    const socket = await getSocket();
    if (socket) {
      socket.emit('gather', resourceId);
    }
  }

  public async sendPickupItem(itemId: string): Promise<void> {
    console.log(`%c 📦 SocketController.sendPickupItem called for item: ${itemId}`, "background: #FF9800; color: white; font-size: 14px;");
    
    const socket = await getSocket();
    if (socket) {
      console.log(`Emitting 'pickup' event with itemId: ${itemId} (type: ${typeof itemId})`);
      socket.emit('pickup', itemId);
      console.log(`Sent 'pickup' event for ${itemId}`);
    } else {
      console.error("Failed to get socket for SocketController.sendPickupItem");
    }
  }

  public async sendDropItem(itemId: string, quantity: number): Promise<void> {
    console.log(`%c 📦 SocketController.sendDropItem called for item: ${itemId}`, "background: #FF9800; color: white; font-size: 14px;");
    
    const socket = await getSocket();
    const player = this.playerRef.current;
    
    if (!socket || !player) return;
    
    // Try to find the item type from player inventory state
    let itemType = 'item'; // Default type
    
    // Use item lookup logic to find the correct type
    try {
      // For now, use a direct socket event with position data
      const positionElement = document.querySelector('[data-player-position]');
      let positionData = {};
      
      if (positionElement && positionElement.getAttribute('data-position')) {
        try {
          positionData = JSON.parse(positionElement.getAttribute('data-position') || '{}');
          console.log('Retrieved player position for drop:', positionData);
        } catch (e) {
          console.error('Failed to parse player position:', e);
        }
      } else {
        // Use the player's actual position if data attribute is not available
        positionData = {
          x: player.position.x,
          y: player.position.y,
          z: player.position.z
        };
      }
      
      // Send the drop with complete data
      console.log(`Emitting dropItem with itemId: ${itemId}, type: ${itemType}, position:`, positionData);
      socket.emit('dropItem', {
        itemId,
        itemType,
        ...positionData
      });
    } catch (error) {
      console.error('Error in sendDropItem:', error);
    }
  }

  public async updateDisplayName(name: string): Promise<void> {
    const socket = await getSocket();
    if (socket) {
      socket.emit('updateDisplayName', { name: name.trim() });
    }
  }

  /**
   * Request world data from the server (resources and world items)
   */
  public async requestWorldData(): Promise<void> {
    const socket = await getSocket();
    if (socket) {
      // Request resource nodes
      socket.emit('getResourceNodes');
      
      // Request world items
      socket.emit('getWorldItems');
      
      // Request existing players
      this.requestPlayersData();
    }
  }
  
  /**
   * Request players data from the server
   */
  public async requestPlayersData(): Promise<void> {
    const socket = await getSocket();
    if (socket) {
      // Request all existing players
      socket.emit('getPlayers');
      
      console.log('Requested players data from server');
      
      // Add a force-sync after a short delay to ensure players are added
      setTimeout(() => {
        this.forceSyncPlayers();
      }, 1000);
    }
  }

  /**
   * Force-sync all players to make sure they are properly tracked
   */
  public async forceSyncPlayers(): Promise<void> {
    const socket = await getSocket();
    if (!socket) return;
    
    // Server uses requestAllPlayers event to trigger initPlayers
    socket.emit('requestAllPlayers');
    console.log('🔴 Force-syncing players via requestAllPlayers event');
    
    // Give the server time to send the initPlayers event
    // Then check our tracking to make sure we have all players
    setTimeout(() => {
      // Get current player info for debug
      console.log('Player tracking after force-sync:', {
        count: this.playersRef.current.size,
        players: Array.from(this.playersRef.current.entries()).map(([id, mesh]) => {
          return {
            id,
            name: mesh.userData.playerName || 'Unknown'
          };
        })
      });
    }, 1000);
  }

  private cleanupDisconnectedPlayers = (): void => {
    const now = Date.now();
    const CLEANUP_THRESHOLD = 30000; // 30 seconds
    
    console.log(`🧹 Running cleanup check on ${this.playersRef.current.size} tracked players`);
    
    this.playersRef.current.forEach((mesh, id) => {
      if (mesh.userData && mesh.userData.lastUpdateTime && now - mesh.userData.lastUpdateTime > CLEANUP_THRESHOLD) {
        console.log(`🧹 Cleaning up disconnected player: ${id} (${mesh.userData.playerName || 'Unknown'}), last update: ${new Date(mesh.userData.lastUpdateTime).toLocaleTimeString()}`);
        
        // Remove mesh from scene
        this.scene.remove(mesh);
        
        // Clean up geometry and materials
        if (mesh.geometry) mesh.geometry.dispose();
        if (mesh.material) {
          if (Array.isArray(mesh.material)) {
            mesh.material.forEach(m => m.dispose());
          } else {
            mesh.material.dispose();
          }
        }
        
        // Remove from players map
        this.playersRef.current.delete(id);
        
        // Remove name label if exists
        if (this.nameLabelsRef.current.has(id)) {
          const label = this.nameLabelsRef.current.get(id);
          if (label) {
            if (label.parent) {
              label.parent.remove(label);
            }
            this.scene.remove(label);
            this.nameLabelsRef.current.delete(id);
          }
        }
        
        console.log(`Cleaned up disconnected player: ${id}`);
      }
    });
    
    // After cleanup, broadcast the updated player count
    this.broadcastPlayerCount(this.playersRef.current.size + 1); // +1 for local player
  };

  /**
   * Force adds a player mesh to the tracking map based on the object in the scene
   * This is used as a repair mechanism when we find player meshes in the scene not in the tracking map
   */
  public forceAddPlayerToMap(playerId: string): void {
    // Skip if already in map
    if (this.playersRef.current.has(playerId)) {
      console.log(`Player ${playerId} already in tracking map`);
      return;
    }
    
    // Look for the player mesh in the scene
    let playerMesh: THREE.Mesh | null = null;
    
    this.scene.traverse((object) => {
      if (object.userData && 
          object.userData.playerId === playerId && 
          object.type === 'Mesh' &&
          !playerMesh) { // Only take the first one we find
        playerMesh = object as THREE.Mesh;
      }
    });
    
    if (playerMesh) {
      console.log(`Found player mesh for ${playerId} in scene, adding to tracking map`);
      
      // Make sure userData is properly set up
      const meshWithUserData = playerMesh as THREE.Mesh & { userData: any };
      
      if (!meshWithUserData.userData.targetPosition) {
        meshWithUserData.userData.targetPosition = meshWithUserData.position.clone();
      }
      if (!meshWithUserData.userData.lastUpdateTime) {
        meshWithUserData.userData.lastUpdateTime = Date.now();
      }
      
      // Add to tracking map
      this.playersRef.current.set(playerId, playerMesh);
      
      // Verify
      console.log(`Player ${playerId} now in tracking map:`, this.playersRef.current.has(playerId));
      
      // Update player count
      this.broadcastPlayerCount(this.playersRef.current.size + 1); // +1 for local player
    } else {
      console.log(`Could not find player mesh for ${playerId} in scene`);
    }
  }

  /**
   * Creates a chat bubble above a player mesh
   */
  public createChatBubble(playerId: string, message: string, mesh: THREE.Mesh): CSS2DObject {
    // Remove any existing chat bubble for this player
    if (this.chatBubbles.has(playerId)) {
      const existingBubble = this.chatBubbles.get(playerId);
      if (existingBubble && existingBubble.object) {
        // Remove from parent if it has one
        if (existingBubble.object.parent) {
          existingBubble.object.parent.remove(existingBubble.object);
        }
        // Also remove from scene directly to be sure
        this.scene.remove(existingBubble.object);
      }
      // Remove from tracking map
      this.chatBubbles.delete(playerId);
    }
    
    // Create bubble div
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'chat-bubble';
    bubbleDiv.textContent = message;
    bubbleDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    bubbleDiv.style.color = 'white';
    bubbleDiv.style.padding = '5px 10px';
    bubbleDiv.style.borderRadius = '10px';
    bubbleDiv.style.fontSize = '12px';
    bubbleDiv.style.fontFamily = 'Arial, sans-serif';
    bubbleDiv.style.maxWidth = '150px';
    bubbleDiv.style.textAlign = 'center';
    bubbleDiv.style.wordWrap = 'break-word';
    bubbleDiv.style.userSelect = 'none';
    bubbleDiv.style.pointerEvents = 'none'; // Make sure bubbles don't interfere with clicks
    
    // Create the bubble object
    const chatBubble = new CSS2DObject(bubbleDiv);
    chatBubble.position.set(0, 3.2, 0); // Position above the player name
    chatBubble.userData.bubbleType = 'chatBubble';
    chatBubble.userData.forPlayer = playerId;
    
    // Add to mesh
    mesh.add(chatBubble);
    
    // Store in our ref with expiry time (10 seconds from now)
    const expiryTime = Date.now() + 10000; // 10 seconds
    this.chatBubbles.set(playerId, { 
      object: chatBubble, 
      expiry: expiryTime 
    });
    
    console.log(`Created chat bubble for player ${playerId}, expires at ${new Date(expiryTime).toLocaleTimeString()}`);
    
    return chatBubble;
  }

  /**
   * Checks for and removes expired chat bubbles
   */
  public updateChatBubbles(): void {
    const now = Date.now();
    const expiredBubbles: string[] = [];
    
    this.chatBubbles.forEach((bubble, playerId) => {
      if (now > bubble.expiry) {
        expiredBubbles.push(playerId);
      }
    });
    
    // Remove expired bubbles
    expiredBubbles.forEach(playerId => {
      const bubble = this.chatBubbles.get(playerId);
      if (bubble && bubble.object) {
        if (bubble.object.parent) {
          bubble.object.parent.remove(bubble.object);
        }
        this.scene.remove(bubble.object);
      }
      this.chatBubbles.delete(playerId);
    });
  }

  /**
   * Handles checking and updating the player's zone based on position
   */
  public checkAndUpdateZone(x: number, z: number): void {
    // Simple zone detection based on position
    let newZone = 'Lumbridge';
    
    if (x < -10 && z < -10) {
      newZone = 'Barbarian Village';
    } else if (x > 25 && z < 0) {
      newZone = 'Fishing Spot';
    } else if (x > 0 && z > 25) {
      newZone = 'Grand Exchange';
    } else if (x < -30 || z < -30 || x > 30 || z > 30) {
      newZone = 'Wilderness';
    }
    
    // Only update the zone if it's different, using a debounced approach
    if (this.setCurrentZone) {
      // Clear any pending zone update
      if (this.zoneUpdateTimeoutRef) {
        clearTimeout(this.zoneUpdateTimeoutRef);
      }
      
      // Set a timeout to update the zone (debounce zone changes)
      // This prevents multiple rapid zone updates from disrupting movement
      this.zoneUpdateTimeoutRef = setTimeout(() => {
        this.setCurrentZone(newZone);
        this.zoneUpdateTimeoutRef = null;
      }, 500); // 500ms debounce time
    }
  }

  /**
   * Handles received chat messages and creates chat bubbles if needed
   */
  public handleChatMessage(message: { name: string; text: string; playerId: string; timestamp: number; }): void {
    console.log('Handling chat message for bubbles and chat panel:', message);
    
    // Create chat bubble above player avatar
    // If this is our own message, add a chat bubble above our player
    if (message.playerId && this.playerRef.current && message.playerId === this.socket?.id) {
      this.createChatBubble(message.playerId, message.text, this.playerRef.current);
    } 
    // If it's another player's message, find their mesh and add a bubble
    else if (message.playerId && this.playersRef.current.has(message.playerId)) {
      const playerMesh = this.playersRef.current.get(message.playerId);
      if (playerMesh) {
        this.createChatBubble(message.playerId, message.text, playerMesh);
      }
    }
    
    // IMPORTANT: We also need to manually dispatch the message to ChatPanel
    // since we've intercepted the original event for our own handling
    const chatMessageEvent = new CustomEvent('chatMessage', { 
      detail: message 
    });
    
    // Dispatch the event to make sure ChatPanel also gets notified
    window.dispatchEvent(chatMessageEvent);
  }

  /**
   * Broadcasts the current player count to the chat panel
   */
  private broadcastPlayerCount(count: number): void {
    // Create an event with the player count
    const playerCountEvent = new CustomEvent('playerCount', {
      detail: { count }
    });
    
    // Dispatch the event for the chat panel to receive
    window.dispatchEvent(playerCountEvent);
    
    console.log(`Broadcasting player count: ${count}`);
  }

  public getSocketId(): string | null {
    return this.socket?.id || null;
  }
  
  public isConnected(): boolean {
    return this.socket?.connected || false;
  }

  /**
   * Display all currently connected players in the chat
   */
  public async showConnectedPlayers(): Promise<void> {
    const socket = await getSocket();
    if (!socket) return;
    
    // Get own player info
    const ownPlayer = {
      id: socket.id,
      name: this.playerRef.current?.userData.playerName || 'You'
    };
    
    // Get other players from the tracking map
    const otherPlayers = Array.from(this.playersRef.current.entries()).map(([id, mesh]) => {
      return {
        id,
        name: mesh.userData.playerName || 'Unknown'
      };
    });
    
    // Combine all players
    const allPlayers = [ownPlayer, ...otherPlayers];
    
    // Send a system message with the player list
    const message = `Connected players (${allPlayers.length}):\n` + 
      allPlayers.map(p => `${p.name}${p.id === socket.id ? ' (you)' : ''}`).join(', ');
    
    this.sendSystemMessageToChat(message);
  }

  /**
   * Check scene integrity and repair player mesh references
   * This fixes cases where players are in the scene but not in the tracking Map
   */
  public checkAndRepairPlayerReferences(): void {
    // Find any player meshes in the scene that aren't in our tracking
    const trackedPlayerIds = new Set(this.playersRef.current.keys());
    const missingPlayers: THREE.Object3D[] = [];
    
    // Log current state
    console.log('🔧 Checking player reference integrity. Current state:', {
      trackedPlayerIds: Array.from(trackedPlayerIds),
      trackedCount: this.playersRef.current.size,
    });
    
    // Scan the scene for player meshes that aren't tracked
    this.scene.traverse((object) => {
      if (object.userData && object.userData.playerId && 
          object.userData.playerId !== this.socket?.id && // Skip local player
          !trackedPlayerIds.has(object.userData.playerId) && 
          object.type === 'Mesh') {
        missingPlayers.push(object);
      }
    });
    
    // Report findings
    console.log(`🔧 Found ${missingPlayers.length} player meshes in scene that aren't tracked`);
    
    // Add missing players to our tracking
    missingPlayers.forEach(object => {
      const mesh = object as THREE.Mesh;
      const playerId = mesh.userData.playerId;
      const playerName = mesh.userData.playerName || 'Unknown Player';
      
      console.log(`🔧 Re-adding player ${playerId} (${playerName}) to tracking`);
      
      // Make sure the mesh has required userData for positioning
      if (!mesh.userData.targetPosition) {
        mesh.userData.targetPosition = mesh.position.clone();
      }
      if (!mesh.userData.lastUpdateTime) {
        mesh.userData.lastUpdateTime = Date.now();
      }
      
      // Add to tracking map
      this.playersRef.current.set(playerId, mesh);
    });
    
    // Log final state
    console.log('🔧 Final player tracking state:', {
      trackedPlayerIds: Array.from(this.playersRef.current.keys()),
      trackedCount: this.playersRef.current.size,
    });
    
    // Update player count - be sure to include the local player in the count
    const updatedCount = this.playersRef.current.size + 1; // +1 for local player
    this.broadcastPlayerCount(updatedCount);
    
    // Send a system message if we fixed players
    if (missingPlayers.length > 0) {
      this.sendSystemMessageToChat(`🔧 Repaired player tracking: Added ${missingPlayers.length} untracked player(s). Current player count: ${updatedCount}`);
    }
  }

  // Handler for player reference check
  private handlePlayerReferenceCheck = () => {
    console.log('Received player_reference_check event, running integrity check');
    this.checkAndRepairPlayerReferences();
  };

  // Handler for scene inspection
  private handleSceneInspection = () => {
    console.log('Received scene_inspection event, scanning scene');
    this.scanAndDisplayAllObjectsWithPlayerId();
  };

  // Handler for regenerating all players
  private handleRegenerateAllPlayers = () => {
    console.log('Received regenerate_all_players event, regenerating all players');
    this.forceRegenerateAllPlayers();
  };

  // Method to scan and display all objects with playerId in the scene
  private scanAndDisplayAllObjectsWithPlayerId(): void {
    console.log('Scanning scene for objects with playerId');
    
    let totalObjects = 0;
    let playerMeshes = 0;
    let playerLabels = 0;
    let playerObjects: { id: string, name: string, type: string, position: string }[] = [];
    
    // Traverse the scene
    this.scene.traverse((object) => {
      totalObjects++;
      
      // Check if object has playerId in userData
      if (object.userData && object.userData.playerId) {
        const id = object.userData.playerId;
        const name = object.userData.playerName || 'Unknown';
        const pos = object.position ? 
          `(${object.position.x.toFixed(1)}, ${object.position.y.toFixed(1)}, ${object.position.z.toFixed(1)})` : 
          'unknown';
        
        // Determine object type
        let type = object.type;
        
        if ((object as any).isCSS2DObject) {
          playerLabels++;
          type = 'CSS2DObject (Label)';
        } else if (object.type === 'Mesh') {
          playerMeshes++;
          type = 'Mesh (Player)';
        }
        
        // Add to array
        playerObjects.push({
          id,
          name,
          type,
          position: pos
        });
      }
    });
    
    // Generate report
    const summaryMessage = `Scene Contains: ${totalObjects} total objects, ${playerMeshes} player meshes, ${playerLabels} player labels`;
    console.log(summaryMessage);
    console.log('Player objects:', playerObjects);
    
    // Track which IDs are in the playersRef map
    const trackedIds = Array.from(this.playersRef.current.keys());
    const trackedCount = trackedIds.length;
    
    // Create a formatted report for chat
    let chatReport = `📊 Scene Inspection Report:\n`;
    chatReport += `- Total Objects: ${totalObjects}\n`;
    chatReport += `- Player Meshes: ${playerMeshes}\n`;
    chatReport += `- Player Labels: ${playerLabels}\n`;
    chatReport += `- Tracked Players (in playersRef): ${trackedCount}\n\n`;
    
    // Track untracked players to fix
    const untrackedPlayerIds: string[] = [];
    
    if (playerObjects.length > 0) {
      chatReport += `Player Objects in Scene:\n`;
      playerObjects.forEach(obj => {
        const trackingStatus = trackedIds.includes(obj.id) ? '✅ Tracked' : '❌ Untracked';
        chatReport += `- ${obj.name} (${obj.id}): ${obj.type} at ${obj.position} ${trackingStatus}\n`;
        
        // Add to untracked list if it's a mesh and not tracked
        if (!trackedIds.includes(obj.id) && obj.type.includes('Mesh')) {
          untrackedPlayerIds.push(obj.id);
        }
      });
    } else {
      chatReport += `No player objects found in scene.\n`;
    }
    
    // Include tracked players that aren't in the scene
    const missingFromScene = trackedIds.filter(id => 
      !playerObjects.some(obj => obj.id === id)
    );
    
    if (missingFromScene.length > 0) {
      chatReport += `\nTracked but Not in Scene:\n`;
      missingFromScene.forEach(id => {
        const mesh = this.playersRef.current.get(id);
        const name = mesh?.userData?.playerName || 'Unknown';
        chatReport += `- ${name} (${id}): Tracked in playersRef but not found in scene\n`;
      });
    }
    
    // Add auto-repair information if needed
    if (untrackedPlayerIds.length > 0) {
      chatReport += `\n🔧 Auto-repairing ${untrackedPlayerIds.length} untracked player(s)...\n`;
      
      // Fix each untracked player
      untrackedPlayerIds.forEach(id => {
        this.forceAddPlayerToMap(id);
      });
      
      // Update count after repair
      const newCount = this.playersRef.current.size + 1; // +1 for local player
      chatReport += `🔧 Repair complete. Player count now: ${newCount}\n`;
    }
    
    // Send to chat
    this.sendSystemMessageToChat(chatReport);
  }

  /**
   * Force regenerate all players from scratch
   * This is a nuclear option for when player tracking gets completely out of sync
   */
  public async forceRegenerateAllPlayers(): Promise<void> {
    const socket = await getSocket();
    if (!socket) return;
    
    console.log('💥 NUCLEAR OPTION: Force regenerating all players from scratch');
    
    // First, clear all existing players
    this.clearAllPlayers();
    
    // Request fresh player data from server
    socket.emit('requestAllPlayers');
    
    // Send message to chat
    this.sendSystemMessageToChat('💥 Forced complete player regeneration. All players should reappear in a moment.');
  }
  
  /**
   * Clear all players from the scene and tracking
   */
  private clearAllPlayers(): void {
    console.log('🧹 Clearing all players from scene and tracking');
    
    // Get list of player IDs to remove
    const playerIds = Array.from(this.playersRef.current.keys());
    
    // Log what we're removing
    console.log(`🧹 Removing ${playerIds.length} players from tracking:`, playerIds);
    
    // Loop through each player mesh
    this.playersRef.current.forEach((mesh, id) => {
      console.log(`🧹 Removing player ${id}`);
      
      // Clean up disappearance timeout if exists
      if (mesh.userData.disappearanceTimeout) {
        clearTimeout(mesh.userData.disappearanceTimeout);
        mesh.userData.disappearanceTimeout = null;
      }
      
      // Remove from scene
      this.scene.remove(mesh);
      
      // Clean up materials and geometry
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(m => m.dispose());
        } else {
          mesh.material.dispose();
        }
      }
      
      // Remove any CSS2DObjects (name labels, chat bubbles, etc)
      mesh.traverse((child) => {
        if ((child as any).isCSS2DObject) {
          if (child.parent) {
            child.parent.remove(child);
          }
        }
      });
    });
    
    // Clear tracking maps
    this.playersRef.current.clear();
    this.nameLabelsRef.current.clear();
    
    // Broadcast player count update (just 1 for local player)
    this.broadcastPlayerCount(1);
    
    console.log('🧹 All players cleared. Player tracking map size:', this.playersRef.current.size);
  }

  /**
   * Synchronize player list with server
   */
  private syncWithServer = async (): Promise<void> => {
    const socket = await getSocket();
    if (!socket) return;
    
    // Get our current tracked player IDs
    const localPlayerIds = Array.from(this.playersRef.current.keys());
    
    console.log('🔄 Syncing player list with server. Local state:', {
      localPlayerCount: localPlayerIds.length,
      localPlayerIds
    });
    
    // Request server to validate our list
    socket.emit('syncPlayerList', localPlayerIds, (serverPlayerIds: string[]) => {
      console.log('🔄 Received server player list:', {
        serverPlayerCount: serverPlayerIds.length,
        serverPlayerIds
      });
      
      // Check for players that should be removed (in local but not on server)
      const playersToRemove = localPlayerIds.filter(id => !serverPlayerIds.includes(id));
      
      // Check for players that are missing (on server but not in local)
      const playersMissing = serverPlayerIds.filter(id => !localPlayerIds.includes(id) && id !== socket.id);
      
      console.log('🔄 Sync analysis:', {
        playersToRemove,
        playersMissing
      });
      
      // Remove players that shouldn't be here
      if (playersToRemove.length > 0) {
        console.log(`🔄 Removing ${playersToRemove.length} players that are no longer on server`);
        
        playersToRemove.forEach(id => {
          console.log(`🔄 Removing player ${id} as they're not on server`);
          const playerMesh = this.playersRef.current.get(id);
          if (playerMesh) {
            this.scene.remove(playerMesh);
            this.playersRef.current.delete(id);
            
            // Clean up resources
            if (playerMesh.geometry) playerMesh.geometry.dispose();
            if (playerMesh.material) {
              if (Array.isArray(playerMesh.material)) {
                playerMesh.material.forEach(m => m.dispose());
              } else {
                playerMesh.material.dispose();
              }
            }
          }
        });
        
        // Update local count display
        this.broadcastPlayerCount(serverPlayerIds.length);
      }
      
      // If we're missing players, request them from server
      if (playersMissing.length > 0) {
        console.log(`🔄 Requesting ${playersMissing.length} missing players from server`);
        
        // Force a full refresh of players - more reliable than just requesting missing ones
        socket.emit('requestAllPlayers');
        
        // Also perform a scene inspection to catch any orphaned player meshes
        this.scanAndDisplayAllObjectsWithPlayerId();
        
        // Send a chat message about the resync
        this.sendSystemMessageToChat(`🔄 Synchronizing with server: Adding ${playersMissing.length} missing players...`);
      }
      
      // Even if there were no changes, let's update the player count from the server
      // This ensures we always have the accurate count
      this.broadcastPlayerCount(serverPlayerIds.length);
    });
  };

  /**
   * Request current player count from server (source of truth)
   */
  public async requestPlayerCount(): Promise<void> {
    const socket = await getSocket();
    if (socket) {
      console.log('📊 SocketController requesting player count from server');
      socket.emit('getPlayerCount');
    }
  }
}

export default SocketController; 