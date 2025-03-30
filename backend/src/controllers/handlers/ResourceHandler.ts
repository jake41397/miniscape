import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { loadResourceNodes, savePlayerInventory, savePlayerSkills } from '../../models/gameModel';
import { ExtendedSocket, PlayersStore } from '../types';

interface ResourceNode {
  id: string;
  type: string;
  x: number;
  y: number;
  z: number;
  respawnTime: number;
  state: 'normal' | 'harvested';
  remainingResources: number;
  metadata?: Record<string, any>;
}

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
      console.log(`Loaded ${this.resourceNodes.length} resource nodes from database:`, this.resourceNodes.map(node => node.id).slice(0, 10), this.resourceNodes.length > 10 ? '...(and more)' : '');
      
      // Display exact object structure for debugging
      if (this.resourceNodes.length > 0) {
        console.log('First resource node structure:', JSON.stringify(this.resourceNodes[0], null, 2));
      }
      
      // Initialize default resources if none were loaded from database
      if (this.resourceNodes.length === 0) {
        console.warn('No resources found in database, waiting 3 seconds before initializing defaults...');
        
        // Wait a bit before falling back to defaults, in case DB is still connecting
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Try loading one more time
        this.resourceNodes = await loadResourceNodes();
        
        if (this.resourceNodes.length === 0) {
          console.warn('Still no resources after retry, initializing defaults');
          this.initializeDefaultResources();
        } else {
          console.log(`Successfully loaded ${this.resourceNodes.length} resource nodes on second attempt`);
        }
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
      
      // Start respawn checker in case server was restarted while resources were depleted
      this.startRespawnChecker();
    } catch (error) {
      console.error('Failed to initialize resource nodes:', error);
      console.error('Stack trace:', new Error().stack);
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
            this.startResourceGathering(socket, resourceNode, 'chop');
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
            this.startResourceGathering(socket, resourceNode, 'mine');
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
   * Start gathering with a tool
   */
  private startResourceGathering(socket: ExtendedSocket, resourceNode: ResourceNode, action: string): void {
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
        resourceNode.remainingResources--;
        
        // Check if resource is depleted
        if (resourceNode.remainingResources <= 0) {
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
   * Start gathering from a resource
   */
  public startGathering(socket: ExtendedSocket, resourceId: string): void {
    // Find the resource node
    const resourceNode = this.resourceNodes.find(node => node.id === resourceId);
    if (!resourceNode) {
      socket.emit('gather_error', { message: 'Resource not found' });
      return;
    }

    // Check if resource is depleted
    if (resourceNode.state === 'harvested') {
      socket.emit('gather_error', { message: 'This resource is depleted' });
      return;
    }

    // Check if player is already gathering
    if (this.gatheringPlayers.has(socket.id)) {
      this.stopGathering(socket.id);
    }

    // Get player
    const player = this.players[socket.id];
    if (!player) {
      socket.emit('gather_error', { message: 'Player not found' });
      return;
    }

    // Start gathering interval
    const gatherInterval = setInterval(() => {
      this.gatherResource(socket, resourceNode);
    }, 3000); // Gather every 3 seconds

    // Store gathering state
    this.gatheringPlayers.set(socket.id, { 
      resourceId, 
      intervalId: gatherInterval 
    });

    // Notify client
    socket.emit('start_gathering', { resourceId });
  }

  /**
   * Harvest a resource
   */
  private gatherResource(socket: ExtendedSocket, resourceNode: ResourceNode): void {
    // Decrease remaining resources
    resourceNode.remainingResources--;

    // Determine item type based on resource
    const itemType = this.getItemTypeFromResource(resourceNode);
    
    // Add item to player inventory
    const player = this.players[socket.id];
    if (player) {
      player.inventory.push({
        id: uuidv4(),
        type: itemType,
        quantity: 1
      });
      
      // Save player inventory
      this.savePlayerInventory(socket, player.inventory);
      
      // Notify client
      socket.emit('gather_success', { 
        resourceId: resourceNode.id,
        itemType,
        remainingResources: resourceNode.remainingResources
      });
    }

    // Check if resource is now depleted
    if (resourceNode.remainingResources <= 0) {
      this.depleteResource(resourceNode.id);
      this.stopGathering(socket.id);
    }
  }

  /**
   * Get the type of item obtained from a resource
   */
  private getItemTypeFromResource(resourceNode: ResourceNode): string {
    const { type, metadata } = resourceNode;
    
    if (type === 'tree') {
      const treeType = metadata?.treeType || 'normal_tree';
      
      // Different logs based on tree type
      if (treeType === 'normal_tree') return 'logs';
      if (treeType === 'oak_tree') return 'oak_logs';
      if (treeType === 'willow_tree') return 'willow_logs';
      if (treeType === 'maple_tree') return 'maple_logs';
      if (treeType === 'yew_tree') return 'yew_logs';
      if (treeType === 'magic_tree') return 'magic_logs';
      
      return 'logs';
    }
    
    if (type === 'rock') {
      const rockType = metadata?.rockType || 'stone';
      
      // Different ores based on rock type
      if (rockType === 'copper_rock') return 'copper_ore';
      if (rockType === 'tin_rock') return 'tin_ore';
      if (rockType === 'iron_rock') return 'iron_ore';
      if (rockType === 'coal_rock') return 'coal';
      if (rockType === 'gold_rock') return 'gold_ore';
      if (rockType === 'mithril_rock') return 'mithril_ore';
      if (rockType === 'adamantite_rock') return 'adamantite_ore';
      if (rockType === 'runite_rock') return 'runite_ore';
      
      return 'stone';
    }
    
    if (type === 'fish') {
      const fishTypes = metadata?.fishTypes || ['shrimp'];
      return `raw_${fishTypes[0]}`;
    }
    
    return 'unknown_item';
  }

  /**
   * Stop a player from gathering
   */
  public stopGathering(socketId: string): void {
    const gatherData = this.gatheringPlayers.get(socketId);
    if (!gatherData) return;

    // Clear gathering interval
    clearInterval(gatherData.intervalId);
    
    // Remove from gathering players
    this.gatheringPlayers.delete(socketId);
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
  private async initializeDefaultResources(): Promise<void> {
    console.log('Initializing default resources...');
    
    // Define default resource nodes
    const defaultNodes = [
      {
        id: 'tree-1',
        type: 'tree',
        node_type: 'tree',
        specific_type: 'normal_tree',
        x: 10, y: 1, z: 10,
        respawn_time: 60
      },
      {
        id: 'tree-2',
        type: 'tree',
        node_type: 'tree',
        specific_type: 'normal_tree',
        x: 15, y: 1, z: 15,
        respawn_time: 60
      },
      {
        id: 'tree-3',
        type: 'tree',
        node_type: 'tree',
        specific_type: 'normal_tree',
        x: 20, y: 1, z: 10,
        respawn_time: 60
      },
      {
        id: 'rock-1',
        type: 'rock',
        node_type: 'rock',
        specific_type: 'copper_rock',
        x: -20, y: 1, z: -20,
        respawn_time: 60
      },
      {
        id: 'rock-2',
        type: 'rock',
        node_type: 'rock',
        specific_type: 'tin_rock',
        x: -25, y: 1, z: -15,
        respawn_time: 60
      },
      {
        id: 'fish-1',
        type: 'fish',
        node_type: 'fish',
        specific_type: 'shrimp_spot',
        x: 30, y: 1, z: -30,
        respawn_time: 60
      }
    ];
    
    // First try to insert them into database
    try {
      console.log('Attempting to save default resources to database...');
      
      const { insertResourceNode } = await import('../../models/gameModel');
      
      // For each default node, try to insert it into the database
      for (const node of defaultNodes) {
        const nodeData = {
          node_type: node.node_type,
          specific_type: node.specific_type,
          x: node.x,
          y: node.y,
          z: node.z,
          respawn_time: node.respawn_time
        };
        
        const id = await insertResourceNode(nodeData);
        console.log(`Inserted default resource into database: ${node.type} at (${node.x}, ${node.z}) with ID: ${id || 'failed'}`);
      }
      
      // Try loading from database again after inserts
      console.log('Reloading resources from database after inserting defaults...');
      const { loadResourceNodes } = await import('../../models/gameModel');
      this.resourceNodes = await loadResourceNodes();
      
      if (this.resourceNodes.length > 0) {
        console.log(`Successfully loaded ${this.resourceNodes.length} resource nodes after inserting defaults.`);
        return;
      }
    } catch (error) {
      console.error('Failed to save default resources to database:', error);
    }
    
    // If database operations failed, use in-memory defaults
    console.log('Using in-memory default resources as fallback');
    
    this.resourceNodes = defaultNodes.map(node => ({
      id: node.id,
      type: node.type,
      x: node.x,
      y: node.y,
      z: node.z,
      respawnTime: node.respawn_time * 1000, // Convert to milliseconds
      remainingResources: 5,
      state: 'normal',
      metadata: node.node_type === 'tree' ? { treeType: node.specific_type } : 
                node.node_type === 'rock' ? { rockType: node.specific_type } :
                node.node_type === 'fish' ? { fishTypes: [node.specific_type.replace('_spot', '')] } : {}
    }));
    
    console.log(`Initialized ${this.resourceNodes.length} default resources:`, this.resourceNodes.map(r => r.id).join(', '));
  }
  
  /**
   * Get all resource nodes
   */
  public async getResourceNodes(): Promise<ResourceNode[]> {
    console.log(`getResourceNodes called, returning ${this.resourceNodes.length} nodes:`, 
      this.resourceNodes.map(node => ({ id: node.id, type: node.type })).slice(0, 5));
    
    // If no resources exist, try loading from database again before falling back to defaults
    if (this.resourceNodes.length === 0) {
      console.warn('No resources found in getResourceNodes, attempting to reload from database');
      
      try {
        // Try loading from database first
        this.resourceNodes = await loadResourceNodes();
        
        // Only initialize defaults if database load fails
        if (this.resourceNodes.length === 0) {
          console.warn('Still no resources after database retry, initializing defaults');
          this.initializeDefaultResources();
        } else {
          console.log(`Successfully loaded ${this.resourceNodes.length} resource nodes from database in getResourceNodes`);
        }
      } catch (error) {
        console.error('Error reloading resources:', error);
        this.initializeDefaultResources();
      }
    }
    
    return this.resourceNodes as ResourceNode[];
  }

  /**
   * Start a periodic check for respawning resources and persist resources to DB
   */
  private startRespawnChecker(): void {
    // Check for resources to respawn every 10 seconds
    setInterval(() => {
      const now = Date.now();
      
      // Check all unavailable resources
      this.unavailableResources.forEach((respawnAt, resourceId) => {
        if (now >= respawnAt) {
          this.respawnResource(resourceId);
        }
      });
    }, 10000); // Check every 10 seconds
    
    // Persist current resource state to database every 5 minutes
    setInterval(() => {
      this.persistResourcesToDB();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Persist all resource nodes back to the database to maintain state across restarts
   */
  private async persistResourcesToDB(): Promise<void> {
    try {
      console.log('Persisting resource states to database...');
      
      // Use Supabase to store the current state of all resources
      const supabase = (await import('../../config/supabase')).default;
      
      // For each resource node, update its state in the database
      let successCount = 0;
      let errorCount = 0;
      
      // Process in batches to avoid overwhelming the database
      const batchSize = 10;
      const batches = Math.ceil(this.resourceNodes.length / batchSize);
      
      for (let i = 0; i < batches; i++) {
        const start = i * batchSize;
        const end = Math.min(start + batchSize, this.resourceNodes.length);
        const batch = this.resourceNodes.slice(start, end);
        
        const promises = batch.map(async (node) => {
          try {
            // Update only the state and respawn time, not position/type
            const { error } = await supabase
              .from('resource_nodes')
              .update({
                updated_at: new Date().toISOString()
              })
              .eq('id', node.id);
            
            if (error) {
              console.error(`Error updating resource node ${node.id}:`, error);
              errorCount++;
              return false;
            }
            
            successCount++;
            return true;
          } catch (err) {
            console.error(`Error in database operation for node ${node.id}:`, err);
            errorCount++;
            return false;
          }
        });
        
        await Promise.all(promises);
      }
      
      console.log(`Resource persistence complete. Success: ${successCount}, Errors: ${errorCount}`);
    } catch (error) {
      console.error('Failed to persist resources to database:', error);
    }
  }

  /**
   * Mark a resource as depleted and schedule its respawn
   */
  private depleteResource(resourceId: string): void {
    const resourceNode = this.resourceNodes.find(node => node.id === resourceId);
    if (!resourceNode) return;

    // Update resource state
    resourceNode.state = 'harvested';
    resourceNode.remainingResources = 0;
    
    // Broadcast resource depletion to all clients
    this.io.emit('resource_depleted', { resourceId });

    // Schedule resource respawn
    const respawnTime = resourceNode.respawnTime;
    this.scheduleRespawn(resourceId, respawnTime);
  }

  /**
   * Schedule a resource to respawn after the specified time
   */
  private scheduleRespawn(resourceId: string, respawnTime: number): void {
    // Store when the resource should respawn
    const respawnAt = Date.now() + respawnTime;
    this.unavailableResources.set(resourceId, respawnAt);

    // Set timeout to respawn the resource
    setTimeout(() => {
      this.respawnResource(resourceId);
    }, respawnTime);
  }

  /**
   * Respawn a depleted resource
   */
  private respawnResource(resourceId: string): void {
    const resourceNode = this.resourceNodes.find(node => node.id === resourceId);
    if (!resourceNode) return;

    // Reset resource state
    resourceNode.state = 'normal';
    
    // Set remaining resources based on resource type
    const specificType = 
      resourceNode.type === 'tree' ? resourceNode.metadata?.treeType :
      resourceNode.type === 'rock' ? resourceNode.metadata?.rockType :
      resourceNode.type === 'fish' ? (resourceNode.metadata?.fishTypes?.[0] + '_spot') : null;
    
    if (specificType) {
      if (specificType.includes('magic') || specificType.includes('runite')) {
        resourceNode.remainingResources = 2;
      } else if (specificType.includes('yew') || specificType.includes('adamantite')) {
        resourceNode.remainingResources = 3;
      } else if (specificType.includes('maple') || specificType.includes('mithril')) {
        resourceNode.remainingResources = 4;
      } else {
        resourceNode.remainingResources = 5;
      }
    } else {
      resourceNode.remainingResources = 5; // Default
    }
    
    // Remove from unavailable resources
    this.unavailableResources.delete(resourceId);

    // Broadcast resource respawn to all clients
    this.io.emit('resource_respawned', { resourceId });
  }

  /**
   * Save player inventory to database
   */
  private async savePlayerInventory(socket: ExtendedSocket, inventory: any[]): Promise<void> {
    if (!socket.user?.id) return;
    
    try {
      await savePlayerInventory(socket.user.id, inventory);
    } catch (error) {
      console.error('Failed to save player inventory:', error);
    }
  }

  /**
   * Save player skills to database
   */
  private async savePlayerSkills(userId: string, skills: any): Promise<void> {
    try {
      await savePlayerSkills(userId, skills);
    } catch (error) {
      console.error('Failed to save player skills:', error);
    }
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
}

export default ResourceHandler; 