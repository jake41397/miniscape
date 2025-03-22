const supabase = require('../config/supabase');
const { verifySocketToken } = require('../middleware/authMiddleware');
const { 
  loadWorldItems, 
  loadResourceNodes,
  savePlayerPosition,
  savePlayerInventory,
  dropItemInWorld,
  removeWorldItem
} = require('../models/gameModel');

// Define world boundaries
const WORLD_BOUNDS = {
  minX: -50,
  maxX: 50,
  minZ: -50,
  maxZ: 50
};

// Store connected players
const players = {};

// Store world items and resource nodes
let worldItems = [];
let resourceNodes = [];

// Initialize game state by loading data from the database
const initializeGameState = async () => {
  try {
    // Load world items
    worldItems = await loadWorldItems();
    console.log(`Loaded ${worldItems.length} world items from database`);
    
    // Load resource nodes
    resourceNodes = await loadResourceNodes();
    console.log(`Loaded ${resourceNodes.length} resource nodes from database`);
  } catch (error) {
    console.error('Failed to initialize game state:', error);
  }
};

// Setup all socket handlers
const setupSocketHandlers = (io, socket) => {
  // If socket is provided, we're handling a single connection
  if (socket) {
    handleSingleConnection(io, socket);
    return;
  }
  
  // Apply the socket authentication middleware
  io.use(verifySocketToken);
  
  // Handle socket connections
  io.on('connection', async (socket) => {
    handleSingleConnection(io, socket);
  });
};

// Handle a single socket connection
const handleSingleConnection = async (io, socket) => {
  console.log(`New connection: ${socket.id}`);
  
  try {
    // Load player data from database
    const { data: playerData, error: playerError } = await supabase
      .from('player_data')
      .select('*')
      .eq('user_id', socket.user.id)
      .single();
      
    if (playerError && playerError.code !== 'PGRST116') { // Not found
      console.error(`Error loading player data for ${socket.user.id}:`, playerError);
      socket.disconnect();
      return;
    }
    
    // Get user profile
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', socket.user.id)
      .single();
      
    if (profileError) {
      console.error(`Error loading profile for ${socket.user.id}:`, profileError);
      socket.disconnect();
      return;
    }
    
    // Create player object
    const newPlayer = {
      id: socket.id,
      userId: socket.user.id,
      name: profile.username,
      x: playerData ? playerData.x : 0,
      y: playerData ? playerData.y : 1,
      z: playerData ? playerData.z : 0,
      inventory: playerData ? JSON.parse(playerData.inventory) : []
    };
    
    // Store the player in our players object
    players[socket.id] = newPlayer;
    
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
    socket.on('playerMove', async (position) => {
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
            await savePlayerPosition(socket.user.id, validX, position.y, validZ);
          } catch (error) {
            console.error('Failed to update player position in DB:', error);
          }
        }
      }
    });
    
    // Handle chat messages
    socket.on('chat', (text) => {
      const playerName = players[socket.id]?.name || 'Unknown';
      io.emit('chatMessage', { name: playerName, text });
    });
    
    // Handle resource gathering
    socket.on('gather', async (resourceId) => {
      // Find the resource node
      const resource = resourceNodes.find(node => node.id === resourceId);
      
      if (resource) {
        // Determine the item to give based on resource type
        let itemType;
        switch (resource.type) {
          case 'tree':
            itemType = 'log';
            break;
          case 'rock':
            itemType = 'coal';
            break;
          case 'fish':
            itemType = 'fish';
            break;
          default:
            itemType = 'log'; // Default fallback
        }
        
        // Create a new item
        const newItem = {
          id: `${itemType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          type: itemType,
          count: 1
        };
        
        // Add item to player's inventory
        if (!players[socket.id].inventory) {
          players[socket.id].inventory = [];
        }
        
        players[socket.id].inventory.push(newItem);
        
        // Send updated inventory to the player
        socket.emit('inventoryUpdate', players[socket.id].inventory);
        
        // Update inventory in database
        try {
          await savePlayerInventory(socket.user.id, players[socket.id].inventory);
        } catch (error) {
          console.error('Failed to update inventory in DB:', error);
        }
      }
    });
    
    // Handle item dropping
    socket.on('dropItem', async (item) => {
      const { itemId, itemType } = item;
      const player = players[socket.id];
      
      if (player && player.inventory) {
        // Find the item in player's inventory
        const itemIndex = player.inventory.findIndex(i => i.id === itemId);
        
        if (itemIndex !== -1) {
          // Remove the item from inventory
          const droppedItem = player.inventory.splice(itemIndex, 1)[0];
          
          // Create a world item at player's position
          const worldItem = {
            dropId: `drop-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            itemType: droppedItem.type,
            x: player.x,
            y: player.y,
            z: player.z
          };
          
          // Add to world items
          worldItems.push(worldItem);
          
          // Update player's inventory
          socket.emit('inventoryUpdate', player.inventory);
          
          // Broadcast the dropped item to all clients
          io.emit('itemDropped', worldItem);
          
          // Save to database
          try {
            // Update inventory in player_data
            await savePlayerInventory(socket.user.id, player.inventory);
            
            // Add world item
            await dropItemInWorld(worldItem.dropId, worldItem.itemType, worldItem.x, worldItem.y, worldItem.z);
          } catch (error) {
            console.error('Failed to save dropped item to DB:', error);
          }
        }
      }
    });
    
    // Handle item pickup
    socket.on('pickupItem', async (dropId) => {
      const player = players[socket.id];
      const itemIndex = worldItems.findIndex(item => item.dropId === dropId);
      
      if (itemIndex !== -1 && player) {
        const worldItem = worldItems[itemIndex];
        
        // Check if player is close enough to the item
        const distance = Math.sqrt(
          Math.pow(player.x - worldItem.x, 2) + 
          Math.pow(player.z - worldItem.z, 2)
        );
        
        if (distance <= 5) { // Within 5 units
          // Create inventory item
          const newItem = {
            id: `${worldItem.itemType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: worldItem.itemType,
            count: 1
          };
          
          // Add to player's inventory
          if (!player.inventory) {
            player.inventory = [];
          }
          player.inventory.push(newItem);
          
          // Remove from world items
          worldItems.splice(itemIndex, 1);
          
          // Update player's inventory
          socket.emit('inventoryUpdate', player.inventory);
          
          // Tell everyone the item is gone
          io.emit('itemRemoved', dropId);
          
          // Update database
          try {
            // Remove world item
            await removeWorldItem(dropId);
            
            // Update inventory
            await savePlayerInventory(socket.user.id, player.inventory);
          } catch (error) {
            console.error('Failed to update DB after item pickup:', error);
          }
        }
      }
    });
    
    // Handle player disconnection
    socket.on('disconnect', async () => {
      console.log(`Player disconnected: ${socket.id}`);
      
      // Save final player state to database
      try {
        const player = players[socket.id];
        if (player && player.userId) {
          await Promise.all([
            savePlayerPosition(socket.user.id, player.x, player.y, player.z),
            savePlayerInventory(socket.user.id, player.inventory || [])
          ]);
        }
      } catch (error) {
        console.error('Failed to save player state on disconnect:', error);
      }
      
      // Remove player from our players object
      delete players[socket.id];
      
      // Tell everyone this player left
      io.emit('playerLeft', socket.id);
    });
  } catch (error) {
    console.error(`Error handling socket connection for ${socket.id}:`, error);
    socket.disconnect();
  }
};

module.exports = { setupSocketHandlers, initializeGameState }; 