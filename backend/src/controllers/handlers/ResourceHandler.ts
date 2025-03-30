import { Server } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { loadResourceNodes, savePlayerInventory } from '../../models/gameModel';
import { ExtendedSocket, PlayersStore, ResourceNode } from '../types';

export class ResourceHandler {
  private io: Server;
  private players: PlayersStore;
  private resourceNodes: ResourceNode[] = [];
  private unavailableResources: Map<string, number> = new Map();
  private gatheringPlayers: Map<string, { resourceId: string, intervalId: NodeJS.Timeout }> = new Map();
  
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
      console.log('Attempting to load resource nodes from database...');
      this.resourceNodes = await loadResourceNodes();
      console.log(`Loaded ${this.resourceNodes.length} resource nodes from database:`, this.resourceNodes.map(node => node.id));
      
      // Display exact object structure for debugging
      if (this.resourceNodes.length > 0) {
        console.log('First resource node structure:', JSON.stringify(this.resourceNodes[0], null, 2));
      }
      
      // Initialize default resources if none were loaded from database
      if (this.resourceNodes.length === 0) {
        console.log('No resources found in database, initializing defaults');
        this.initializeDefaultResources();
        return;
      }
      
      // Set default values for the new properties if they're not set
      this.resourceNodes.forEach(node => {
        if (typeof node.remainingResources === 'undefined') {
          node.remainingResources = 5; // Default to 5 resources per node
        }
        if (typeof node.state === 'undefined') {
          node.state = 'normal'; // Default to normal state
        }
      });
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
   * Set up resource gathering with tools
   */
  public setupResourceGatheringHandler(socket: ExtendedSocket): void {
    socket.on('gatherWithTool', async (data: { resourceId: string, action: string }) => {
      if (!this.players[socket.id]) return;
      
      const { resourceId, action } = data;
      const player = this.players[socket.id];
      
      // Find the resource node
      const resourceNode = this.resourceNodes.find(node => node.id === resourceId);
      if (!resourceNode) {
        console.log(`Player ${socket.id} attempted to gather non-existent resource: ${resourceId}`);
        socket.emit('chatMessage', { 
          content: `Unable to find that resource.`, 
          type: 'system', 
          timestamp: Date.now() 
        });
        return;
      }
      
      // Check if resource is available
      if (this.unavailableResources.has(resourceId) || resourceNode.state === 'harvested') {
        console.log(`Resource ${resourceId} is not available yet`);
        socket.emit('resourceUnavailable', { resourceId });
        socket.emit('chatMessage', { 
          content: `This resource has been depleted. It will respawn shortly.`, 
          type: 'system', 
          timestamp: Date.now() 
        });
        return;
      }
      
      try {
        // Stop any existing gathering activity for this player
        this.stopGatheringForPlayer(socket.id);
        
        // Handle different resource types and actions
        if (resourceNode.type === 'tree' && action === 'chop') {
          // Check if player has an axe equipped or in inventory
          if (this.hasToolForAction(player, 'bronze_axe')) {
            // Send a message to the player's chat
            socket.emit('chatMessage', { 
              content: `You begin chopping the tree...`, 
              type: 'action', 
              timestamp: Date.now() 
            });
            
            // Start the gathering process
            this.startGathering(socket, resourceNode, 'chop');
          } else {
            socket.emit('error', 'You need an axe to chop down this tree');
            socket.emit('chatMessage', { 
              content: `You need an axe to chop down this tree.`, 
              type: 'system', 
              timestamp: Date.now() 
            });
          }
        } else if (resourceNode.type === 'rock' && action === 'mine') {
          // Check if player has a pickaxe equipped or in inventory
          if (this.hasToolForAction(player, 'bronze_pickaxe')) {
            // Send a message to the player's chat
            socket.emit('chatMessage', { 
              content: `You begin mining the rock...`, 
              type: 'action', 
              timestamp: Date.now() 
            });
            
            // Start the gathering process
            this.startGathering(socket, resourceNode, 'mine');
          } else {
            socket.emit('error', 'You need a pickaxe to mine this rock');
            socket.emit('chatMessage', { 
              content: `You need a pickaxe to mine this rock.`, 
              type: 'system', 
              timestamp: Date.now() 
            });
          }
        } else {
          console.log(`Invalid action ${action} for resource type ${resourceNode.type}`);
          socket.emit('error', 'Cannot perform this action on this resource');
          socket.emit('chatMessage', { 
            content: `You cannot perform that action on this resource.`, 
            type: 'system', 
            timestamp: Date.now() 
          });
        }
      } catch (error) {
        console.error('Error handling resource gathering with tool:', error);
        socket.emit('error', 'Failed to gather resource');
      }
    });
    
    // Stop gathering when player disconnects
    socket.on('disconnect', () => {
      this.stopGatheringForPlayer(socket.id);
    });
  }
  
