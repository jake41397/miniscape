import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { Socket as NetSocket } from 'net';
import { createClient } from '@supabase/supabase-js';
import { Player, Item, ItemType } from '../../types/player';

// Initialize Supabase
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabase = createClient(supabaseUrl, supabaseServiceKey);

interface SocketServer extends HTTPServer {
  io?: SocketIOServer | null;
}

interface SocketWithIO extends NetSocket {
  server: SocketServer;
}

interface NextApiResponseWithSocket extends NextApiResponse {
  socket: SocketWithIO;
}

// Interface for world items that have been dropped
interface WorldItem {
  dropId: string;
  itemType: string;
  x: number;
  y: number;
  z: number;
}

// Interface for resource nodes in the world
interface ResourceNode {
  id: string;
  type: 'tree' | 'rock' | 'fish';
  x: number;
  y: number;
  z: number;
  respawnTime: number;
}

// Define world boundaries
const WORLD_BOUNDS = {
  minX: -50,
  maxX: 50,
  minZ: -50,
  maxZ: 50
};

// Main socket handling
const socket = async (req: NextApiRequest, res: NextApiResponseWithSocket) => {
  // Skip if socket is already initialized
  if (res.socket.server.io) {
    console.log('Socket is already running');
    res.end();
    return;
  }

  console.log('Setting up socket');
  
  // Create a new Socket.IO server
  const io = new SocketIOServer(res.socket.server, {
    path: '/api/socket',
    addTrailingSlash: false,
  });
  res.socket.server.io = io;

  // Store connected players
  const players: Record<string, Player> = {};
  
  // Store world items (dropped by players) - these will be loaded from DB
  let worldItems: WorldItem[] = [];
  
  // Store resource nodes - these will be loaded from DB
  let resourceNodes: ResourceNode[] = [];

  // Load world items from DB
  try {
    const { data: dbWorldItems, error } = await supabase
      .from('world_items')
      .select('*');
    
    if (error) {
      console.error('Error loading world items:', error);
    } else if (dbWorldItems) {
      worldItems = dbWorldItems.map(item => ({
        dropId: item.id,
        itemType: item.item_type,
        x: item.x,
        y: item.y,
        z: item.z
      }));
      console.log(`Loaded ${worldItems.length} world items from database`);
    }
  } catch (err) {
    console.error('Failed to load world items:', err);
  }

  // Load resource nodes from DB
  try {
    const { data: dbResourceNodes, error } = await supabase
      .from('resource_nodes')
      .select('*');
    
    if (error) {
      console.error('Error loading resource nodes:', error);
    } else if (dbResourceNodes) {
      resourceNodes = dbResourceNodes.map(node => ({
        id: node.id,
        type: node.node_type as 'tree' | 'rock' | 'fish',
        x: node.x,
        y: node.y,
        z: node.z,
        respawnTime: node.respawn_time
      }));
      console.log(`Loaded ${resourceNodes.length} resource nodes from database`);
    }
  } catch (err) {
    console.error('Failed to load resource nodes:', err);
  }

  // Socket event handlers
  io.on('connection', async (socket) => {
    console.log(`New connection: ${socket.id}`);
    
    // Require authentication token
    const token = socket.handshake.auth.token;
    if (!token) {
      console.log(`Socket ${socket.id} has no auth token, disconnecting`);
      socket.disconnect();
      return;
    }
    
    // Verify the token and get user data
    try {
      const { data: { user }, error } = await supabase.auth.getUser(token);
      
      if (error || !user) {
        console.log(`Invalid auth token from socket ${socket.id}, disconnecting`);
        socket.disconnect();
        return;
      }
      
      // Load player data from database
      const { data: playerData, error: playerError } = await supabase
        .from('player_data')
        .select('*')
        .eq('user_id', user.id)
        .single();
        
      if (playerError && playerError.code !== 'PGRST116') { // Not found
        console.error(`Error loading player data for ${user.id}:`, playerError);
        socket.disconnect();
        return;
      }
      
      // Get user profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', user.id)
        .single();
        
      if (profileError) {
        console.error(`Error loading profile for ${user.id}:`, profileError);
        socket.disconnect();
        return;
      }
      
      // Create player object
      const newPlayer: Player = {
        id: socket.id,
        userId: user.id,
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
    } catch (authError) {
      console.error(`Authentication error for socket ${socket.id}:`, authError);
      socket.disconnect();
      return;
    }
    
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
            if (players[socket.id].userId) {
              await supabase
                .from('player_data')
                .update({ 
                  x: validX, 
                  y: position.y, 
                  z: validZ,
                  updated_at: new Date().toISOString()
                })
                .eq('user_id', players[socket.id].userId);
            }
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
        let itemType: ItemType;
        switch (resource.type) {
          case 'tree':
            itemType = ItemType.LOG;
            break;
          case 'rock':
            itemType = ItemType.COAL;
            break;
          case 'fish':
            itemType = ItemType.FISH;
            break;
          default:
            itemType = ItemType.LOG; // Default fallback
        }
        
        // Create a new item
        const newItem: Item = {
          id: `${itemType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
          type: itemType,
          count: 1
        };
        
        // Add item to player's inventory
        if (!players[socket.id].inventory) {
          players[socket.id].inventory = [];
        }
        
        players[socket.id].inventory!.push(newItem);
        
        // Send updated inventory to the player
        socket.emit('inventoryUpdate', players[socket.id].inventory);
        
        // Update inventory in database
        try {
          if (players[socket.id].userId) {
            await supabase
              .from('player_data')
              .update({ 
                inventory: JSON.stringify(players[socket.id].inventory),
                updated_at: new Date().toISOString()
              })
              .eq('user_id', players[socket.id].userId);
          }
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
          const worldItem: WorldItem = {
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
            if (player.userId) {
              await supabase
                .from('player_data')
                .update({
                  inventory: JSON.stringify(player.inventory),
                  updated_at: new Date().toISOString()
                })
                .eq('user_id', player.userId);
            
              // Add world item
              await supabase
                .from('world_items')
                .insert({
                  id: worldItem.dropId,
                  item_type: worldItem.itemType,
                  x: worldItem.x,
                  y: worldItem.y,
                  z: worldItem.z
                });
            }
          } catch (error) {
            console.error('Failed to save dropped item to DB:', error);
          }
        }
      }
    });
    
    // Handle item pickup
    socket.on('pickup', async (dropId) => {
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
          const newItem: Item = {
            id: `${worldItem.itemType}-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
            type: worldItem.itemType as ItemType,
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
            await supabase
              .from('world_items')
              .delete()
              .eq('id', dropId);
              
            // Update inventory
            if (player.userId) {
              await supabase
                .from('player_data')
                .update({
                  inventory: JSON.stringify(player.inventory),
                  updated_at: new Date().toISOString()
                })
                .eq('user_id', player.userId);
            }
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
          await supabase
            .from('player_data')
            .update({
              x: player.x,
              y: player.y,
              z: player.z,
              inventory: JSON.stringify(player.inventory || []),
              updated_at: new Date().toISOString()
            })
            .eq('user_id', player.userId);
        }
      } catch (error) {
        console.error('Failed to save player state on disconnect:', error);
      }
      
      // Remove player from our players object
      delete players[socket.id];
      
      // Tell everyone this player left
      io.emit('playerLeft', socket.id);
    });
  });

  res.end();
};

// Disable the bodyParser for this route
export const config = {
  api: {
    bodyParser: false,
  },
};

export default socket; 