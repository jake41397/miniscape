import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { savePlayerInventory } from '../../models/gameModel';

// Define the types needed
interface Player {
  id: string;
  x: number;
  y: number;
  z: number;
  inventory: {
    id: string;
    type: string;
    quantity?: number;
  }[];
  skills?: {
    [key: string]: {
      level: number;
      experience: number;
    };
  };
}

interface PlayersStore {
  [key: string]: Player;
}

interface ExtendedSocket extends Socket {
  user?: {
    id: string;
    [key: string]: any;
  };
}

// Define item types
enum ItemType {
  COPPER_ORE = 'copper_ore',
  TIN_ORE = 'tin_ore',
  BRONZE_BAR = 'bronze_bar',
  IRON_ORE = 'iron_ore',
  IRON_BAR = 'iron_bar',
  COAL = 'coal',
  STEEL_BAR = 'steel_bar',
  GOLD_ORE = 'gold_ore',
  GOLD_BAR = 'gold_bar',
  MITHRIL_ORE = 'mithril_ore',
  MITHRIL_BAR = 'mithril_bar'
}

// Smithing modes
export enum SmithingMode {
  SMELTING = 'smelting',
  SMITHING = 'smithing'
}

// Define smelting recipes
interface SmeltingRecipe {
  resultItem: ItemType;
  requiredLevel: number;
  experienceReward: number;
  ingredients: { type: ItemType; count: number }[];
}

// Smelting recipes
const SMELTING_RECIPES: { [key: string]: SmeltingRecipe } = {
  BRONZE_BAR: {
    resultItem: ItemType.BRONZE_BAR,
    requiredLevel: 1,
    experienceReward: 6,
    ingredients: [
      { type: ItemType.COPPER_ORE, count: 1 },
      { type: ItemType.TIN_ORE, count: 1 }
    ]
  },
  IRON_BAR: {
    resultItem: ItemType.IRON_BAR,
    requiredLevel: 15,
    experienceReward: 12,
    ingredients: [
      { type: ItemType.IRON_ORE, count: 1 }
    ]
  },
  STEEL_BAR: {
    resultItem: ItemType.STEEL_BAR,
    requiredLevel: 30,
    experienceReward: 17,
    ingredients: [
      { type: ItemType.IRON_ORE, count: 1 },
      { type: ItemType.COAL, count: 1 }
    ]
  },
  GOLD_BAR: {
    resultItem: ItemType.GOLD_BAR,
    requiredLevel: 40,
    experienceReward: 22,
    ingredients: [
      { type: ItemType.GOLD_ORE, count: 1 }
    ]
  },
  MITHRIL_BAR: {
    resultItem: ItemType.MITHRIL_BAR,
    requiredLevel: 50,
    experienceReward: 30,
    ingredients: [
      { type: ItemType.MITHRIL_ORE, count: 1 },
      { type: ItemType.COAL, count: 2 }
    ]
  }
};

export class SmithingHandler {
  private io: Server;
  private players: PlayersStore;
  private playerSmithing: Record<string, { mode: SmithingMode; recipe: string; progress: number }> = {};

  constructor(io: Server, players: PlayersStore) {
    this.io = io;
    this.players = players;
  }

  /**
   * Setup all smithing-related socket handlers
   */
  public setupSmithingHandlers(socket: ExtendedSocket): void {
    this.setupStartSmithingHandler(socket);
    this.setupCompleteSmithingHandler(socket);
    this.setupCancelSmithingHandler(socket);
  }

  /**
   * Setup the handler for starting a smithing action
   */
  private setupStartSmithingHandler(socket: ExtendedSocket): void {
    socket.on('startSmithing', async (data: { barType?: string; itemType?: string; mode: SmithingMode }) => {
      try {
        console.log(`Player ${socket.id} started ${data.mode === SmithingMode.SMELTING ? 'smelting' : 'smithing'}`);
        
        const player = this.players[socket.id];
        if (!player) {
          socket.emit('error', 'Player not found');
          return;
        }

        // For now, we're only implementing smelting
        if (data.mode === SmithingMode.SMELTING && data.barType) {
          await this.handleSmelting(socket, data.barType);
        } else {
          socket.emit('error', 'Invalid smithing action');
        }
      } catch (error) {
        console.error('Error in startSmithing handler:', error);
        socket.emit('error', 'Failed to start smithing');
      }
    });
  }

