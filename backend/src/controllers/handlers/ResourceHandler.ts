import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { loadResourceNodes, savePlayerInventory } from '../../models/gameModel';
import { ExtendedSocket, PlayersStore, ResourceNode } from '../types';

export class ResourceHandler {
  private io: Server;
  private players: PlayersStore;
  private resourceNodes: ResourceNode[] = [];
  private unavailableResources: Map<string, number> = new Map();
  
  constructor(io: Server, players: PlayersStore) {
    this.io = io;
    this.players = players;
  }
  
  /**
   * Initialize resource nodes
   */
  public async initialize(): Promise<void> {
    try {
      // Load resource nodes from database
      this.resourceNodes = await loadResourceNodes();
      console.log(`Loaded ${this.resourceNodes.length} resource nodes from database`);
    } catch (error) {
      console.error('Failed to initialize resource nodes:', error);
      // Initialize with some default resources if database load fails
      this.initializeDefaultResources();
    }
  }
  
  /**
   * Send resource nodes to a specific socket
   */
  public sendResourceNodes(socket: ExtendedSocket): void {
    socket.emit('initResourceNodes', this.resourceNodes);
  }
  
  /**
   * Set up resource interaction listener
   */
  public setupResourceInteractionHandler(socket: ExtendedSocket): void {
    socket.on('interactWithResource', async (data: { resourceId: string }) => {
      if (!this.players[socket.id]) return;
      
      const { resourceId } = data;
      const player = this.players[socket.id];
      
      // Check if resource exists
      const resourceNode = this.resourceNodes.find(node => node.id === resourceId);
      if (!resourceNode) {
        console.log(`Player ${socket.id} attempted to interact with non-existent resource: ${resourceId}`);
        return;
      }
      
      // Check if resource is available
      if (this.unavailableResources.has(resourceId)) {
        console.log(`Resource ${resourceId} is not available yet`);
        socket.emit('resourceUnavailable', { resourceId });
        return;
      }
      
      try {
        // Handle resource interaction based on type
        switch (resourceNode.type) {
          case 'tree':
            await this.handleTreeInteraction(socket, resourceNode);
            break;
          case 'rock':
            await this.handleRockInteraction(socket, resourceNode);
            break;
          case 'fish':
            await this.handleFishInteraction(socket, resourceNode);
            break;
          default:
            console.log(`Unknown resource type: ${resourceNode.type}`);
            break;
        }
      } catch (error) {
        console.error(`Error handling resource interaction:`, error);
      }
    });
  }
  
  /**
   * Handle tree interaction (woodcutting)
   */
  private async handleTreeInteraction(socket: ExtendedSocket, resourceNode: ResourceNode): Promise<void> {
    const player = this.players[socket.id];
    
    // Make tree unavailable
    this.makeResourceUnavailable(resourceNode.id, resourceNode.respawnTime || 10000);
    
    // Generate logs
    const logCount = Math.floor(Math.random() * 2) + 1; // 1-2 logs
    const logs = {
      id: uuidv4(),
      type: 'log',
      quantity: logCount
    };
    
    // Add logs to player inventory
    player.inventory.push(logs);
    
    // Save inventory to database
    if (socket.user && socket.user.id) {
      await savePlayerInventory(socket.user.id, player.inventory);
    }
    
    // Send success message
    socket.emit('resourceGathered', {
      resourceId: resourceNode.id,
      resourceType: 'tree',
      item: logs
    });
    
    // Update inventory
    socket.emit('inventoryUpdate', player.inventory);
  }
  
  /**
   * Handle rock interaction (mining)
   */
  private async handleRockInteraction(socket: ExtendedSocket, resourceNode: ResourceNode): Promise<void> {
    const player = this.players[socket.id];
    
    // Make rock unavailable
    this.makeResourceUnavailable(resourceNode.id, resourceNode.respawnTime || 15000);
    
    // Generate ore
    const oreCount = 1;
    const ore = {
      id: uuidv4(),
      type: 'ore',
      quantity: oreCount
    };
    
    // Add ore to player inventory
    player.inventory.push(ore);
    
    // Save inventory to database
    if (socket.user && socket.user.id) {
      await savePlayerInventory(socket.user.id, player.inventory);
    }
    
    // Send success message
    socket.emit('resourceGathered', {
      resourceId: resourceNode.id,
      resourceType: 'rock',
      item: ore
    });
    
    // Update inventory
    socket.emit('inventoryUpdate', player.inventory);
  }
  
  /**
   * Handle fish interaction (fishing)
   */
  private async handleFishInteraction(socket: ExtendedSocket, resourceNode: ResourceNode): Promise<void> {
    const player = this.players[socket.id];
    
    // Make fishing spot unavailable
    this.makeResourceUnavailable(resourceNode.id, resourceNode.respawnTime || 5000);
    
    // Generate fish
    const fishCount = 1;
    const fish = {
      id: uuidv4(),
      type: 'fish',
      quantity: fishCount
    };
    
    // Add fish to player inventory
    player.inventory.push(fish);
    
    // Save inventory to database
    if (socket.user && socket.user.id) {
      await savePlayerInventory(socket.user.id, player.inventory);
    }
    
    // Send success message
    socket.emit('resourceGathered', {
      resourceId: resourceNode.id,
      resourceType: 'fish',
      item: fish
    });
    
    // Update inventory
    socket.emit('inventoryUpdate', player.inventory);
  }
  
  /**
   * Make a resource temporarily unavailable
   */
  private makeResourceUnavailable(resourceId: string, respawnTime: number): void {
    // Mark resource as unavailable
    this.unavailableResources.set(resourceId, Date.now() + respawnTime);
    
    // Broadcast resource state change
    this.io.emit('resourceStateChanged', {
      resourceId,
      available: false
    });
    
    // Set timer to make resource available again
    setTimeout(() => {
      // Remove from unavailable resources
      this.unavailableResources.delete(resourceId);
      
      // Broadcast resource state change
      this.io.emit('resourceStateChanged', {
        resourceId,
        available: true
      });
    }, respawnTime);
  }
  
  /**
   * Initialize default resources if database load fails
   */
  private initializeDefaultResources(): void {
    // Create some default resources
    this.resourceNodes = [
      {
        id: 'tree-1',
        type: 'tree',
        x: 10,
        y: 0,
        z: 10,
        respawnTime: 10000 // 10 seconds
      },
      {
        id: 'tree-2',
        type: 'tree',
        x: 15,
        y: 0,
        z: 15,
        respawnTime: 10000
      },
      {
        id: 'rock-1',
        type: 'rock',
        x: -10,
        y: 0,
        z: -10,
        respawnTime: 15000 // 15 seconds
      },
      {
        id: 'fish-1',
        type: 'fish',
        x: 20,
        y: 0,
        z: -20,
        respawnTime: 5000 // 5 seconds
      }
    ];
    
    console.log(`Initialized ${this.resourceNodes.length} default resource nodes`);
  }
}

export default ResourceHandler; 