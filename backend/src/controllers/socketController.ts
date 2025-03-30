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
  console.log(`Broadcasting player count: ${count} to all clients`);
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
  } catch (error) {
    console.error('Failed to initialize game state:', error instanceof Error ? error : new Error(String(error)));
  }
};

// Setup all socket handlers
const setupSocketHandlers = (io: Server, socket?: ExtendedSocket): void => {
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
  console.log(`New connection: ${socket.id}`);
  
  try {
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
    
    // Flag to track if this player has a valid position (to prevent automatic position broadcasts)
    const hasDefaultPosition = isDefaultPosition(newPlayer.x, newPlayer.y, newPlayer.z);
    
    // Only broadcast the new player if they don't have the default position
    // This prevents unnecessary position updates for new or reconnected players
    if (!hasDefaultPosition) {
      // Tell all other clients about the new player
      socket.broadcast.emit('playerJoined', newPlayer);
      console.log(`Broadcasting new player ${newPlayer.name} (${socket.id}) to other players`);
    } else {
      console.log(`Player ${newPlayer.name} (${socket.id}) has default position (0,1,0), skipping initial broadcast`);
      // We'll broadcast when they move to a valid position
      
      // Don't send playerMove events until the client sends a valid position
      console.log(`Waiting for client ${socket.id} to send a valid position before broadcasting`);
    }
    
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

    // Handle player movement
    socket.on('playerMove', async (position: PlayerPosition) => {
      // Add even more detailed logging with different style to easily see in console
      console.log(`\n============= SERVER RECEIVED PLAYER MOVE =============`);
      console.log(`Player ${socket.id} moved:`, {
        position,
        rotation: position.rotation?.toFixed(2) || 'undefined',
        timestamp: position.timestamp ? new Date(position.timestamp).toLocaleTimeString() : 'undefined',
        username: players[socket.id]?.name || 'Unknown',
        totalPlayers: Object.keys(players).length,
        otherPlayerIds: Object.keys(players).filter(id => id !== socket.id),
        // Additional debug info
        keyCount: Object.keys(position).length,
        positionKeys: Object.keys(position),
        positionType: typeof position
      });
      
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
        // Ensure position is within world boundaries
        const validX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, position.x));
        const validZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, position.z));
        
        // Update player position with validated coordinates
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
        
        console.log(`\n!!!!!!!!!! BROADCASTING PLAYER MOVED EVENT !!!!!!!!!!!!`);
        console.log(`Broadcasting from ${socket.id} to ${Object.keys(players).filter(id => id !== socket.id).length} players`, {
          targetPlayers: Object.keys(players).filter(id => id !== socket.id).length,
          event: moveEvent
        });
        
        // Debug this broadcast to ensure it's working
        try {
          // Broadcast to all EXCEPT the current socket
          socket.broadcast.emit('playerMoved', moveEvent);
          
          // For debugging purposes, log info about who we're sending it to
          const otherPlayerIds = Object.keys(players).filter(id => id !== socket.id);
          if (otherPlayerIds.length > 0) {
            console.log(`Broadcasting movement to ${otherPlayerIds.length} players:`, otherPlayerIds);
          } else {
            console.log('No other players to broadcast movement to');
          }
          
          // Every 10th movement, proactively sync player list to ensure all clients have the same data
          const movementCount = socket.data.movementCount || 0;
          socket.data.movementCount = movementCount + 1;
          
          if (movementCount % 10 === 0) {
            console.log('Proactively syncing player list to ensure consistency');
            
            // Get all players except the current player
            const otherPlayers = Object.values(players).filter(p => p.id !== socket.id);
            
            // First check if the client even knows about all players
            socket.emit('checkPlayersSync', otherPlayers.map(p => p.id), (missingPlayerIds: string[]) => {
              if (missingPlayerIds && missingPlayerIds.length > 0) {
                console.log(`Client ${socket.id} is missing ${missingPlayerIds.length} players:`, missingPlayerIds);
                
                // Send the missing players one by one
                missingPlayerIds.forEach(playerId => {
                  const player = players[playerId];
                  if (player) {
                    console.log(`Sending missing player ${playerId} to ${socket.id}`);
                    socket.emit('playerJoined', player);
                  }
                });
              }
            });
          }
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
      console.log(`Player ${socket.id} requested data for player ${playerId}`);
      
      // Find the requested player
      const player = players[playerId];
      
      if (player) {
        console.log(`Returning player data for ${playerId}`);
        callback(player);
      } else {
        console.log(`Player ${playerId} not found`);
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
      console.log(`[DEBUG] handleItemPickup called with dropId: ${dropId} (type: ${typeof dropId})`);
      
      const player = players[socket.id];
      if (!player) {
        console.error(`[ERROR] Player not found for socket ID: ${socket.id}`);
        return;
      }
      
      console.log(`Player position: (${player.x}, ${player.y}, ${player.z})`);
      console.log(`Number of world items: ${worldItems.length}`);
      
      const itemIndex = worldItems.findIndex(item => item.dropId === dropId);
      console.log(`Item index in world items: ${itemIndex}`);
      
      if (itemIndex !== -1) {
        const worldItem = worldItems[itemIndex];
        console.log(`Found world item: ${worldItem.itemType} at (${worldItem.x}, ${worldItem.y}, ${worldItem.z})`);
        
        // Calculate distance to item
        const distance = Math.sqrt(
          Math.pow(player.x - worldItem.x, 2) +
          Math.pow(player.y - worldItem.y, 2) +
          Math.pow(player.z - worldItem.z, 2)
        );
        console.log(`Distance to item: ${distance} (max allowed: 2)`);
        
        // Check if player is close enough to pick up the item
        if (distance <= 2) {
          console.log(`Player is close enough to pick up the item`);
          
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
          console.log(`Added item to player's inventory: ${newItem.id} (${newItem.type})`);
          
          // Remove from world items array
          worldItems.splice(itemIndex, 1);
          console.log(`Removed item from world items array`);
          
          // Tell all clients about the removed world item
          io.emit('worldItemRemoved', dropId);
          console.log(`Emitted worldItemRemoved event for all clients with dropId: ${dropId}`);
          
          // Update client's inventory
          socket.emit('inventoryUpdate', player.inventory);
          console.log(`Emitted inventoryUpdate event for player with ${player.inventory.length} items`);
          
          // Save to database
          try {
            // Save updated inventory
            if (socket.user && socket.user.id) {
              await savePlayerInventory(socket.user.id, player.inventory);
              console.log(`Saved player inventory to database for user: ${socket.user.id}`);
            }
            
            // Remove the item from the world in database
            await removeWorldItem(dropId);
            console.log(`Removed item from database: ${dropId}`);
          } catch (error) {
            console.error('Failed to save pickup to database:', error instanceof Error ? error : new Error(String(error)));
          }
        } else {
          console.log(`Player is too far to pick up the item (${distance} > 2)`);
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
        console.log(`[${socket.id}] Received dropItem event in socketController:`, data);
        
        // Validate input
        const player = players[socket.id];
        if (!player) {
          console.error(`[${socket.id}] Player not found in dropItem handler`);
          return;
        }
        
        // Get the itemId - support both formats
        const itemId = data.itemId || data.id;
        if (!itemId) {
          console.error(`[${socket.id}] No itemId or id provided in dropItem event`, data);
          return;
        }
        
        console.log(`[${socket.id}] Looking for item ${itemId} in inventory:`, player.inventory);
        
        if (!player.inventory) {
          console.error(`[${socket.id}] Player inventory is missing`);
          return;
        }
        
        const itemIndex = player.inventory.findIndex(i => i.id === itemId);
        if (itemIndex === -1) {
          console.error(`[${socket.id}] Item ${itemId} not found in player's inventory`);
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
        
        // Add to world items
        const worldItem: WorldItem = {
          dropId: dropId,
          itemType: droppedItem.type,
          x,
          y,
          z,
          droppedBy: socket.id
        };
        
        worldItems.push(worldItem);
        
        console.log(`[${socket.id}] Created world item at position (${x}, ${y}, ${z}):`, worldItem);
        
        // Tell all clients about the new world item (broadcast BOTH event types for compatibility)
        io.emit('worldItemAdded', worldItem);
        io.emit('itemDropped', worldItem);
        
        console.log(`[${socket.id}] Broadcasted item drop to ALL clients`);
        
        // Update client's inventory
        socket.emit('inventoryUpdate', player.inventory);
        console.log(`[${socket.id}] Sent updated inventory to client`);
        
        // Save to database
        try {
          // Save updated inventory to database
          if (socket.user && socket.user.id) {
            await savePlayerInventory(socket.user.id, player.inventory);
            console.log(`[${socket.id}] Saved inventory to database for user ${socket.user.id}`);
          }
          
          // Add the item to the world in database
          await dropItemInWorld(dropId, droppedItem.type, x, y, z);
          console.log(`[${socket.id}] Saved world item to database`);
        } catch (error) {
          console.error(`[${socket.id}] Failed to save data to database:`, error instanceof Error ? error : new Error(String(error)));
        }
      } catch (error) {
        console.error(`[${socket.id}] Error in dropItem handler:`, error instanceof Error ? error : new Error(String(error)));
        socket.emit('error', 'Failed to drop item. Please try again.');
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
  } catch (error) {
    console.error(`Error in handleSingleConnection for ${socket.id}:`, error);
    socket.disconnect();
  }
};

// Export functions as ES modules
export { setupSocketHandlers, initializeGameState, broadcastPlayerCount };

// Add function to get the players object
export const getPlayers = () => players; 