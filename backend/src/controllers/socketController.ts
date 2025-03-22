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
    [key: string]: any;
  };
}

interface PlayerPosition {
  x: number;
  y: number;
  z: number;
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

// Store world items and resource nodes
let worldItems: WorldItem[] = [];
let resourceNodes: ResourceNode[] = [];

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
};

// Handle a single socket connection
const handleSingleConnection = async (io: Server, socket: ExtendedSocket): Promise<void> => {
  console.log(`New connection: ${socket.id}`);
  
  try {
    // Verify we have a valid user
    if (!socket.user || !socket.user.id) {
      console.error(`Socket ${socket.id} has no valid user object`);
      socket.disconnect();
      return;
    }
    
    console.log(`Socket ${socket.id} authenticated as user ${socket.user.id}`);
    
    // Load player data from database
    let { data: playerData, error: playerError } = await supabase
      .from('player_data')
      .select('*')
      .eq('user_id', socket.user.id)
      .single();
      
    // Handle case where player data doesn't exist
    if (playerError && playerError.code === 'PGRST116') {
      console.log(`No player data found for user ${socket.user.id}, creating default data`);
      
      // Create default player data
      const defaultPlayerData = {
        user_id: socket.user.id,
        x: 0,
        y: 1,
        z: 0,
        inventory: JSON.stringify([])
      };
      
      try {
        const { data: newPlayerData, error: createError } = await supabase
          .from('player_data')
          .insert(defaultPlayerData)
          .select()
          .single();
        
        if (createError) {
          console.error(`Failed to create player data for user ${socket.user.id}:`, createError);
          // Continue with in-memory data instead of disconnecting
          console.log('Using in-memory player data as fallback');
          playerData = defaultPlayerData;
        } else {
          playerData = newPlayerData;
          console.log(`Created default player data for user ${socket.user.id}`);
        }
      } catch (error) {
        console.error(`Exception creating player data for user ${socket.user.id}:`, error instanceof Error ? error : new Error(String(error)));
        // Use default data as fallback
        playerData = defaultPlayerData;
      }
    } else if (playerError) {
      console.error(`Error loading player data for ${socket.user.id}:`, playerError);
      // Use default data as fallback instead of disconnecting
      console.log('Using in-memory player data as fallback due to error');
      playerData = {
        user_id: socket.user.id,
        x: 0,
        y: 1,
        z: 0,
        inventory: '[]'
      };
    }
    
    // Get user profile
    let { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', socket.user.id)
      .single();
      
    // Handle case where profile doesn't exist
    if (profileError && profileError.code === 'PGRST116') {
      console.log(`No profile found for user ${socket.user.id}, creating default profile`);
      
      // Create a default profile
      const defaultUsername = `Player-${socket.id.substring(0, 4)}`;
      const defaultProfile = {
        user_id: socket.user.id,
        username: defaultUsername,
        created_at: new Date().toISOString()
      };
      
      try {
        const { data: newProfile, error: createError } = await supabase
          .from('profiles')
          .insert(defaultProfile)
          .select()
          .single();
        
        if (createError) {
          console.error(`Failed to create profile for user ${socket.user.id}:`, createError);
          // Continue with in-memory profile instead of disconnecting
          console.log('Using in-memory profile as fallback');
          profile = defaultProfile;
        } else {
          profile = newProfile;
          console.log(`Created default profile for user ${socket.user.id} with username ${defaultUsername}`);
        }
      } catch (error) {
        console.error(`Exception creating profile for user ${socket.user.id}:`, error instanceof Error ? error : new Error(String(error)));
        // Use default profile as fallback
        profile = defaultProfile;
      }
    } else if (profileError) {
      console.error(`Error loading profile for ${socket.user.id}:`, profileError);
      // Use a default profile as fallback instead of disconnecting
      console.log('Using in-memory profile as fallback due to error');
      profile = {
        user_id: socket.user.id,
        username: `Player-${socket.id.substring(0, 4)}`
      };
    }
    
    // Create player object
    const newPlayer: Player = {
      id: socket.id,
      userId: socket.user.id,
      name: profile?.username || `Player-${socket.id.substring(0, 4)}`,
      x: playerData?.x || 0,
      y: playerData?.y || 1,
      z: playerData?.z || 0,
      inventory: JSON.parse(playerData?.inventory || '[]')
    };
    
    // Store the player in our players object
    players[socket.id] = newPlayer;
    
    // Log connected players
    console.log(`Player ${newPlayer.name} (${socket.id}) added. Total players: ${Object.keys(players).length}`);
    console.log('Connected players:', Object.keys(players).map(id => `${players[id].name} (${id})`).join(', '));
    
    // Tell all other clients about the new player
    socket.broadcast.emit('playerJoined', newPlayer);
    
    // Send the new player the list of existing players
    const existingPlayers = Object.values(players).filter(p => p.id !== socket.id);
    socket.emit('initPlayers', existingPlayers);
    
    // Send world items
    socket.emit('initWorldItems', worldItems);
    
    // Send resource nodes
    socket.emit('initResourceNodes', resourceNodes);
    
    // Send inventory
    socket.emit('inventoryUpdate', newPlayer.inventory || []);
    
    // Handle player movement
    socket.on('playerMove', async (position: PlayerPosition) => {
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
        socket.broadcast.emit('playerMoved', {
          id: socket.id,
          x: validX,
          y: position.y,
          z: validZ
        });
        
        // Update position in database (throttled)
        // We don't want to update the database on every movement event
        // so we'll use a debounce mechanism with socket data
        const now = Date.now();
        const lastUpdate = socket.data.lastPositionUpdate || 0;
        if (now - lastUpdate > 5000) { // Update position every 5 seconds max
          socket.data.lastPositionUpdate = now;
          
          try {
            if (socket.user && socket.user.id) {
              await savePlayerPosition(socket.user.id, validX, position.y, validZ);
            }
          } catch (error) {
            console.error('Failed to update player position in DB:', error instanceof Error ? error : new Error(String(error)));
          }
        }
      }
    });
    
    // Handle chat messages
    socket.on('chat', (text: string) => {
      const playerName = players[socket.id]?.name || 'Unknown';
      io.emit('chat', {
        sender: playerName,
        text: text
      });
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
    
    // Handle item dropping
    socket.on('dropItem', async (item: {id: string}) => {
      // Validate input
      const player = players[socket.id];
      const itemId = item.id;
      
      if (player && player.inventory && itemId) {
        const itemIndex = player.inventory.findIndex(i => i.id === itemId);
        
        if (itemIndex !== -1) {
          // Get the item
          const droppedItem = player.inventory[itemIndex];
          
          // Remove from inventory (either reduce quantity or remove entirely)
          if (droppedItem.quantity > 1) {
            droppedItem.quantity -= 1;
          } else {
            player.inventory.splice(itemIndex, 1);
          }
          
          // Generate a unique ID for the world item
          const dropId = Math.random().toString(36).substr(2, 9);
          
          // Add to world items
          const worldItem: WorldItem = {
            dropId: dropId,
            itemType: droppedItem.type,
            x: player.x,
            y: player.y,
            z: player.z
          };
          
          worldItems.push(worldItem);
          
          // Tell all clients about the new world item
          io.emit('worldItemAdded', worldItem);
          
          // Update client's inventory
          socket.emit('inventoryUpdate', player.inventory);
          
          // Save to database
          try {
            // Save updated inventory to database
            if (socket.user && socket.user.id) {
              await savePlayerInventory(socket.user.id, player.inventory);
            }
            
            // Add the item to the world in database
            await dropItemInWorld(dropId, droppedItem.type, player.x, player.y, player.z);
          } catch (error) {
            console.error('Failed to save dropped item to database:', error instanceof Error ? error : new Error(String(error)));
          }
        }
      }
    });
    
    // Handle item pickup
    socket.on('pickupItem', async (dropId: string) => {
      const player = players[socket.id];
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
          socket.emit('error', 'Too far to pick up item');
        }
      }
    });
    
    // Handle player disconnection
    socket.on('disconnect', async () => {
      // Save player data before they disconnect
      const player = players[socket.id];
      if (player) {
        console.log(`Player ${player.name} (${socket.id}) disconnected`);
        
        try {
          // Save player position and inventory to database
          if (socket.user && socket.user.id) {
            // Only save if we have a user ID
            if (player.x !== undefined && player.y !== undefined && player.z !== undefined) {
              savePlayerPosition(socket.user.id, player.x, player.y, player.z).catch(err => {
                console.error('Error saving player position on disconnect:', err instanceof Error ? err : new Error(String(err)));
              });
              
              savePlayerInventory(socket.user.id, player.inventory || []).catch(err => {
                console.error('Error saving player inventory on disconnect:', err instanceof Error ? err : new Error(String(err)));
              });
            }
          }
        } catch (error) {
          console.error('Error during player disconnect save:', error instanceof Error ? error : new Error(String(error)));
        }
        
        // Remove player from our state
        delete players[socket.id];
        
        // Let other clients know the player left
        socket.broadcast.emit('playerLeft', socket.id);
        
        // Log the disconnection
        if (Object.keys(players).length > 0) {
          console.log('Remaining players:', Object.keys(players).map(id => `${players[id].name} (${id})`).join(', '));
        } else {
          console.log('No players remain connected');
        }
      }
    });
  } catch (error) {
    console.error(`Error in handleSingleConnection for ${socket.id}:`, error instanceof Error ? error : new Error(String(error)));
    socket.disconnect();
  }
};

// Export functions as ES modules
export { setupSocketHandlers, initializeGameState }; 