  /**
   * Check if player has the required tool either equipped or in inventory
   */
  private hasToolForAction(player: any, toolType: string): boolean {
    // Check if the required tool is equipped
    if (player.equippedItem && player.equippedItem.type === toolType) {
      return true;
    }
    
    // Check if the required tool is in the inventory
    return player.inventory.some((item: any) => item.type === toolType);
  }
  
  /**
   * Start the gathering process for a player
   */
  private startGathering(socket: ExtendedSocket, resourceNode: ResourceNode, action: string): void {
    const playerId = socket.id;
    
    // Initialize remaining resources if not set
    if (resourceNode.remainingResources === undefined) {
      resourceNode.remainingResources = 5; // Default to 5 resources
    }
    
    // Set up an interval that checks for resource gathering every second
    const intervalId = setInterval(() => {
      // Check if player still exists and is still connected
      if (!this.players[playerId]) {
        this.stopGatheringForPlayer(playerId);
        return;
      }
      
      // Check if resource is still available
      if (this.unavailableResources.has(resourceNode.id) || resourceNode.state === 'harvested') {
        this.stopGatheringForPlayer(playerId);
        socket.emit('resourceUnavailable', { resourceId: resourceNode.id });
        socket.emit('chatMessage', { 
          content: `The ${resourceNode.type} has been depleted.`, 
          type: 'system', 
          timestamp: Date.now() 
        });
        return;
      }
      
      // 10% chance to gather a resource
      if (Math.random() < 0.1) {
        // Successfully gathered a resource
        console.log(`Player ${playerId} successfully gathered from ${resourceNode.type} (${resourceNode.id})`);
        
        // Handle resource gathering based on type
        if (resourceNode.type === 'tree') {
          this.handleTreeGathering(socket, resourceNode);
        } else if (resourceNode.type === 'rock') {
          this.handleRockGathering(socket, resourceNode);
        }
        
        // Decrement remaining resources
        resourceNode.remainingResources!--;
        
        // Check if resource is depleted
        if (resourceNode.remainingResources! <= 0) {
          // Resource is depleted, mark as harvested
          resourceNode.state = 'harvested';
          this.stopGatheringForPlayer(playerId);
          
          // Broadcast the resource state change to all players
          this.io.emit('resourceStateChanged', {
            resourceId: resourceNode.id,
            state: 'harvested',
            available: false
          });
          
          // Send message to the player's chat
          socket.emit('chatMessage', { 
            content: `You have depleted the ${resourceNode.type}.`, 
            type: 'system', 
            timestamp: Date.now() 
          });
          
          // Set timer for resource respawn (60 seconds)
          this.makeResourceUnavailable(resourceNode.id, 60000);
        }
      }
    }, 1000); // Check every second
    
    // Store this interval to be able to clear it later
    this.gatheringPlayers.set(playerId, { resourceId: resourceNode.id, intervalId });
    
    socket.emit('gatheringStarted', { resourceId: resourceNode.id, action });
  }
  
  /**
   * Stop gathering for a specific player
   */
  private stopGatheringForPlayer(playerId: string): void {
    const gatheringInfo = this.gatheringPlayers.get(playerId);
    if (gatheringInfo) {
      clearInterval(gatheringInfo.intervalId);
      this.gatheringPlayers.delete(playerId);
      console.log(`Stopped gathering for player ${playerId}`);
    }
  }
  