  /**
   * Setup the handler for completing a smithing action
   */
  private setupCompleteSmithingHandler(socket: ExtendedSocket): void {
    socket.on('completeSmithing', async (data: { mode: SmithingMode }) => {
      try {
        console.log(`Player ${socket.id} completed ${data.mode}`);
        delete this.playerSmithing[socket.id];
      } catch (error) {
        console.error('Error in completeSmithing handler:', error);
        socket.emit('error', 'Failed to complete smithing');
      }
    });
  }

  /**
   * Setup the handler for canceling a smithing action
   */
  private setupCancelSmithingHandler(socket: ExtendedSocket): void {
    socket.on('cancelSmithing', () => {
      console.log(`Player ${socket.id} canceled smithing`);
      delete this.playerSmithing[socket.id];
    });
  }

  /**
   * Handle the smelting of a bar
   */
  private async handleSmelting(socket: ExtendedSocket, barType: string): Promise<void> {
    const player = this.players[socket.id];
    const recipe = SMELTING_RECIPES[barType];

    if (!recipe) {
      socket.emit('error', 'Invalid recipe');
      return;
    }

    // Check if player has the required level
    const smithingLevel = player.skills?.smithing?.level || 1;
    if (smithingLevel < recipe.requiredLevel) {
      socket.emit('error', `Smithing level ${recipe.requiredLevel} required to smelt ${barType}`);
      return;
    }

    // Check if player has the required items
    for (const ingredient of recipe.ingredients) {
      const playerItems = player.inventory.filter(item => item.type === ingredient.type);
      const totalCount = playerItems.reduce((sum: number, item: { quantity?: number }) => sum + (item.quantity || 1), 0);
      
      if (totalCount < ingredient.count) {
        socket.emit('error', `Not enough ${ingredient.type.replace('_', ' ')} to smelt ${barType}`);
        return;
      }
    }

    // Remove ingredients from inventory
    for (const ingredient of recipe.ingredients) {
      let remainingToRemove = ingredient.count;
      
      // Filter just the ingredients we need
      const matchingItems = player.inventory.filter(item => item.type === ingredient.type);
      
      for (const item of matchingItems) {
        if (remainingToRemove <= 0) break;
        
        const itemQuantity = item.quantity || 1;
        
        if (itemQuantity <= remainingToRemove) {
          // Remove entire item
          player.inventory = player.inventory.filter(i => i.id !== item.id);
          remainingToRemove -= itemQuantity;
        } else {
          // Reduce quantity
          item.quantity = itemQuantity - remainingToRemove;
          remainingToRemove = 0;
        }
      }
    }

    // Add the result to the player's inventory
    const resultItem = {
      id: uuidv4(),
      type: recipe.resultItem,
      quantity: 1
    };
    
    player.inventory.push(resultItem);

    // Update the player's inventory
    socket.emit('inventoryUpdate', player.inventory);

    // Add experience to player's smithing skill
    if (!player.skills) {
      player.skills = {};
    }
    
    if (!player.skills.smithing) {
      player.skills.smithing = { level: 1, experience: 0 };
    }
    
    player.skills.smithing.experience += recipe.experienceReward;
    
    // Calculate new level based on experience
    // This is a simplified version - you might have a more complex level calculation
    const newLevel = Math.floor(1 + Math.sqrt(player.skills.smithing.experience / 100));
    if (newLevel > player.skills.smithing.level) {
      player.skills.smithing.level = newLevel;
      socket.emit('notification', {
        message: `Congratulations! Your Smithing level is now ${newLevel}`,
        type: 'level-up'
      });
    }

    // Update the client with the new skill level
    socket.emit('skillsUpdate', player.skills);

    // Notify the client that smelting was successful
    socket.emit('chatMessage', {
      content: `You successfully smelted a ${recipe.resultItem.replace('_', ' ')}.`,
      type: 'action',
      timestamp: Date.now()
    });

    // Save inventory to database if user is authenticated
    if (socket.user && socket.user.id) {
      await savePlayerInventory(socket.user.id, player.inventory);
    }
  }
} 