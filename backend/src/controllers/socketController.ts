import supabase from '../config/supabase';
import { Server, Socket } from 'socket.io';
import { 
  loadWorldItems, 
  loadResourceNodes,
  savePlayerPosition,
  savePlayerInventory,
  dropItemInWorld,
  removeWorldItem
} from '../models/gameModel';
import { verifySocketToken } from '../middleware/authMiddleware';
import { ResourceHandler } from './handlers/ResourceHandler';
import { InventoryHandler } from './handlers/InventoryHandler';
import { WorldItemHandler } from './handlers/WorldItemHandler';
import { ChatHandler } from './handlers/ChatHandler';
import { SmithingHandler } from './handlers/SmithingHandler';
import { ExperienceHandler } from './handlers/ExperienceHandler';

// Define interfaces for type safety
interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

interface Player {
  id: string;
  userId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  inventory: InventoryItem[];
  equippedItem?: InventoryItem; // Currently equipped item
  health?: number; // Player's current health
  maxHealth?: number; // Player's maximum health
  inCombat?: boolean; // Whether player is in combat
}

interface InventoryItem {
  id: string;
  type: string;
  quantity: number;
  [key: string]: any;
}

interface WorldItem {
  dropId: string;
  itemType: string;
  x: number;
  y: number;
  z: number;
  droppedBy?: string;
}

interface ResourceNode {
  id: string;
  type: string;
  x: number;
  y: number;
  z: number;
  respawnTime: number;
  remainingResources?: number;
  state?: 'normal' | 'harvested';
  metadata?: Record<string, any>;
}

interface ExtendedSocket extends Socket {
  user?: {
    id: string;
    [key: string]: any;
  };
  data: {
    lastPositionUpdate?: number;
    movementCount?: number;
    sessionId?: string;
    [key: string]: any;
  };
}

interface PlayerPosition {
  x: number;
  y: number;
  z: number;
  timestamp?: number;
  rotation?: number;
}

interface PlayersStore {
  [socketId: string]: Player;
}

// Define world boundaries
const WORLD_BOUNDS: WorldBounds = {
  minX: -50,
  maxX: 50,
  minZ: -50,
  maxZ: 50
};

// Store connected players
const players: PlayersStore = {};

// Add a map to track user ID to socket ID for reconnection handling
const userIdToSocketId: Record<string, string> = {};

// Handler instances
let inventoryHandler: InventoryHandler;
let worldItemHandler: WorldItemHandler;
let chatHandler: ChatHandler;
let resourceHandler: ResourceHandler;
let smithingHandler: SmithingHandler;
let experienceHandler: ExperienceHandler;

// Define NPC interface
interface NPC {
  id: string;
  type: string;
  name: string;
  x: number;
  y: number;
  z: number;
  level: number;
  health: number;
  maxHealth: number;
  isAggressive: boolean;
  isAttackable: boolean;
  respawnTime: number; // ms
  experienceReward: number;
  lastAttackTime?: number; // Used internally for combat cooldown
  lastAttacker?: string; // Socket ID of last attacker
  combatState: 'idle' | 'engaged' | 'dead';
}

// Store for NPCs
let npcs: {[npcId: string]: NPC} = {};

// Initialize handlers with IO instance
const initializeHandlers = (io: Server) => {
  console.log('[SOCKET INIT] Initializing handlers');
  
  // Create the ExperienceHandler first, as others depend on it
  experienceHandler = new ExperienceHandler();
  
  inventoryHandler = new InventoryHandler(io, players);
  worldItemHandler = new WorldItemHandler(io, players);
  chatHandler = new ChatHandler(io, players);
  resourceHandler = new ResourceHandler(io, players, experienceHandler);
  smithingHandler = new SmithingHandler(io, players, experienceHandler);
  
  console.log('[SOCKET INIT] Handlers initialized successfully');
};

// Add a global listener for testing
const setupGlobalDebugListeners = (io: Server) => {
  console.log('[SOCKET DEBUG] Setting up global debug listeners');
  
  io.on('connection', (socket) => {
    // Clear any existing listeners to prevent memory leaks
    socket.removeAllListeners('testEvent');
    socket.removeAllListeners('smithingDebug');
    socket.removeAllListeners('startSmelting');
    
    // Add a test event listener to all sockets to verify event handling
    socket.on('testEvent', (data) => {
      console.log(`[SOCKET TEST] Received test event from ${socket.id}:`, data);
      socket.emit('testResponse', { received: true, message: 'Test event received successfully' });
    });
    
    // Add another smithingDebug handler at the global level
    socket.on('smithingDebug', (data) => {
      console.log(`[SOCKET TEST] Global smithingDebug listener received message from ${socket.id}:`, data);
      // Echo back the message
      socket.emit('smithingResponse', { 
        received: true, 
        message: 'Debug message received at global level',
        originalData: data
      });
    });
    
    // Also add a separate startSmelting handler at the global level for debugging
    socket.on('startSmelting', (data) => {
      console.log(`[SOCKET TEST] Global startSmelting listener caught event from ${socket.id}:`, data);
    });
  });
};

// Add function to broadcast player count
const broadcastPlayerCount = (io: Server) => {
  // Count active connections from socket.io to ensure accuracy
  const getConnectedClientsCount = (): number => {
    try {
      const rooms = io.sockets.adapter.rooms;
      const sids = io.sockets.adapter.sids;
      
      // Count all unique socket IDs
      const connectedCount = Array.from(sids.keys()).length;
      console.log(`Active socket connections: ${connectedCount}`);
      
      return connectedCount;
    } catch (error) {
      console.error('Error counting connected clients:', error);
      // Fallback to the players object count
      return Object.keys(players).length;
    }
  };

  const count = getConnectedClientsCount();
  io.emit('playerCount', { count });
};

// Store world items and resource nodes
let worldItems: WorldItem[] = [];
let resourceNodes: ResourceNode[] = [];

// Add a helper function to check for default positions
const isDefaultPosition = (x: number, y: number, z: number): boolean => {
  return x === 0 && y === 1 && z === 0;
};

// Initialize game state by loading data from the database
const initializeGameState = async (): Promise<void> => {
  try {
    // Load world items
    worldItems = await loadWorldItems();
    console.log(`Loaded ${worldItems.length} world items from database`);
    
    // Load resource nodes
    resourceNodes = await loadResourceNodes();
    console.log(`Loaded ${resourceNodes.length} resource nodes from database`);
    
    // Initialize NPCs
    initializeNPCs();
    
    console.log('Game state initialized successfully');
  } catch (error) {
    console.error('Failed to initialize game state:', error instanceof Error ? error : new Error(String(error)));
  }
};

// Initialize the NPCs
const initializeNPCs = (): void => {
  console.log('Initializing NPCs...');
  
  // Create 3 rat NPCs - make them all attackable and slightly aggressive
  const rat1 = createNPC('rat', 'Rat', 15, 0, 15, 1, true, true);
  const rat2 = createNPC('rat', 'Rat', 25, 0, 25, 1, true, true);
  const rat3 = createNPC('rat', 'Rat', 35, 0, 35, 1, true, true);
  
  // Add to NPCs store
  npcs[rat1.id] = rat1;
  npcs[rat2.id] = rat2;
  npcs[rat3.id] = rat3;
  
  console.log(`Created ${Object.keys(npcs).length} NPCs:`);
  Object.values(npcs).forEach(npc => {
    console.log(`- ${npc.name}: lvl ${npc.level}, hp ${npc.health}/${npc.maxHealth}, aggressive: ${npc.isAggressive}, attackable: ${npc.isAttackable}`);
  });
};