  /**
   * Handle tree gathering (get logs)
   */
  private async handleTreeGathering(socket: ExtendedSocket, resourceNode: ResourceNode): Promise<void> {
    const player = this.players[socket.id];
    
    // Generate logs (1 log per gathering)
    const logs = {
      id: uuidv4(),
      type: 'log',
      quantity: 1
    };
    
    // Add to player's inventory
    player.inventory.push(logs);
    
    // Send inventory update to client
    socket.emit('inventoryUpdate', player.inventory);
    
    // Emit resource gathered event
    socket.emit('resourceGathered', {
      resourceId: resourceNode.id,
      resourceType: resourceNode.type,
      item: logs,
      remainingResources: resourceNode.remainingResources
    });
    
    // Send success message to chat
    socket.emit('chatMessage', { 
      content: `You get some logs. (${resourceNode.remainingResources} left)`, 
      type: 'action', 
      timestamp: Date.now() 
    });
    
    console.log(`Player ${socket.id} gathered logs from ${resourceNode.id}`);
    
    // Save inventory update to database if user is authenticated
    if (socket.user && socket.user.id) {
      await savePlayerInventory(socket.user.id, player.inventory);
    }
  }
  
  /**
   * Handle rock gathering (get coal/ore)
   */
  private async handleRockGathering(socket: ExtendedSocket, resourceNode: ResourceNode): Promise<void> {
    const player = this.players[socket.id];
    
    // Generate coal (1 coal per gathering)
    const coal = {
      id: uuidv4(),
      type: 'coal',
      quantity: 1
    };
    
    // Add to player's inventory
    player.inventory.push(coal);
    
    // Send inventory update to client
    socket.emit('inventoryUpdate', player.inventory);
    
    // Emit resource gathered event
    socket.emit('resourceGathered', {
      resourceId: resourceNode.id,
      resourceType: resourceNode.type,
      item: coal,
      remainingResources: resourceNode.remainingResources
    });
    
    // Send success message to chat
    socket.emit('chatMessage', { 
      content: `You get some coal. (${resourceNode.remainingResources} left)`, 
      type: 'action', 
      timestamp: Date.now() 
    });
    
    console.log(`Player ${socket.id} gathered coal from ${resourceNode.id}`);
    
    // Save inventory update to database if user is authenticated
    if (socket.user && socket.user.id) {
      await savePlayerInventory(socket.user.id, player.inventory);
    }
  }
  
  /**
   * Handle tree interaction (woodcutting)
   */
  private async handleTreeInteraction(socket: ExtendedSocket, resourceNode: ResourceNode): Promise<void> {
    // This is the old immediate resource gathering method.
    // It's now kept as a fallback but should be less used in favor of the new gathering system.
    const player = this.players[socket.id];
    
    // Make sure remaining resources is initialized
    if (resourceNode.remainingResources === undefined) {
      resourceNode.remainingResources = 5;
    }
    
    // Immediate resource acquisition as a fallback
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
    
    // Decrement remaining resources
    resourceNode.remainingResources -= logCount;
    
    // Check if resource is depleted
    if (resourceNode.remainingResources <= 0) {
      // Resource is depleted, mark as harvested
      resourceNode.state = 'harvested';
      
      // Broadcast the resource state change to all players
      this.io.emit('resourceStateChanged', {
        resourceId: resourceNode.id,
        state: 'harvested',
        available: false
      });
      
      // Make resource unavailable with 60 second respawn
      this.makeResourceUnavailable(resourceNode.id, 60000);
    }
    
    // Send success message
    socket.emit('resourceGathered', {
      resourceId: resourceNode.id,
      resourceType: 'tree',
      item: logs,
      remainingResources: resourceNode.remainingResources
    });
    
    // Update inventory
    socket.emit('inventoryUpdate', player.inventory);
  }
  
