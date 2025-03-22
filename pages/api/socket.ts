import { Server as SocketIOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';
import type { NextApiRequest, NextApiResponse } from 'next';
import type { Socket as NetSocket } from 'net';
import { Player, Item, ItemType } from '../../types/player';

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
  
  // Store world items (dropped by players)
  const worldItems: WorldItem[] = [];
  
  // Create some resource nodes
  const resourceNodes: ResourceNode[] = [
    // Trees in Lumbridge area
    { id: 'tree-1', type: 'tree', x: 10, y: 1, z: 10 },
    { id: 'tree-2', type: 'tree', x: 15, y: 1, z: 15 },
    { id: 'tree-3', type: 'tree', x: 20, y: 1, z: 10 },
    
    // Rocks in Barbarian Village
    { id: 'rock-1', type: 'rock', x: -20, y: 1, z: -20 },
    { id: 'rock-2', type: 'rock', x: -25, y: 1, z: -15 },
    
    // Fishing spots
    { id: 'fish-1', type: 'fish', x: 30, y: 1, z: -30 },
  ];

  // Socket event handlers
  io.on('connection', (socket) => {
    console.log(`New connection: ${socket.id}`);
    
    // Create placeholder player
    const newPlayer: Player = {
      id: socket.id,
      name: `Player${socket.id.substring(0, 4)}`,
      // Set initial position within valid bounds
      x: Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, 0)),
      y: 1, // Standing on ground
      z: Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, 0)),
      inventory: [] // Initialize with empty inventory
    };
    
    // Store the player in our players object
    players[socket.id] = newPlayer;
    
    // Tell all other clients about the new player
    socket.broadcast.emit('playerJoined', newPlayer);
    
    // Send the new player the list of existing players
    const existingPlayers = Object.values(players).filter(p => p.id !== socket.id);
    socket.emit('initPlayers', existingPlayers);
    
    // Send initial inventory (empty for new player)
    socket.emit('inventoryUpdate', players[socket.id].inventory || []);
    
    // Handle player movement
    socket.on('playerMove', (position) => {
      // Update player position in server state
      if (players[socket.id]) {
        // Ensure position is within world boundaries
        const validX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, position.x));
        const validZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, position.z));
        
        // Calculate distance from previous position to detect anomalous movement
        const prevPos = players[socket.id];
        const moveDistance = Math.sqrt(
          Math.pow(validX - prevPos.x, 2) + 
          Math.pow(validZ - prevPos.z, 2)
        );
        
        // If distance is suspiciously large, apply a sanity check
        const SUSPICIOUS_DISTANCE = 10; // Units
        let finalX = validX;
        let finalZ = validZ;
        
        if (moveDistance > SUSPICIOUS_DISTANCE) {
          console.warn(`Large movement detected for player ${socket.id}: ${moveDistance.toFixed(2)} units`);
          
          // Calculate direction vector
          const dirX = moveDistance > 0 ? (validX - prevPos.x) / moveDistance : 0;
          const dirZ = moveDistance > 0 ? (validZ - prevPos.z) / moveDistance : 0;
          
          // Limit movement to a reasonable distance
          finalX = prevPos.x + (dirX * SUSPICIOUS_DISTANCE);
          finalZ = prevPos.z + (dirZ * SUSPICIOUS_DISTANCE);
          
          // Re-apply boundary constraints
          finalX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, finalX));
          finalZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, finalZ));
        }
        
        // Update player position with validated coordinates
        players[socket.id].x = finalX;
        players[socket.id].y = position.y;
        players[socket.id].z = finalZ;
        
        // Broadcast new position to all other clients
        socket.broadcast.emit('playerMoved', {
          id: socket.id,
          x: finalX,
          y: position.y,
          z: finalZ
        });
      }
    });
    
    // Handle chat messages
    socket.on('chat', (text) => {
      const playerName = players[socket.id]?.name || 'Unknown';
      io.emit('chatMessage', { name: playerName, text });
    });
    
    // Custom join with name
    socket.on('join', (name) => {
      if (players[socket.id]) {
        players[socket.id].name = name;
        // Inform others of name change
        socket.broadcast.emit('playerJoined', players[socket.id]);
      }
    });
    
    // Handle resource gathering
    socket.on('gather', (resourceId) => {
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
      }
    });
    
    // Handle item dropping
    socket.on('dropItem', (item) => {
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
        }
      }
    });
    
    // Handle item pickup
    socket.on('pickup', (dropId) => {
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
        }
      }
    });
    
    // Handle player disconnection
    socket.on('disconnect', () => {
      console.log(`Player disconnected: ${socket.id}`);
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