import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { loadResourceNodes, savePlayerInventory, savePlayerSkills } from '../../models/gameModel';
import { ExtendedSocket, PlayersStore } from '../types';
import { ExperienceHandler, SkillType } from './ExperienceHandler';

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
  private experienceHandler: ExperienceHandler;
  
  constructor(io: Server, players: PlayersStore, experienceHandler: ExperienceHandler) {
    this.io = io;
    this.players = players;
    this.experienceHandler = experienceHandler;
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
      
      // ADD: Check player distance to resource
      const playerDistance = this.calculateDistance(
        player.x, player.y, player.z,
        resourceNode.x, resourceNode.y, resourceNode.z
      );
      
      // Maximum distance allowed (3-5 units depending on resource type)
      const maxDistance = this.getMaxInteractionDistance(resourceNode.type);
      
      if (playerDistance > maxDistance) {
        socket.emit('chatMessage', { 
          content: `You are too far from this ${resourceNode.type}. Move closer.`, 
          type: 'system', 
          timestamp: Date.now() 
        });
        socket.emit('resourceUnavailable', { resourceId });
        return;
      }
      
      try {
        // Check skill level first
        if (!this.hasRequiredSkillLevel(player, resourceNode.type, action)) {
          socket.emit('error', `Your ${action} level is too low for this resource`);
          socket.emit('chatMessage', { 
            content: `You need a higher ${action} level to ${action} this resource.`, 
            type: 'system', 
            timestamp: Date.now() 
          });
          return;
        }
        
        // Stop any existing gathering activity for this player
        this.stopGatheringForPlayer(socket.id);
        
        // Handle different resource types and actions
        if (resourceNode.type.includes('tree') && action === 'chop') {
          // Check if player has an appropriate axe for this tree type
          if (this.hasToolForResource(player, resourceNode.type, 'chop')) {
            // Send a message to the player's chat
            socket.emit('chatMessage', { 
              content: `You begin chopping the ${resourceNode.type}...`, 
              type: 'action', 
              timestamp: Date.now() 
            });
            
            // Start the gathering process
            this.startResourceGathering(socket, resourceNode, 'chop');
          } else {
            socket.emit('error', 'You need a better axe to chop down this tree');
            socket.emit('chatMessage', { 
              content: `You need a better axe to chop down this tree.`, 
              type: 'system', 
              timestamp: Date.now() 
            });
          }
        } else if (resourceNode.type.includes('rock') && action === 'mine') {
          // Check if player has an appropriate pickaxe for this rock type
          if (this.hasToolForResource(player, resourceNode.type, 'mine')) {
            // Send a message to the player's chat
            socket.emit('chatMessage', { 
              content: `You begin mining the ${resourceNode.type}...`, 
              type: 'action', 
              timestamp: Date.now() 
            });
            
            // Start the gathering process
            this.startResourceGathering(socket, resourceNode, 'mine');
          } else {
            socket.emit('error', 'You need a better pickaxe to mine this rock');
            socket.emit('chatMessage', { 
              content: `You need a better pickaxe to mine this rock.`, 
              type: 'system', 
              timestamp: Date.now() 
            });
          }
        } else if (resourceNode.type.includes('fishing_spot') && action === 'fish') {
          // Check if player has appropriate fishing equipment for this spot
          if (this.hasToolForResource(player, resourceNode.type, 'fish')) {
            // Send a message to the player's chat
            socket.emit('chatMessage', { 
              content: `You begin fishing...`, 
              type: 'action', 
              timestamp: Date.now() 
            });
            
            // Start the gathering process
            this.startResourceGathering(socket, resourceNode, 'fish');
          } else {
            socket.emit('error', 'You need the right fishing equipment for this spot');
            socket.emit('chatMessage', { 
              content: `You need the right fishing equipment for this fishing spot.`, 
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
   * Check if player has the required skill level for a resource
   */
  private hasRequiredSkillLevel(player: any, resourceType: string, actionType: string): boolean {
    // Get required skill type and level
    const { skillType, requiredLevel } = this.getRequiredSkillForResource(resourceType, actionType);
    
    // If no skill required, return true
    if (!skillType || requiredLevel <= 0) {
      return true;
    }
    
    // Make sure player skills exist
    if (!player.skills || !player.skills[skillType]) {
      return requiredLevel <= 1; // Default to level 1 if no skill data exists
    }
    
    // Check if player has the required level
    const playerLevel = player.skills[skillType].level || 1;
    return playerLevel >= requiredLevel;
  }
  
  /**
   * Get the required skill type and level for a resource
   */
  private getRequiredSkillForResource(resourceType: string, actionType: string): { skillType: string | null, requiredLevel: number } {
    // Map action types to skill types
    let skillType: string | null = null;
    let requiredLevel = 1;
    
    switch (actionType) {
      case 'chop':
        skillType = 'woodcutting';
        // Set required level based on tree type
        if (resourceType.includes('yew')) {
          requiredLevel = 60;
        } else if (resourceType.includes('maple')) {
          requiredLevel = 45;
        } else if (resourceType.includes('willow')) {
          requiredLevel = 30;
        } else if (resourceType.includes('oak')) {
          requiredLevel = 15;
        } else {
          requiredLevel = 1; // Normal trees
        }
        break;
        
      case 'mine':
        skillType = 'mining';
        // Set required level based on rock type
        if (resourceType.includes('mithril')) {
          requiredLevel = 55;
        } else if (resourceType.includes('gold')) {
          requiredLevel = 40;
        } else if (resourceType.includes('coal')) {
          requiredLevel = 30;
        } else if (resourceType.includes('iron')) {
          requiredLevel = 15;
        } else {
          requiredLevel = 1; // Copper/tin
        }
        break;
        
      case 'fish':
        skillType = 'fishing';
        // Set required level based on fishing spot type
        if (resourceType.includes('swordfish') || resourceType.includes('harpoon')) {
          requiredLevel = 50;
        } else if (resourceType.includes('lobster') || resourceType.includes('cage')) {
          requiredLevel = 40;
        } else if (resourceType.includes('salmon') || resourceType.includes('trout')) {
          requiredLevel = 20;
        } else {
          requiredLevel = 1; // Shrimp/sardines
        }
        break;
    }
    
    return { skillType, requiredLevel };
  }
  
  /**
   * Check if player has the required tool either equipped or in inventory
   */
  private hasToolForAction(player: any, action: string): boolean {
    // Get required tool type and tier based on the action
    const { toolType, minTier } = this.getRequiredToolForAction(action);
    
    if (!toolType) return false; // No tool required or invalid action
    
    // Check if the player has any tool that meets or exceeds the minimum tier
    const hasSufficientTool = this.checkToolInInventoryOrEquipped(player, toolType, minTier);
    
    return hasSufficientTool;
  }
  
  /**
   * Get required tool type and minimum tier for a specific action
   */
  private getRequiredToolForAction(action: string): { toolType: string | null, minTier: string } {
    switch (action) {
      case 'chop':
        return { toolType: 'axe', minTier: 'bronze' }; // Default to bronze tier
      case 'mine':
        return { toolType: 'pickaxe', minTier: 'bronze' }; // Default to bronze tier
      case 'fish':
        return { toolType: 'fishing_rod', minTier: 'basic' }; // Default to basic tier
      default:
        return { toolType: null, minTier: 'none' };
    }
  }
  
  /**
   * Check if player has the required tool for a specific resource type
   * @param player The player object
   * @param resourceType The type of resource being gathered
   * @param actionType The action being performed (chop, mine, fish)
   * @returns Boolean indicating if player has the appropriate tool
   */
  private hasToolForResource(player: any, resourceType: string, actionType: string): boolean {
    // Define tool requirements based on resource type
    let requiredTool = '';
    let minTier = 'bronze';
    
    switch (actionType) {
      case 'chop':
        requiredTool = 'axe';
        // Determine minimum tier based on tree type
        if (resourceType.includes('yew')) {
          minTier = 'steel';
        } else if (resourceType.includes('maple') || resourceType.includes('willow')) {
          minTier = 'iron';
        } else {
          minTier = 'bronze'; // Normal trees need bronze+ axe
        }
        break;
        
      case 'mine':
        requiredTool = 'pickaxe';
        // Determine minimum tier based on rock type
        if (resourceType.includes('mithril') || resourceType.includes('gold')) {
          minTier = 'steel';
        } else if (resourceType.includes('coal') || resourceType.includes('iron')) {
          minTier = 'iron';
        } else {
          minTier = 'bronze'; // Copper/tin needs bronze+ pickaxe
        }
        break;
        
      case 'fish':
        // Different fishing spots may require different tools
        if (resourceType.includes('cage') || resourceType.includes('harpoon')) {
          requiredTool = 'harpoon';
        } else if (resourceType.includes('net')) {
          requiredTool = 'fishing_net';
        } else {
          requiredTool = 'fishing_rod';
        }
        break;
        
      default:
        return false; // Unknown action type
    }
    
    // Check if the player has the required tool of the minimum tier or better
    return this.checkToolInInventoryOrEquipped(player, requiredTool, minTier);
  }
  
  /**
   * Check if a player has a tool of sufficient tier either equipped or in inventory
   * @param player The player object
   * @param toolType The type of tool required (axe, pickaxe, etc.)
   * @param minTier The minimum tier required (bronze, iron, steel, etc.)
   * @returns Boolean indicating if player has a sufficient tool
   */
  private checkToolInInventoryOrEquipped(player: any, toolType: string, minTier: string): boolean {
    const tierValues: Record<string, number> = {
      'bronze': 1,
      'iron': 2,
      'steel': 3,
      'mithril': 4,
      'adamant': 5,
      'rune': 6,
      'dragon': 7,
      // Add special tiers if needed
      'basic': 1,  // For fishing tools or other basic tools
      'none': 0    // No tier requirement
    };
    
    const requiredTierValue = tierValues[minTier] || 1;
    
    // List of valid tools in the game, with their tier values
    const toolMappings: { [key: string]: { type: string, tier: number } } = {
      // Axes
      'bronze_axe': { type: 'axe', tier: tierValues['bronze'] },
      'iron_axe': { type: 'axe', tier: tierValues['iron'] },
      'steel_axe': { type: 'axe', tier: tierValues['steel'] },
      // Pickaxes
      'bronze_pickaxe': { type: 'pickaxe', tier: tierValues['bronze'] },
      'iron_pickaxe': { type: 'pickaxe', tier: tierValues['iron'] },
      'steel_pickaxe': { type: 'pickaxe', tier: tierValues['steel'] },
      // Fishing tools
      'fishing_rod': { type: 'fishing_rod', tier: tierValues['basic'] },
      'fishing_net': { type: 'fishing_net', tier: tierValues['basic'] },
      'harpoon': { type: 'harpoon', tier: tierValues['basic'] }
      // Add more tools as needed
    };
    
    // Check if equipped item meets requirements
    if (player.equippedItem) {
      const equippedMapping = toolMappings[player.equippedItem.type];
      if (equippedMapping && 
          equippedMapping.type === toolType && 
          equippedMapping.tier >= requiredTierValue) {
        return true;
      }
    }
    
    // Check if any inventory item meets requirements
    return player.inventory.some((item: any) => {
      const itemMapping = toolMappings[item.type];
      return itemMapping && 
             itemMapping.type === toolType && 
             itemMapping.tier >= requiredTierValue;
    });
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

    // ADD: Check player distance to resource
    const playerDistance = this.calculateDistance(
      player.x, player.y, player.z,
      resourceNode.x, resourceNode.y, resourceNode.z
    );
    
    // Maximum distance allowed (3-5 units depending on resource type)
    const maxDistance = this.getMaxInteractionDistance(resourceNode.type);
    
    if (playerDistance > maxDistance) {
      socket.emit('gather_error', { message: `You are too far from this ${resourceNode.type}. Move closer.` });
      socket.emit('resourceUnavailable', { resourceId });
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
    if (!player) return;

    // Determine tree type and log type
    const treeType = resourceNode.metadata?.treeType || 'normal';
    const logType = this.getItemTypeFromResource(resourceNode);

    // Generate logs
    const logs = {
      id: uuidv4(),
      type: logType,
      quantity: 1
    };

    // Add logs to inventory
    if (!player.inventory) player.inventory = [];
    player.inventory.push(logs);

    // --- XP GAIN LOGIC using ExperienceHandler ---
    const experienceToAdd = this.experienceHandler.getXpReward(SkillType.WOODCUTTING, treeType);
    let xpGained = 0;

    if (experienceToAdd > 0) {
      const xpResult = this.experienceHandler.addExperience(player, SkillType.WOODCUTTING, experienceToAdd);

      if (xpResult) {
        xpGained = experienceToAdd; // Store actual XP gained

        // Emit level up event if needed
        if (xpResult.leveledUp) {
          console.log(`Player ${socket.id} leveled up Woodcutting to level ${xpResult.newLevel}!`);
          socket.emit('levelUp', {
            skill: SkillType.WOODCUTTING,
            level: xpResult.newLevel
          });
          socket.emit('chatMessage', {
            content: `Congratulations! You've reached Woodcutting level ${xpResult.newLevel}!`,
            type: 'system',
            timestamp: Date.now()
          });
        }

        // Emit experience gained event (client might use this for XP counter UI)
        socket.emit('experienceGained', {
          skill: SkillType.WOODCUTTING,
          experience: experienceToAdd,
          totalExperience: xpResult.newExperience,
          level: xpResult.newLevel
        });

        // Save updated skills
        if (socket.user && socket.user.id) {
          await this.savePlayerSkills(socket.user.id, player.skills);
        } else {
          console.warn(`Player ${socket.id} is not authenticated, skills not saved.`);
        }
      }
    }
    // --- END XP GAIN LOGIC ---

    // Send inventory update
    socket.emit('inventoryUpdate', player.inventory);

    // Send chat message about getting logs
    socket.emit('chatMessage', { 
      content: `You get some ${logType.replace('_', ' ')}. (${resourceNode.remainingResources} left)`, 
      type: 'action',
      timestamp: Date.now() 
    });

    console.log(`Player ${socket.id} gathered ${logType} from ${resourceNode.id} and gained ${xpGained} XP.`);

    // Save inventory (already done earlier implicitly? Let's ensure it's saved)
    if (socket.user && socket.user.id) {
      await this.savePlayerInventory(socket, player.inventory);
    }
  }
  
  /**
   * Handle rock gathering (get coal/ore)
   */
  private async handleRockGathering(socket: ExtendedSocket, resourceNode: ResourceNode): Promise<void> {
    const player = this.players[socket.id];
    if (!player) return;

    // Determine ore type
    const rockType = resourceNode.metadata?.rockType || 'copper'; // Default if not specified
    const oreType = this.getItemTypeFromResource(resourceNode);

    // Generate ore
    const ore = {
      id: uuidv4(),
      type: oreType,
      quantity: 1
    };

    // Add ore to inventory
    if (!player.inventory) player.inventory = [];
    player.inventory.push(ore);

    // --- XP GAIN LOGIC using ExperienceHandler ---
    const experienceToAdd = this.experienceHandler.getXpReward(SkillType.MINING, rockType);
    let xpGained = 0;

    if (experienceToAdd > 0) {
      const xpResult = this.experienceHandler.addExperience(player, SkillType.MINING, experienceToAdd);

      if (xpResult) {
        xpGained = experienceToAdd; // Store actual XP gained

        // Emit level up event if needed
        if (xpResult.leveledUp) {
          console.log(`Player ${socket.id} leveled up Mining to level ${xpResult.newLevel}!`);
          socket.emit('levelUp', {
            skill: SkillType.MINING,
            level: xpResult.newLevel
          });
          socket.emit('chatMessage', {
            content: `Congratulations! You've reached Mining level ${xpResult.newLevel}!`,
            type: 'system',
            timestamp: Date.now()
          });
        }

        // Emit experience gained event
        socket.emit('experienceGained', {
          skill: SkillType.MINING,
          experience: experienceToAdd,
          totalExperience: xpResult.newExperience,
          level: xpResult.newLevel
        });

        // Save updated skills
        if (socket.user && socket.user.id) {
          await this.savePlayerSkills(socket.user.id, player.skills);
        } else {
          console.warn(`Player ${socket.id} is not authenticated, skills not saved.`);
        }
      }
    }
    // --- END XP GAIN LOGIC ---

    // Send inventory update
    socket.emit('inventoryUpdate', player.inventory);

    // Send chat message about getting ore
    socket.emit('chatMessage', { 
      content: `You get some ${oreType.replace('_', ' ')}. (${resourceNode.remainingResources} left)`, 
      type: 'action', 
      timestamp: Date.now() 
    });

    console.log(`Player ${socket.id} gathered ${oreType} from ${resourceNode.id} and gained ${xpGained} XP.`);

    // Save inventory
    if (socket.user && socket.user.id) {
      await this.savePlayerInventory(socket, player.inventory);
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
    
    // Determine the correct ore type based on the resource metadata
    const oreType = this.getItemTypeFromResource(resourceNode);
    
    // Immediate resource acquisition as a fallback
    const oreCount = 1;
    const ore = {
      id: uuidv4(),
      type: oreType, // Use the correct ore type based on rock type
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
    // Check if skills actually exist before trying to save
    if (!skills || Object.keys(skills).length === 0) {
      console.log(`[ResourceHandler] No skills data to save for user ${userId}`);
      return;
    }
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

  /**
   * Calculate distance between two 3D points
   */
  private calculateDistance(x1: number, y1: number, z1: number, x2: number, y2: number, z2: number): number {
    return Math.sqrt(
      Math.pow(x2 - x1, 2) +
      Math.pow(y2 - y1, 2) +
      Math.pow(z2 - z1, 2)
    );
  }

  /**
   * Get maximum interaction distance based on resource type
   */
  private getMaxInteractionDistance(resourceType: string): number {
    switch (resourceType) {
      case 'tree':
        return 3; // Woodcutting distance
      case 'rock':
        return 3; // Mining distance  
      case 'fishing_spot':
        return 5; // Fishing allows slightly longer distance
      default:
        return 3; // Default interaction distance
    }
  }
}

export default ResourceHandler; 