  /**
   * Handle rock interaction (mining)
   */
  private async handleRockInteraction(socket: ExtendedSocket, resourceNode: ResourceNode): Promise<void> {
    // This is the old immediate resource gathering method.
    // It's now kept as a fallback but should be less used in favor of the new gathering system.
    const player = this.players[socket.id];
    
    // Make sure remaining resources is initialized
    if (resourceNode.remainingResources === undefined) {
      resourceNode.remainingResources = 5;
    }
    
    // Immediate resource acquisition as a fallback
    const oreCount = 1;
    const ore = {
      id: uuidv4(),
      type: 'coal', // Use coal for all rocks for now
      quantity: oreCount
    };
    
    // Add ore to player inventory
    player.inventory.push(ore);
    
    // Save inventory to database
    if (socket.user && socket.user.id) {
      await savePlayerInventory(socket.user.id, player.inventory);
    }
    
    // Decrement remaining resources
    resourceNode.remainingResources -= oreCount;
    
    // Check if resource is depleted
    if (resourceNode.remainingResources <= 0) {
      // Resource is depleted, mark as harvested
      resourceNode.state = 'harvested';
      
      // Broadcast the resource state change to all players
      this.io.emit('resourceStateChanged', {
        resourceId: resourceNode.id,
        state: 'harvested',
        available: false
      });
      
      // Make resource unavailable with 60 second respawn
      this.makeResourceUnavailable(resourceNode.id, 60000);
    }
    
    // Send success message
    socket.emit('resourceGathered', {
      resourceId: resourceNode.id,
      resourceType: 'rock',
      item: ore,
      remainingResources: resourceNode.remainingResources
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
   * Make a resource unavailable for gathering (e.g. after depletion)
   */
  private makeResourceUnavailable(resourceId: string, duration: number): void {
    // Add to unavailable resources map with time to respawn
    this.unavailableResources.set(resourceId, Date.now() + duration);
    
    // Find the resource node
    const resourceNode = this.resourceNodes.find(node => node.id === resourceId);
    if (!resourceNode) {
      console.error(`Resource node ${resourceId} not found in makeResourceUnavailable`);
      return;
    }
    
    // Set a timer to respawn the resource
    setTimeout(() => {
      this.makeResourceAvailable(resourceId);
    }, duration);
    
    console.log(`Resource ${resourceId} marked as unavailable for ${duration}ms`);
  }
  
  /**
   * Make a resource available again (respawn)
   */
  private makeResourceAvailable(resourceId: string): void {
    // Remove from unavailable resources map
    this.unavailableResources.delete(resourceId);
    
    // Find the resource node
    const resourceNode = this.resourceNodes.find(node => node.id === resourceId);
    if (!resourceNode) {
      console.error(`Resource node ${resourceId} not found in makeResourceAvailable`);
      return;
    }
    
    // Reset the resource properties
    resourceNode.state = 'normal';
    resourceNode.remainingResources = 5; // Reset to full resources
    
    // Broadcast the resource state change to all clients
    this.io.emit('resourceStateChanged', {
      resourceId,
      state: 'normal',
      available: true,
      remainingResources: resourceNode.remainingResources
    });
    
    // Send a notification to all players about the respawn
    this.io.emit('chatMessage', {
      content: `A ${resourceNode.type} has respawned.`,
      type: 'system',
      timestamp: Date.now()
    });
    
    console.log(`Resource ${resourceId} marked as available again (respawned)`);
  }
  
  /**
   * Initialize default resources if database load fails
   */
  private initializeDefaultResources(): void {
    this.resourceNodes = [
      {
        id: 'tree-1',
        type: 'tree',
        x: 10,
        y: 0,
        z: 10,
        respawnTime: 60000, // 60 seconds in ms
        remainingResources: 5,
        state: 'normal'
      },
      {
        id: 'tree-2',
        type: 'tree',
        x: 15,
        y: 0,
        z: 15,
        respawnTime: 60000,
        remainingResources: 5,
        state: 'normal'
      },
      {
        id: 'tree-3',
        type: 'tree',
        x: 20,
        y: 0,
        z: 10,
        respawnTime: 60000,
        remainingResources: 5,
        state: 'normal'
      },
      {
        id: 'rock-1',
        type: 'rock',
        x: -20,
        y: 0,
        z: -20,
        respawnTime: 60000,
        remainingResources: 5,
        state: 'normal'
      },
      {
        id: 'rock-2',
        type: 'rock',
        x: -25,
        y: 0,
        z: -15,
        respawnTime: 60000,
        remainingResources: 5,
        state: 'normal'
      },
      {
        id: 'fish-1',
        type: 'fish',
        x: 30,
        y: 0,
        z: -30,
        respawnTime: 60000,
        remainingResources: 5,
        state: 'normal'
      }
    ];
    console.log('Initialized default resources:', this.resourceNodes.map(r => r.id).join(', '));
  }
  
  /**
   * Get all resource nodes
   */
  public getResourceNodes(): ResourceNode[] {
    console.log(`getResourceNodes called, returning ${this.resourceNodes.length} nodes:`, 
      this.resourceNodes.map(node => ({ id: node.id, type: node.type })));
    
    // If no resources exist, initialize defaults
    if (this.resourceNodes.length === 0) {
      console.warn('No resources found in getResourceNodes, initializing defaults');
      this.initializeDefaultResources();
      console.log(`Now returning ${this.resourceNodes.length} default nodes`);
    }
    
    return this.resourceNodes as ResourceNode[];
  }
}

export default ResourceHandler; 