// Create a new NPC
const createNPC = (
  type: string,
  name: string,
  x: number,
  y: number,
  z: number,
  level: number = 1,
  isAggressive: boolean = false,
  isAttackable: boolean = true
): NPC => {
  const id = `${type}_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  
  return {
    id,
    type,
    name,
    x,
    y,
    z,
    level,
    health: level * 10, // Simple formula: level * 10 health
    maxHealth: level * 10,
    isAggressive,
    isAttackable,
    respawnTime: 10000, // 10 seconds respawn time
    experienceReward: level * 20, // Simple formula: level * 20 XP
    combatState: 'idle'
  };
};

// Setup all socket handlers
const setupSocketHandlers = (io: Server, socket?: ExtendedSocket): void => {
  // Initialize handlers first
  initializeHandlers(io);
  
  // Set up global debug listeners
  setupGlobalDebugListeners(io);
  
  // If socket is provided, we're handling a single connection
  if (socket) {
    console.log(`Setting up handlers for existing socket: ${socket.id}`);
    handleSingleConnection(io, socket);
    return;
  }
  
  // This branch should not be reached in normal operation as middleware is set up in index.js
  console.warn('Setting up socket handlers without a specific socket - this is not recommended');
  
  // Handle socket connections
  io.on('connection', async (socket: ExtendedSocket) => {
    console.log(`New connection in setupSocketHandlers: ${socket.id}`);
    handleSingleConnection(io, socket);
  });

  // Set up periodic player count broadcast (every 30 seconds)
  setInterval(() => {
    broadcastPlayerCount(io);
  }, 30000);
};

// Handle a single socket connection
const handleSingleConnection = async (io: Server, socket: ExtendedSocket): Promise<void> => {
  try {
    console.log(`[SOCKET CONNECT] Setting up handlers for socket ${socket.id}`);
    
    // Set a higher max listeners to properly handle events
    socket.setMaxListeners(30);
    
    // Clean up on disconnect
    socket.on('disconnect', () => {
      console.log(`[SOCKET DISCONNECT] Socket ${socket.id} disconnected, cleaning up listeners`);
      
      // Clean up all listeners to prevent memory leaks
      socket.removeAllListeners();
    });
    
    // Ensure experienceHandler exists
    if (!experienceHandler) {
      console.error('[SOCKET CONNECT] ExperienceHandler not initialized, creating it now');
      experienceHandler = new ExperienceHandler();
    }
    
    // Ensure smithingHandler exists
    if (!smithingHandler) {
      console.error('[SOCKET CONNECT] SmithingHandler not initialized, creating it now');
      smithingHandler = new SmithingHandler(io, players, experienceHandler);
    }
    
    // Ensure resourceHandler exists
    if (!resourceHandler) {
      console.error('[SOCKET CONNECT] ResourceHandler not initialized, creating it now');
      resourceHandler = new ResourceHandler(io, players, experienceHandler);
    }
    
    // Setup other handlers with the correct method names
    if (inventoryHandler) {
      try {
        inventoryHandler.setupAllHandlers(socket);
      } catch (error) {
        console.error('[SOCKET CONNECT] Error setting up inventory handlers:', error);
      }
    }
    
    if (worldItemHandler) {
      try {
        worldItemHandler.setupItemPickupHandler(socket);
      } catch (error) {
        console.error('[SOCKET CONNECT] Error setting up world item handlers:', error);
      }
    }
    
    if (chatHandler) {
      try {
        chatHandler.setupChatHandler(socket);
      } catch (error) {
        console.error('[SOCKET CONNECT] Error setting up chat handlers:', error);
      }
    }
    
    if (resourceHandler) {
      try {
        resourceHandler.setupResourceGatheringHandler(socket);
      } catch (error) {
        console.error('[SOCKET CONNECT] Error setting up resource handlers:', error);
      }
    }
    
    // Setup smithing handlers - debug the process
    if (smithingHandler) {
      console.log('[SOCKET CONNECT] Setting up smithing handlers for socket', socket.id);
      try {
        smithingHandler.setupSmithingHandlers(socket);
        console.log('[SOCKET CONNECT] Successfully set up smithing handlers');
      } catch (error) {
        console.error('[SOCKET CONNECT] Error setting up smithing handlers:', error);
      }
    } else {
      console.error('[SOCKET CONNECT] SmithingHandler still not available');
    }
    
    let playerData;
    let profile;
    
    // Generate a session ID for this connection
    // Use the persistent tempUserId if available, otherwise fallback to socket.id
    const tempUserId = socket.handshake.auth.tempUserId;
    const sessionId = tempUserId || socket.id;
    
    // Store the sessionId in the socket for future reference
    socket.data.sessionId = sessionId;
    
    console.log(`Using session ID: ${sessionId} (${tempUserId ? 'from persistent ID' : 'from socket ID'})`);
    
    // Default starting position - only used as a fallback
    // We'll try to find a saved position first
    const defaultPosition = {
      x: 0,
      y: 1,
      z: 0
    };
    
    // Try to load existing temporary player data
    let { data: tempData, error: tempError } = await supabase
      .from('temp_player_data')
      .select('*')
      .eq('session_id', sessionId)
      .single();
      
    if (tempError && tempError.code === 'PGRST116') {
      // No existing data found - check if we have any previous records for this player
      // This could help with reconnections from the same device/browser
      
      console.log(`No existing data for session ${sessionId}, creating new temp player data`);
      
      // Default temp data uses random spawn point instead of 0,1,0
      // Here we could implement spawn points around the world
      const spawnPoints = [
        { x: 5, y: 1, z: 5 },
        { x: -5, y: 1, z: 5 },
        { x: 5, y: 1, z: -5 },
        { x: -5, y: 1, z: -5 },
        { x: 10, y: 1, z: 0 },
        { x: 0, y: 1, z: 10 }
      ];
      
      // Select a random spawn point
      const randomSpawn = spawnPoints[Math.floor(Math.random() * spawnPoints.length)];
      
      const defaultTempData = {
        session_id: sessionId,
        username: `Guest-${socket.id.substring(0, 4)}`,
        x: randomSpawn.x,
        y: randomSpawn.y,
        z: randomSpawn.z,
        inventory: '[]'
      };
      
      try {
        const { data: newTempData, error: createError } = await supabase
          .from('temp_player_data')
          .insert(defaultTempData)
          .select()
          .single();
        
        if (createError) {
          console.error(`Failed to create temp player data for session ${sessionId}:`, createError);
          tempData = defaultTempData;
        } else {
          tempData = newTempData;
          console.log(`Created new player at position (${randomSpawn.x}, ${randomSpawn.y}, ${randomSpawn.z})`);
        }
      } catch (error) {
        console.error(`Exception creating temp player data for session ${sessionId}:`, error);
        tempData = defaultTempData;
      }
    } else if (tempError) {
      console.error(`Error loading temp player data for session ${sessionId}:`, tempError);
      // As a fallback, still use a random spawn point
      const spawnPoint = { x: 10 * (Math.random() - 0.5), y: 1, z: 10 * (Math.random() - 0.5) };
      
      tempData = {
        session_id: sessionId,
        username: `Guest-${socket.id.substring(0, 4)}`,
        x: spawnPoint.x,
        y: spawnPoint.y,
        z: spawnPoint.z,
        inventory: '[]'
      };
    } else {
      console.log(`Found existing player data for session ${sessionId}:`, {
        position: { x: tempData.x, y: tempData.y, z: tempData.z },
        username: tempData.username
      });
    }
    
    // Check if this guest player is an admin
    if (tempData.isAdmin) {
      console.log(`Player ${tempData.username} (${sessionId}) has admin privileges`);
      // Create the user object if it doesn't exist yet
      if (!socket.user) {
        socket.user = {
          id: sessionId // Required property
        };
      }
      // Set admin flag on socket.user
      socket.user!.isAdmin = true;
    }
    
    // Convert temp data to player data format
    playerData = {
      user_id: sessionId,
      x: tempData.x,
      y: tempData.y,
      z: tempData.z,
      inventory: tempData.inventory
    };
    
    profile = {
      user_id: sessionId,
      username: tempData.username
    };
    
    // Create player object
    const newPlayer: Player = {
      id: socket.id,
      userId: sessionId,
      name: profile?.username || `Player-${socket.id.substring(0, 4)}`,
      x: playerData?.x ?? 0,
      y: playerData?.y ?? 1,
      z: playerData?.z ?? 0,
      inventory: JSON.parse(playerData?.inventory || '[]')
    };
    
    // Store the player in our players object
    players[socket.id] = newPlayer;
    
    // Log connected players
    console.log(`Player ${newPlayer.name} (${socket.id}) added. Total players: ${Object.keys(players).length}`);
    console.log('Connected players:', Object.keys(players).map(id => `${players[id].name} (${id})`).join(', '));
    
    // Broadcast the updated player count
    broadcastPlayerCount(io);
    
    // Always tell all other clients about the new player
    socket.broadcast.emit('playerJoined', newPlayer);
    console.log(`Broadcasting new player ${newPlayer.name} (${socket.id}) to other players`);
    
    // Send the new player the list of existing players
    const existingPlayers = Object.values(players).filter(p => p.id !== socket.id);
    socket.emit('initPlayers', existingPlayers);
    
    // Send world items
    socket.emit('initWorldItems', worldItems);
    
    // Send resource nodes
    socket.emit('initResourceNodes', resourceNodes);
    
    // Send inventory
    socket.emit('inventoryUpdate', newPlayer.inventory || []);

    // Send current player count immediately to the new client
    const initialCount = Object.keys(players).length;
    console.log(`Sending initial player count: ${initialCount} to new client ${socket.id}`);
    socket.emit('playerCount', { count: initialCount });
    
    // Also broadcast to all clients to ensure consistency
    broadcastPlayerCount(io);

    // Ensure player has health properties and send initial health values
    if (newPlayer.health === undefined) newPlayer.health = 100;
    if (newPlayer.maxHealth === undefined) newPlayer.maxHealth = 100;

    // Send initial health values to the client
    socket.emit('updatePlayerHealth', {
      current: newPlayer.health,
      max: newPlayer.maxHealth
    });
    console.log(`[${socket.id}] Sent initial health values to player: ${newPlayer.health}/${newPlayer.maxHealth}`);

    // Handle player movement
    socket.on('playerMove', async (position: PlayerPosition) => {
      
      // Check if position is an empty object or has undefined values
      if (Object.keys(position).length === 0) {
        console.log(`⚠️ WARNING: Received empty position object from ${socket.id}!`);
        return;
      }
      
      // Check for undefined values in key fields
      if (position.x === undefined || position.y === undefined || position.z === undefined) {
        console.log(`⚠️ WARNING: Received position with undefined values from ${socket.id}:`, position);
        return;
      }
      
      // Update player position in server state
      if (players[socket.id]) {
        // No longer clamping player positions to world boundaries
        const validX = position.x;
        const validZ = position.z;
        
        // Update player position with coordinates
        players[socket.id].x = validX;
        players[socket.id].y = position.y;
        players[socket.id].z = validZ;
        
        // Broadcast new position to all other clients
        const moveEvent = {
          id: socket.id,
          x: validX,
          y: position.y,
          z: validZ,
          rotation: position.rotation || 0,
          timestamp: position.timestamp || Date.now()
        };
        
        // Skip broadcasting if this is the default position (0,1,0)
        // This prevents unnecessary position updates for new or reconnected players
        if (isDefaultPosition(validX, position.y, validZ)) {
          console.log(`Skipping broadcast - default position (0,1,0)`);
          return;
        }
        
        // Debug this broadcast to ensure it's working
        try {
          // Broadcast to all EXCEPT the current socket
          socket.broadcast.emit('playerMoved', moveEvent);
        } catch (error) {
          console.error('Error broadcasting player movement:', error);
        }
        
        // Update position in database (throttled)
        const now = Date.now();
        const lastUpdate = socket.data.lastPositionUpdate || 0;
        if (now - lastUpdate > 5000) { // Update position every 5 seconds max
          socket.data.lastPositionUpdate = now;
          
          try {
            if (socket.user && socket.user.id) {
              // Update authenticated player position
              await savePlayerPosition(socket.user.id, validX, position.y, validZ);
            } else {
              // Update temporary player position
              const { error: tempError } = await supabase
                .from('temp_player_data')
                .update({ 
                  x: validX,
                  y: position.y,
                  z: validZ,
                  last_active: new Date().toISOString()
                })
                .eq('session_id', socket.id);
                
              if (tempError) {
                console.error(`Failed to update temp player position for session ${socket.id}:`, tempError);
              }
            }
          } catch (error) {
            console.error('Failed to update player position:', error);
          }
        }
      }
    });
    
    // Handle ping events for connection monitoring
    socket.on('ping', (callback) => {
      // Simple ping-pong to verify connection is alive
      if (typeof callback === 'function') {
        callback();
      }
    });
    
    // Handle getPlayerData requests
    socket.on('getPlayerData', (playerId: string, callback) => {
      
      // Find the requested player
      const player = players[playerId];
      
      if (player) {
        callback(player);
      } else {
        callback(null);
      }
    });
    
    // Handle chat messages
    socket.on('chat', async (text: string) => {
      // Get player info or use defaults if somehow not found
      const player = players[socket.id] || { name: 'Unknown', id: socket.id };
      const playerName = player.name;
      
      console.log(`Chat message received from player ${playerName} (${socket.id}):`, text);
      
      // Create the message object with all required fields
      const messageObj = {
        sender: playerName,
        name: playerName, // For compatibility
        text: text,
        playerId: socket.id,
        timestamp: Date.now()
      };
      
      console.log('Emitting chat message to all clients:', messageObj);
      
      // Emit to all clients including sender
      io.emit('chatMessage', messageObj);
      
      // Log the number of clients that should receive this
      try {
        // Use proper Socket.IO v4 method to get connected sockets
        console.log(`Active socket rooms:`, Array.from(io.sockets.adapter.rooms.keys()));
        const connectedSockets = await io.fetchSockets();
        console.log(`Message sent to ${connectedSockets.length} connected clients:`, 
          connectedSockets.map(s => s.id).join(', '));
      } catch (error) {
        console.error('Error getting socket clients:', error);
      }
    });

    // Handle display name updates
    socket.on('updateDisplayName', async (data: { name: string }) => {
      const newName = data.name.trim();
      if (!newName) {
        console.error(`Socket ${socket.id} tried to set empty display name`);
        return;
      }

      console.log(`Updating display name for player ${socket.id} to: ${newName}`);

      try {
        if (socket.user && socket.user.id) {
          // Update authenticated user's profile
          const { error: profileError } = await supabase
            .from('profiles')
            .update({ username: newName })
            .eq('user_id', socket.user.id);

          if (profileError) {
            console.error(`Failed to update profile for user ${socket.user.id}:`, profileError);
            return;
          }
        } else {
          // Get the persistent session ID
          const sessionId = socket.data.sessionId || socket.id;
          
          // Update temporary player's name
          const { error: tempError } = await supabase
            .from('temp_player_data')
            .update({ 
              username: newName,
              last_active: new Date().toISOString()
            })
            .eq('session_id', sessionId);
            
          if (tempError) {
            console.error(`Failed to update temp player name for session ${sessionId}:`, tempError);
            return;
          }
        }

        // Update the player's name in our in-memory state
        if (players[socket.id]) {
          players[socket.id].name = newName;
          
          // Broadcast the name change to all clients
          io.emit('playerJoined', players[socket.id]);
        }

        console.log(`Successfully updated display name for player ${socket.id} to: ${newName}`);
      } catch (error) {
        console.error(`Error updating display name for player ${socket.id}:`, error);
      }
    });
    
    // Handle resource gathering
    socket.on('gather', async (resourceId: string) => {
      // Find the resource node
      const resource = resourceNodes.find(node => node.id === resourceId);
      
      if (!resource) {
        socket.emit('error', 'Resource not found');
        return;
      }
      
      // Check if player is close enough to the resource
      const player = players[socket.id];
      if (!player) {
        socket.emit('error', 'Player not found');
        return;
      }
      
      const distance = Math.sqrt(
        Math.pow(player.x - resource.x, 2) +
        Math.pow(player.y - resource.y, 2) +
        Math.pow(player.z - resource.z, 2)
      );
      
      // Only allow gathering if player is within 3 units of the resource
      if (distance > 3) {
        socket.emit('error', 'Too far from resource');
        return;
      }
      
      // Determine what item to give based on the resource type
      let itemType;
      switch (resource.type) {
        case 'tree': itemType = 'wood'; break;
        case 'rock': itemType = 'stone'; break;
        case 'bush': itemType = 'berries'; break;
        case 'copper_rock': itemType = 'copper_ore'; break;
        case 'tin_rock': itemType = 'tin_ore'; break;
        case 'iron_rock': itemType = 'iron_ore'; break;
        case 'coal_rock': itemType = 'coal'; break;
        case 'gold_rock': itemType = 'gold_ore'; break;
        case 'mithril_rock': itemType = 'mithril_ore'; break;
        default: itemType = 'unknown';
      }
      
      // Create a new item
      const newItem = {
        id: Math.random().toString(36).substr(2, 9),
        type: itemType,
        quantity: 1
      };
      
      // Add to player's inventory
      if (!players[socket.id].inventory) {
        players[socket.id].inventory = [];
      }
      
      players[socket.id].inventory.push(newItem);
      
      // Update client's inventory
      socket.emit('inventoryUpdate', players[socket.id].inventory);
      
      // Save to database
      try {
        if (socket.user && socket.user.id) {
          await savePlayerInventory(socket.user.id, players[socket.id].inventory);
        }
      } catch (error) {
        console.error('Failed to save inventory to database:', error instanceof Error ? error : new Error(String(error)));
      }
    });
    
    // Shared function for pickup item logic
    const handleItemPickup = async (dropId: string) => {
      
      const player = players[socket.id];
      if (!player) {
        console.error(`[ERROR] Player not found for socket ID: ${socket.id}`);
        return;
      }
      
      const itemIndex = worldItems.findIndex(item => item.dropId === dropId);
      
      if (itemIndex !== -1) {
        const worldItem = worldItems[itemIndex];
        
        // Calculate distance to item
        const distance = Math.sqrt(
          Math.pow(player.x - worldItem.x, 2) +
          Math.pow(player.y - worldItem.y, 2) +
          Math.pow(player.z - worldItem.z, 2)
        );
        
        // Check if player is close enough to pick up the item
        if (distance <= 2) {
          
          // Create new inventory item
          const newItem = {
            id: Math.random().toString(36).substr(2, 9),
            type: worldItem.itemType,
            quantity: 1
          };
          
          // Add to player's inventory
          if (!player.inventory) {
            player.inventory = [];
          }
          
          player.inventory.push(newItem);

          // Remove from world items array
          worldItems.splice(itemIndex, 1);
          
          // Tell all clients about the removed world item
          io.emit('worldItemRemoved', dropId);
          
          // Update client's inventory
          socket.emit('inventoryUpdate', player.inventory);
          
          // Save to database
          try {
            // Save updated inventory
            if (socket.user && socket.user.id) {
              await savePlayerInventory(socket.user.id, player.inventory);
            }
            
            // Remove the item from the world in database
            await removeWorldItem(dropId);
          } catch (error) {
            console.error('Failed to save pickup to database:', error instanceof Error ? error : new Error(String(error)));
          }
        } else {
          socket.emit('error', `Too far to pick up item: ${distance.toFixed(2)} units away (max: 2)`);
        }
      } else {
        const errorMsg = `Item with dropId ${dropId} not found in worldItems`;
        console.error(errorMsg);
        socket.emit('error', errorMsg);
        
        // Send the current list of world items to help resync
        socket.emit('worldItems', worldItems);
      }
    };
    
    // Handle item pickup
    socket.on('pickupItem', async (receivedData: any) => {
      console.log(`Processing 'pickupItem' event with data:`, receivedData);
      console.log(`Data type: ${typeof receivedData}, Raw value: ${JSON.stringify(receivedData)}`);
      
      // Try to extract the dropId in different ways
      let dropId: string;
      if (typeof receivedData === 'string') {
        dropId = receivedData;
      } else if (typeof receivedData === 'object' && receivedData !== null) {
        // Try to extract dropId or itemId from object
        dropId = receivedData.dropId || receivedData.itemId || receivedData.id || '';
      } else {
        // Convert to string as fallback
        dropId = String(receivedData);
      }
      
      console.log(`Extracted dropId: ${dropId}, Socket ID: ${socket.id}`);
      
      if (!dropId) {
        console.error('Invalid dropId received:', receivedData);
        return;
      }
      
      await handleItemPickup(dropId);
    });
    
    // Handle item pickup with older 'pickup' event for backwards compatibility
    socket.on('pickup', async (receivedData: any) => {
      console.log(`Processing legacy 'pickup' event with data:`, receivedData);
      console.log(`Data type: ${typeof receivedData}, Raw value: ${JSON.stringify(receivedData)}`);
      
      // Try to extract the dropId in different ways
      let dropId: string;
      if (typeof receivedData === 'string') {
        dropId = receivedData;
      } else if (typeof receivedData === 'object' && receivedData !== null) {
        // Try to extract dropId or itemId from object
        dropId = receivedData.dropId || receivedData.itemId || '';
      } else {
        // Convert to string as fallback
        dropId = String(receivedData);
      }
      
      console.log(`Extracted dropId: ${dropId}, Socket ID: ${socket.id}`);
      
      if (!dropId) {
        console.error('Invalid dropId received:', receivedData);
        return;
      }
      
      await handleItemPickup(dropId);
    });
    
    // Handle item dropping
    socket.on('dropItem', async (data: any) => {
      try {
        // Log the received data
        console.log(`%c 📦 [${socket.id}] Received dropItem event:`, "background: #FF9800; color: white;", data);
        
        // Validate input
        const player = players[socket.id];
        if (!player) {
          console.error(`[${socket.id}] Player not found in dropItem handler`);
          socket.emit('error', 'Player not found');
          return;
        }
        
        // Get the itemId - support both formats
        const itemId = data.itemId || data.id;
        if (!itemId) {
          console.error(`[${socket.id}] No itemId or id provided in dropItem event`, data);
          socket.emit('error', 'Missing itemId in drop request');
          return;
        }
        
        console.log(`[${socket.id}] Looking for item ${itemId} in inventory with ${player.inventory?.length || 0} items`);
        console.log(`Player inventory:`, player.inventory);
        
        if (!player.inventory || player.inventory.length === 0) {
          console.error(`[${socket.id}] Player inventory is empty or missing`);
          socket.emit('error', 'Inventory is empty');
          return;
        }
        
        const itemIndex = player.inventory.findIndex(i => i.id === itemId);
        if (itemIndex === -1) {
          console.error(`[${socket.id}] Item ${itemId} not found in player's inventory`);
          socket.emit('error', `Item ${itemId} not found in inventory`);
          return;
        }
        
        // Get the item
        const droppedItem = player.inventory[itemIndex];
        console.log(`[${socket.id}] Found item to drop:`, droppedItem);
        
        // Remove from inventory (either reduce quantity or remove entirely)
        if (droppedItem.quantity > 1) {
          droppedItem.quantity -= 1;
          console.log(`[${socket.id}] Reduced item quantity to ${droppedItem.quantity}`);
        } else {
          player.inventory.splice(itemIndex, 1);
          console.log(`[${socket.id}] Removed item from inventory`);
        }
        
        // Generate a unique ID for the world item
        const dropId = `drop-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // Get position from data or use player position
        const x = data.x !== undefined ? data.x : player.x;
        const y = data.y !== undefined ? data.y : player.y;
        const z = data.z !== undefined ? data.z : player.z;

        // Get item type - either from the data or from the inventory item
        const itemType = data.itemType || droppedItem.type;
        
        console.log(`[${socket.id}] Creating world item at position (${x}, ${y}, ${z}) with type: ${itemType}`);
        
        // Create the world item object
        const worldItem = {
          dropId,
          itemType,
          x,
          y,
          z,
          droppedBy: socket.id
        };
        
        // Add to the worldItems array
        worldItems.push(worldItem);
        console.log(`[${socket.id}] Added item to worldItems array. Current count: ${worldItems.length}`);
        
        // Broadcast to all clients - IMPORTANT: Only send ONE event type to prevent duplicates
        console.log(`[${socket.id}] Broadcasting item to all clients:`, worldItem);
        io.emit('itemDropped', worldItem);
        
        // Update client's inventory
        socket.emit('inventoryUpdate', player.inventory);
        
        // Send a specific drop success event for this drop request with clientDropId for tracking
        if (data.clientDropId) {
          socket.emit('dropSuccess', {
            clientDropId: data.clientDropId,
            dropId: worldItem.dropId,
            itemType: worldItem.itemType
          });
        }
        
        // Save to database if database functions exist
        try {
          // Save the dropped item to the world items collection
          await dropItemInWorld(dropId, itemType, x, y, z);
          console.log(`[${socket.id}] Saved world item to database: ${dropId}`);
          
          // Save the player's updated inventory
          if (socket.user && socket.user.id) {
            await savePlayerInventory(socket.user.id, player.inventory);
            console.log(`[${socket.id}] Saved player inventory to database`);
          }
        } catch (dbError) {
          console.error(`[${socket.id}] Database error:`, dbError);
        }
      } catch (error) {
        console.error(`[${socket.id}] Error in dropItem handler:`, error);
        socket.emit('error', 'Internal error processing drop request');
      }
    });
    
    // Handle player disconnection
    socket.on('disconnect', async () => {
      const player = players[socket.id];
      if (player) {
        console.log(`Player ${player.name} (${socket.id}) disconnected`);
        
        try {
          // Get the persistent session ID
          const sessionId = socket.data.sessionId || socket.id;
          
          // Save temporary player data
          const { error: tempError } = await supabase
            .from('temp_player_data')
            .update({ 
              x: player.x,
              y: player.y,
              z: player.z,
              inventory: JSON.stringify(player.inventory || []),
              last_active: new Date().toISOString()
            })
            .eq('session_id', sessionId);
            
          if (tempError) {
            console.error(`Failed to save temp player data for session ${sessionId}:`, tempError);
          } else {
            console.log(`Successfully saved player data for session ${sessionId}`);
          }
        } catch (error) {
          console.error('Error during player disconnect save:', error);
        }
        
        // Remove player from our state
        delete players[socket.id];
        
        // Let ALL clients know the player left
        io.emit('playerLeft', socket.id);
        
        // Broadcast the updated player count
        broadcastPlayerCount(io);
      }
    });

    // Handle registerWorldItem event to ensure server has the item
    socket.on('registerWorldItem', (data: any) => {
      try {
        // Check if valid data
        if (!data || !data.dropId || !data.itemType) {
          console.error(`Invalid data in registerWorldItem event:`, data);
          
          if (data && data.requireConfirmation) {
            socket.emit('registerWorldItemResponse', { error: 'Invalid data' });
          }
          return;
        }
        
        console.log(`Received registerWorldItem event for dropId: ${data.dropId}`);
        
        // Check if the item is already in the worldItems array
        const existingItem = worldItems.find(item => item.dropId === data.dropId);
        if (existingItem) {
          console.log(`Item ${data.dropId} already exists in server worldItems`);
          
          if (data.requireConfirmation) {
            socket.emit('registerWorldItemResponse', { exists: true, dropId: data.dropId });
          }
          return;
        }
        
        // Add the item to the worldItems array
        const worldItem: WorldItem = {
          dropId: data.dropId,
          itemType: data.itemType,
          x: data.x,
          y: data.y,
          z: data.z,
          droppedBy: socket.id
        };
        
        worldItems.push(worldItem);
        console.log(`Added client item ${data.dropId} to server worldItems. Current count: ${worldItems.length}`);
        
        // Broadcast to other clients (excluding the sender)
        socket.broadcast.emit('worldItemAdded', worldItem);
        
        // Send confirmation if requested
        if (data.requireConfirmation) {
          socket.emit('registerWorldItemResponse', { 
            success: true, 
            dropId: data.dropId 
          });
        }
        
        // Save to database
        try {
          dropItemInWorld(data.dropId, data.itemType, data.x, data.y, data.z);
          console.log(`Saved client item to database: ${data.dropId}`);
        } catch (dbError) {
          console.error(`Database error while saving client item:`, dbError);
          
          if (data.requireConfirmation) {
            socket.emit('registerWorldItemResponse', { 
              warning: 'Item registered but database save failed',
              dropId: data.dropId 
            });
          }
        }
      } catch (error) {
        console.error(`Error in registerWorldItem handler:`, error);
        
        if (data && data.requireConfirmation) {
          socket.emit('registerWorldItemResponse', { error: 'Server error processing request' });
        }
      }
    });

    // Get world items event
    socket.on('getWorldItems', async () => {
      console.log(`Client ${socket.id} requested world items. Current count: ${worldItems.length}`);
      
      // Check if world items are empty, and if so, generate some test items
      if (worldItems.length === 0) {
        console.log("World items array is empty. Creating test items for player:", socket.id);
        
        // Generate some test items near the player
        const player = players[socket.id];
        if (player) {
          const { x, y, z } = player;
          
          // Create test items of different types
          const testItems = [
            {
              dropId: `drop-${Date.now()}-coal-1`,
              itemType: 'coal',
              x: x + 2,
              y: y,
              z: z + 2
            },
            {
              dropId: `drop-${Date.now()}-log-1`,
              itemType: 'log',
              x: x - 2,
              y: y,
              z: z + 1
            },
            {
              dropId: `drop-${Date.now()}-fish-1`,
              itemType: 'fish',
              x: x + 1,
              y: y,
              z: z - 2
            },
            {
              dropId: `drop-${Date.now()}-bronze_pickaxe-1`,
              itemType: 'bronze_pickaxe',
              x: x - 1,
              y: y,
              z: z - 1
            },
            {
              dropId: `drop-${Date.now()}-bronze_axe-1`,
              itemType: 'bronze_axe',
              x: x + 1.5,
              y: y,
              z: z + 1.5
            }
          ];
          
          // Add items to the world
          worldItems.push(...testItems);
          
          console.log(`Created ${testItems.length} test items near player:`, testItems);
          
          // Save to database - for persistence
          try {
            for (const item of testItems) {
              await dropItemInWorld(item.dropId, item.itemType, item.x, item.y, item.z);
            }
            console.log("Saved test items to database");
          } catch (error) {
            console.error("Failed to save test items to database:", error);
          }
        }
      }
      
      // Send world items to the client
      socket.emit('worldItems', worldItems);
    });

    // Handle test add item to inventory
    socket.on('testAddItem', async (itemType: string = 'coal') => {
      console.log(`[${socket.id}] Received testAddItem event for type: ${itemType}`);
      
      const player = players[socket.id];
      if (!player) {
        console.error(`[${socket.id}] Player not found for testAddItem`);
        return;
      }
      
      // Ensure player has an inventory array
      if (!player.inventory) {
        player.inventory = [];
      }
      
      // Create a new inventory item with unique ID
      const newItem = {
        id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        type: itemType,
        quantity: 1
      };
      
      // Add to player's inventory on server
      player.inventory.push(newItem);
      console.log(`[${socket.id}] Added test item to player inventory:`, newItem);
      
      // Send updated inventory to client
      socket.emit('inventoryUpdate', player.inventory);
      console.log(`[${socket.id}] Sent inventoryUpdate with ${player.inventory.length} items`);
      
      // Save to database if we have a user ID
      try {
        if (socket.user && socket.user.id) {
          await savePlayerInventory(socket.user.id, player.inventory);
          console.log(`[${socket.id}] Saved inventory to database for user: ${socket.user.id}`);
        }
      } catch (error) {
        console.error(`[${socket.id}] Failed to save inventory:`, error);
      }
    });

    // Initialize handlers
    inventoryHandler.setupItemDropHandler(socket);
    inventoryHandler.setupItemUseHandler(socket);
    inventoryHandler.setupEquipItemHandler(socket); // Register the equip handler
    worldItemHandler.setupItemPickupHandler(socket);
    chatHandler.setupChatHandler(socket);
    resourceHandler.setupResourceGatheringHandler(socket);
    smithingHandler.setupSmithingHandlers(socket); // Register the smithing handlers

    // Create a new handler for chat commands
    setupChatCommandHandler(io, socket);

    // Add handling for resource nodes request
    socket.on('getResourceNodes', async () => {
      try {
        const nodes = await resourceHandler.getResourceNodes();
        socket.emit('initResourceNodes', nodes);
      } catch (error) {
        console.error('Error sending resource nodes to client:', error);
        socket.emit('error', 'Failed to load resource nodes');
      }
    });

    // Setup resource interaction handlers
    resourceHandler.setupResourceInteractionHandler(socket);
    resourceHandler.setupResourceGatheringHandler(socket);
    
    // Add resource gathering event handlers for the new database format
    socket.on('start_gathering', (data: { resourceId: string }) => {
      console.log(`Player ${socket.id} started gathering resource ${data.resourceId}`);
      resourceHandler.startGathering(socket, data.resourceId);
    });

    socket.on('stop_gathering', () => {
      console.log(`Player ${socket.id} stopped gathering`);
      resourceHandler.stopGathering(socket.id);
    });

    // Setup NPC handlers
    setupNPCHandlers(io, socket);

    // Handle player health updates
    socket.on('updateHealth', (data: { amount: number }) => {
      try {
        const player = players[socket.id];
        if (!player) {
          console.warn(`[${socket.id}] Health update failed: player not found`);
          return;
        }
        
        // Ensure player has health properties
        if (player.health === undefined) player.health = 100;
        if (player.maxHealth === undefined) player.maxHealth = 100;
        
        // Update health (negative amount = damage, positive = healing)
        const oldHealth = player.health;
        player.health = Math.max(0, Math.min(player.maxHealth, player.health + data.amount));
        
        // Check if player took damage
        if (data.amount < 0) {
          player.inCombat = true;
          
          // Send combat message to player
          socket.emit('chatMessage', {
            content: `You take ${Math.abs(data.amount)} damage.`, 
            type: 'combat',
            timestamp: Date.now()
          });
          
          // Check if player died
          if (player.health <= 0) {
            handlePlayerDeath(io, socket, player);
          }
        } else if (data.amount > 0) {
          // Healing message
          socket.emit('chatMessage', {
            content: `You heal for ${data.amount} health.`, 
            type: 'system',
            timestamp: Date.now()
          });
        }
        
        // Send updated health to client - send both event types for compatibility
        socket.emit('updateHealth', {
          amount: data.amount
        });
        
        // Send complete health update with current and max values
        socket.emit('updatePlayerHealth', {
          current: player.health,
          max: player.maxHealth
        });
        console.log(`[COMBAT DEBUG] Emitted updatePlayerHealth event with current: ${player.health}, max: ${player.maxHealth}`);
        
        console.log(`[${socket.id}] Player ${player.name} health ${oldHealth} -> ${player.health} (${data.amount < 0 ? 'damage' : 'heal'}: ${Math.abs(data.amount)})`);
      } catch (error) {
        console.error(`[${socket.id}] Error processing health update:`, error);
      }
    });

    // Handle player dealing damage to an NPC
    socket.on('damageNPC', (data: { npcId: string, damage: number }) => {
      try {
        console.log(`[COMBAT] Player ${socket.id} attempting to damage NPC ${data.npcId} for ${data.damage} damage`);
        
        const { npcId, damage } = data;
        const npc = npcs[npcId];
        const player = players[socket.id];
        
        if (!npc || !player) {
          console.warn(`[${socket.id}] Damage attempt on non-existent NPC or player not found.`);
          return;
        }
        
        // Check if NPC is in combat state
        if (npc.combatState !== 'engaged') {
          console.log(`[${socket.id}] NPC ${npcId} is not in combat.`);
          return;
        }
        
        // Check if the attacker is the same player
        if (npc.lastAttacker !== socket.id) {
          console.log(`[${socket.id}] Player is not the attacker of NPC ${npcId}.`);
          return;
        }
        
        // Apply damage
        const oldHealth = npc.health;
        npc.health = Math.max(0, npc.health - damage);
        
        console.log(`[COMBAT] NPC ${npc.name} health reduced from ${oldHealth} to ${npc.health} (damage: ${damage})`);
        
        // Broadcast updated health
        io.emit('npcStateUpdate', { 
          id: npc.id, 
          health: npc.health, 
          maxHealth: npc.maxHealth 
        });
        
        // Send combat message to player
        socket.emit('chatMessage', {
          content: `You hit ${npc.name} for ${damage} damage.`, 
          type: 'combat',
          timestamp: Date.now()
        });
        
        console.log(`[${socket.id}] Player ${player.name} dealt ${damage} damage to NPC ${npc.name} (${npcId}). Health: ${npc.health}/${npc.maxHealth}`);
        
        // Check if NPC is defeated
        if (npc.health <= 0) {
          handleNPCDefeat(io, socket, npc, player);
        }
      } catch (error) {
        console.error(`[${socket.id}] Error processing NPC damage:`, error);
      }
    });
  } catch (error) {
    console.error(`Error in handleSingleConnection for ${socket.id}:`, error);
    socket.disconnect();
  }
};

// Create a new handler for chat commands
const setupChatCommandHandler = (io: Server, socket: ExtendedSocket) => {
  socket.on('chatCommand', async (data: { command: string, params: any }) => {
    console.log(`[${socket.id}] Received chat command:`, data);
    
    if (!players[socket.id]) {
      console.error(`[${socket.id}] Player not found for chat command`);
      socket.emit('chatMessage', { 
        content: 'Error: You must be logged in to use commands', 
        type: 'system', 
        timestamp: Date.now() 
      });
      return;
    }
    
    const player = players[socket.id];
    
    try {
      switch (data.command.toLowerCase()) {
        case 'drop':
          handleDropCommand(io, socket, player, data.params);
          break;
        
        case 'give':
          handleGiveCommand(io, socket, player, data.params);
          break;
          
        case 'cleanup':
          handleCleanupCommand(io, socket, player);
          break;
          
        default:
          socket.emit('chatMessage', { 
            content: `Unknown command: ${data.command}`, 
            type: 'system', 
            timestamp: Date.now() 
          });
          break;
      }
    } catch (error) {
      console.error(`[${socket.id}] Error processing chat command:`, error);
      socket.emit('chatMessage', { 
        content: `Error processing command: ${error instanceof Error ? error.message : 'Unknown error'}`, 
        type: 'system', 
        timestamp: Date.now() 
      });
    }
  });
};

// Handle the /drop command
const handleDropCommand = async (io: Server, socket: ExtendedSocket, player: Player, params: any) => {
  const { itemName } = params;
  
  if (!itemName) {
    socket.emit('chatMessage', { 
      content: 'Usage: /drop [item_name] - Drops the specified item on the ground', 
      type: 'system', 
      timestamp: Date.now() 
    });
    return;
  }
  
  console.log(`[${socket.id}] Processing drop command for item: ${itemName}`);
  
  // Find the item in the player's inventory
  const itemIndex = player.inventory.findIndex(item => 
    item.type.toLowerCase() === itemName.toLowerCase()
  );
  
  if (itemIndex === -1) {
    socket.emit('chatMessage', { 
      content: `You don't have a "${itemName}" in your inventory.`, 
      type: 'system', 
      timestamp: Date.now() 
    });
    return;
  }
  
  // Get the item
  const item = player.inventory[itemIndex];
  
  // Create a unique ID for the dropped item
  const dropId = `drop-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
  
  // Add small random offset to drop position
  const dropX = player.x + (Math.random() * 2 - 1);
  const dropZ = player.z + (Math.random() * 2 - 1);
  
  // Remove the item from inventory
  player.inventory.splice(itemIndex, 1);
  
  // Create the world item
  const worldItem = {
    dropId,
    itemType: item.type,
    x: dropX,
    y: player.y,
    z: dropZ,
    droppedBy: socket.id
  };
  
  try {
    // Save to database
    await dropItemInWorld(dropId, item.type, dropX, player.y, dropZ);
    
    // Broadcast the dropped item to all players
    io.emit('itemDropped', worldItem);
    
    // Update player's inventory
    socket.emit('inventoryUpdate', player.inventory);
    
    // Save inventory to database if we have a user ID
    if (socket.user && socket.user.id) {
      await savePlayerInventory(socket.user.id, player.inventory);
    }
    
    // Send success message
    socket.emit('chatMessage', { 
      content: `You dropped: ${itemName}`, 
      type: 'action', 
      timestamp: Date.now() 
    });
    
    console.log(`[${socket.id}] Successfully dropped ${itemName} with ID ${dropId}`);
  } catch (error) {
    console.error(`[${socket.id}] Error dropping item:`, error);
    socket.emit('chatMessage', { 
      content: 'Error dropping item. Please try again.', 
      type: 'system', 
      timestamp: Date.now() 
    });
  }
};

// Handle the /give command to add an item to inventory
const handleGiveCommand = async (io: Server, socket: ExtendedSocket, player: Player, params: any) => {
  const { itemName } = params;
  
  if (!itemName) {
    socket.emit('chatMessage', { 
      content: 'Usage: /give [item_name] - Adds the specified item to your inventory', 
      type: 'system', 
      timestamp: Date.now() 
    });
    return;
  }
  
  console.log(`[${socket.id}] Processing give command for item: ${itemName}`);
  
  // List of valid items
  const validItems = [
    'log', 'coal', 'fish', 'bronze_pickaxe', 'bronze_axe', 
    'iron_pickaxe', 'iron_axe', 'steel_pickaxe', 'steel_axe'
  ];
  
  // Check if the requested item is valid
  const normalizedItemName = itemName.toLowerCase();
  const validItem = validItems.find(item => item === normalizedItemName);
  
  if (!validItem) {
    socket.emit('chatMessage', { 
      content: `Invalid item name: "${itemName}". Valid items are: ${validItems.join(', ')}`, 
      type: 'system', 
      timestamp: Date.now() 
    });
    return;
  }
  
  // Create a new inventory item with unique ID
  const newItem = {
    id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    type: validItem,
    quantity: 1
  };
  
  // Ensure player has an inventory array
  if (!player.inventory) {
    player.inventory = [];
  }
  
  // Add to player's inventory
  player.inventory.push(newItem);
  
  // Update inventory on client
  socket.emit('inventoryUpdate', player.inventory);
  
  // Send success message
  socket.emit('chatMessage', { 
    content: `Added ${validItem} to your inventory.`, 
    type: 'system', 
    timestamp: Date.now() 
  });
  
  // Save to database if we have a user ID
  try {
    if (socket.user && socket.user.id) {
      await savePlayerInventory(socket.user.id, player.inventory);
      console.log(`[${socket.id}] Saved inventory to database for user: ${socket.user.id}`);
    }
  } catch (error) {
    console.error(`[${socket.id}] Failed to save inventory:`, error);
  }
};

// Add handler for the /cleanup command
const handleCleanupCommand = async (io: Server, socket: ExtendedSocket, player: Player) => {
  console.log(`[${socket.id}] Processing cleanup command from player ${player.name}`);
  
  // Check if the player has admin privileges
  if (!socket.user?.isAdmin) {
    console.log(`[${socket.id}] Cleanup command rejected - user is not an admin`);
    socket.emit('chatMessage', { 
      content: 'Error: You do not have permission to use this command.', 
      type: 'system', 
      timestamp: Date.now() 
    });
    return;
  }
  
  // Send initial feedback that we're processing the command
  socket.emit('chatMessage', { 
    content: 'Processing cleanup command, please wait...', 
    type: 'system', 
    timestamp: Date.now() 
  });
  
  try {
    // Log the cleanup start time for performance tracking
    const startTime = Date.now();
    console.log(`[${socket.id}] Starting cleanup operation at ${new Date(startTime).toISOString()}`);
    
    // Execute the cleanup - await the operation to ensure it completes
    const cleanupResult = await worldItemHandler.removeAllItems();
    
    // Calculate execution time
    const executionTime = Date.now() - startTime;
    console.log(`[${socket.id}] Cleanup operation completed in ${executionTime}ms`);
    
    if (cleanupResult) {
      // Broadcast success message to all players
      io.emit('chatMessage', { 
        content: `${player.name} has removed all items from the game world. The ground is now clean.`, 
        type: 'system', 
        timestamp: Date.now() 
      });
      
      // Send a private confirmation to the admin
      socket.emit('chatMessage', { 
        content: `Cleanup completed successfully in ${executionTime/1000} seconds.`, 
        type: 'system', 
        timestamp: Date.now() 
      });
      
      console.log(`[${socket.id}] Successfully executed cleanup command (including database cleanup)`);
    } else {
      // Database cleanup had an issue, inform the admin
      socket.emit('chatMessage', { 
        content: 'Warning: Items were removed from the game world, but there were issues with database cleanup. Some items may still exist in the database.', 
        type: 'system', 
        timestamp: Date.now() 
      });
      
      // General announcement to all players
      io.emit('chatMessage', { 
        content: `${player.name} has cleared all items from the ground, but some database issues were encountered.`, 
        type: 'system', 
        timestamp: Date.now() 
      });
      
      console.log(`[${socket.id}] Executed cleanup command with database issues`);
    }
    
    // Update the in-memory worldItems array reference (just to be sure)
    worldItems = [];
  } catch (error) {
    console.error(`[${socket.id}] Error executing cleanup command:`, error);
    
    socket.emit('chatMessage', { 
      content: `Error removing items: ${error instanceof Error ? error.message : 'Unknown error'}. The game world may have been cleaned, but the database may still contain items.`, 
      type: 'system', 
      timestamp: Date.now() 
    });
    
    // Update the in-memory worldItems array reference in case of error
    worldItems = [];
  }
};

// Setup handlers for NPC interactions
const setupNPCHandlers = (io: Server, socket: ExtendedSocket): void => {
  // Send all NPCs to the newly connected player
  socket.emit('updateNPCs', Object.values(npcs));
  
  // Handle request for NPCs (helps with reconnection and ensuring client has data)
  socket.on('requestNPCs', () => {
    console.log(`[${socket.id}] Client requested NPC data`);
    socket.emit('updateNPCs', Object.values(npcs));
  });
  
  // Handle player attacking an NPC
  socket.on('attackNPC', (data: { npcId: string }) => {
    try {
      const { npcId } = data;
      const npc = npcs[npcId];
      const player = players[socket.id];
      
      if (!npc || !player) {
        console.warn(`[${socket.id}] Attack attempt on non-existent NPC or player not found.`);
        return;
      }
      
      // Check if NPC is attackable and not dead
      if (!npc.isAttackable || npc.combatState === 'dead') {
        console.log(`[${socket.id}] NPC ${npcId} is not attackable or is already dead.`);
        return;
      }
      
      // Check if player is in range
      const distance = Math.sqrt(
        Math.pow(player.x - npc.x, 2) +
        Math.pow(player.z - npc.z, 2)
      );
      
      if (distance > 5) { // 5 unit attack range
        console.log(`[${socket.id}] Player too far from NPC ${npcId} to attack.`);
        return;
      }
      
      // Mark NPC as engaged in combat
      npc.combatState = 'engaged';
      npc.lastAttacker = socket.id;
      
      // Broadcast NPC state update
      io.emit('npcStateUpdate', { 
        id: npc.id, 
        combatState: npc.combatState,
        health: npc.health,
        maxHealth: npc.maxHealth,
        attacker: socket.id
      });
      
      console.log(`[${socket.id}] Player ${player.name} attacked NPC ${npc.name} (${npcId})`);
      
      // If NPC is aggressive, it will counter-attack the player
      if (npc.isAggressive) {
        console.log(`[${socket.id}] Aggressive NPC ${npc.name} will counter-attack`);
        
        // Start NPC attack loop - make it attack faster (every 2 seconds)
        const attackInterval = setInterval(() => {
          const player = players[socket.id];
          if (!player || !socket.connected || npc.combatState !== 'engaged') {
            // Stop attacking if player disconnected or NPC is dead/idle
            clearInterval(attackInterval);
            console.log(`[COMBAT] Stopping NPC ${npc.name} attacks - combat ended`);
            return;
          }
          
          // NPC deals higher damage to player for better visibility
          const damage = Math.max(2, Math.floor(npc.level * 1.5)); // More damage based on level
          
          console.log(`[COMBAT] NPC ${npc.name} attacking player ${player.name} for ${damage} damage`);
          
          // Send damage to player
          socket.emit('updateHealth', {
            amount: -damage // Negative for damage
          });
          console.log(`[COMBAT DEBUG] Emitted updateHealth event with amount: ${-damage}`);
          
          // Send attack message to player
          socket.emit('chatMessage', {
            content: `${npc.name} hits you for ${damage} damage!`, 
            type: 'combat',
            timestamp: Date.now()
          });
          
          console.log(`[${socket.id}] NPC ${npc.name} deals ${damage} damage to player ${player.name}`);
        }, 2000); // Attack every 2 seconds instead of 3
        
        // Clean up the interval if NPC dies or combat ends
        const clearAttackInterval = () => {
          clearInterval(attackInterval);
          console.log(`[COMBAT] Cleared attack interval for NPC ${npc.name}`);
        };
        
        // Setup one-time listeners for combat end
        socket.once('disconnect', clearAttackInterval);
        
        // Remove attack interval when NPC dies or changes state
        const npcStateListener = (data: { id: string, combatState?: string }) => {
          if (data.id === npc.id && data.combatState && data.combatState !== 'engaged') {
            clearAttackInterval();
            socket.off('npcStateUpdate', npcStateListener);
          }
        };
        
        socket.on('npcStateUpdate', npcStateListener);
      }
    } catch (error) {
      console.error(`[${socket.id}] Error processing NPC attack:`, error);
    }
  });
  
  // Handle player dealing damage to an NPC
  socket.on('damageNPC', (data: { npcId: string, damage: number }) => {
    try {
      console.log(`[COMBAT] Player ${socket.id} attempting to damage NPC ${data.npcId} for ${data.damage} damage`);
      
      const { npcId, damage } = data;
      const npc = npcs[npcId];
      const player = players[socket.id];
      
      if (!npc || !player) {
        console.warn(`[${socket.id}] Damage attempt on non-existent NPC or player not found.`);
        return;
      }
      
      // Check if NPC is in combat state
      if (npc.combatState !== 'engaged') {
        console.log(`[${socket.id}] NPC ${npcId} is not in combat.`);
        return;
      }
      
      // Check if the attacker is the same player
      if (npc.lastAttacker !== socket.id) {
        console.log(`[${socket.id}] Player is not the attacker of NPC ${npcId}.`);
        return;
      }
      
      // Apply damage
      const oldHealth = npc.health;
      npc.health = Math.max(0, npc.health - damage);
      
      console.log(`[COMBAT] NPC ${npc.name} health reduced from ${oldHealth} to ${npc.health} (damage: ${damage})`);
      
      // Broadcast updated health
      io.emit('npcStateUpdate', { 
        id: npc.id, 
        health: npc.health, 
        maxHealth: npc.maxHealth 
      });
      
      // Send combat message to player
      socket.emit('chatMessage', {
        content: `You hit ${npc.name} for ${damage} damage.`, 
        type: 'combat',
        timestamp: Date.now()
      });
      
      console.log(`[${socket.id}] Player ${player.name} dealt ${damage} damage to NPC ${npc.name} (${npcId}). Health: ${npc.health}/${npc.maxHealth}`);
      
      // Check if NPC is defeated
      if (npc.health <= 0) {
        handleNPCDefeat(io, socket, npc, player);
      }
    } catch (error) {
      console.error(`[${socket.id}] Error processing NPC damage:`, error);
    }
  });
};

// Handle NPC defeat
const handleNPCDefeat = (io: Server, socket: ExtendedSocket, npc: NPC, player: Player): void => {
  // Mark NPC as dead
  npc.combatState = 'dead';
  
  // Broadcast NPC death
  io.emit('npcStateUpdate', { 
    id: npc.id, 
    combatState: npc.combatState 
  });
  
  console.log(`[${socket.id}] NPC ${npc.name} (${npc.id}) was defeated by player ${player.name}`);
  
  // Send victory message to player
  socket.emit('chatMessage', {
    content: `You have defeated ${npc.name}!`, 
    type: 'combat',
    timestamp: Date.now()
  });
  
  // Award experience to player
  if (socket.user) {
    const skillType = "attack"; // Default to attack skill for now
    const xpAmount = npc.experienceReward;
    
    socket.emit('updatePlayerSkill', {
      skillType,
      xpAmount
    });
    
    // Send XP reward message
    socket.emit('chatMessage', {
      content: `You gained ${xpAmount} ${skillType} XP.`, 
      type: 'experience',
      timestamp: Date.now()
    });
    
    console.log(`[${socket.id}] Awarded ${xpAmount} ${skillType} XP to player for defeating ${npc.name}`);
  }
  
  // Set respawn timer
  setTimeout(() => {
    respawnNPC(io, npc);
  }, npc.respawnTime);
};

// Respawn a defeated NPC
const respawnNPC = (io: Server, npc: NPC): void => {
  // Reset NPC state
  npc.health = npc.maxHealth;
  npc.combatState = 'idle';
  npc.lastAttacker = undefined;
  
  // Broadcast NPC respawn
  io.emit('npcStateUpdate', { 
    id: npc.id, 
    combatState: npc.combatState,
    health: npc.health,
    maxHealth: npc.maxHealth
  });
  
  // Notify nearby players that NPC has respawned
  // Find players within a certain range
  const nearbyPlayers = Object.entries(players).filter(([socketId, player]) => {
    const distance = Math.sqrt(
      Math.pow(player.x - npc.x, 2) + 
      Math.pow(player.z - npc.z, 2)
    );
    return distance < 20; // 20 units is a reasonable "nearby" distance
  });
  
  // Send notification to nearby players
  nearbyPlayers.forEach(([socketId, player]) => {
    io.to(socketId).emit('chatMessage', {
      content: `A ${npc.name} has appeared nearby.`,
      type: 'system',
      timestamp: Date.now()
    });
  });
  
  console.log(`NPC ${npc.name} (${npc.id}) has respawned`);
};

// Handle player death
const handlePlayerDeath = (io: Server, socket: ExtendedSocket, player: Player): void => {
  console.log(`[${socket.id}] Player ${player.name} has died`);
  
  // Reset combat state
  player.inCombat = false;
  
  // Send death message
  socket.emit('chatMessage', {
    content: `You have died! Respawning at Lumbridge...`, 
    type: 'system',
    timestamp: Date.now()
  });
  
  // Teleport player to spawn
  player.x = 0;
  player.y = 0;
  player.z = 0;
  
  // Reset health
  player.health = player.maxHealth;
  
  // Notify client of death and teleport
  socket.emit('playerDeath', {
    respawnPosition: { x: player.x, y: player.y, z: player.z }
  });
  
  // Send updated position to all clients
  io.emit('playerMove', {
    id: socket.id,
    x: player.x,
    y: player.y,
    z: player.z,
    timestamp: Date.now()
  });
  
  // Update player health
  socket.emit('updatePlayerHealth', {
    current: player.health,
    max: player.maxHealth
  });
  
  // Send respawn message after a short delay
  setTimeout(() => {
    socket.emit('chatMessage', {
      content: `You have respawned in Lumbridge with full health.`, 
      type: 'system',
      timestamp: Date.now()
    });
  }, 1000);
};

// Export functions as ES modules
export { setupSocketHandlers, initializeGameState, broadcastPlayerCount };

// Add function to get the players object
export const getPlayers = () => players; 