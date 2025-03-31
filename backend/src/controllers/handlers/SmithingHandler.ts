import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { savePlayerInventory, savePlayerSkills } from '../../models/gameModel';

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
    count?: number;
  }[];
  skills?: {
    [key: string]: {
      level: number;
      experience: number;
      xp?: number;
    };
  };
  userId?: string;
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
  MITHRIL_BAR = 'mithril_bar',
  BRONZE_SWORD = 'bronze_sword',
  BRONZE_PICKAXE = 'bronze_pickaxe',
  BRONZE_AXE = 'bronze_axe',
  IRON_SWORD = 'iron_sword',
  IRON_PICKAXE = 'iron_pickaxe',
  IRON_AXE = 'iron_axe',
  STEEL_SWORD = 'steel_sword',
  STEEL_PICKAXE = 'steel_pickaxe',
  STEEL_AXE = 'steel_axe'
}

// Smithing modes
export enum SmithingMode {
  SMELTING = 'smelting',
  SMITHING = 'smithing'
}

// Define smelting recipes
interface SmithingRecipe {
  resultItem: ItemType;
  requiredLevel: number;
  experienceReward: number;
  ingredients: { type: ItemType; count: number }[];
}

// Smelting recipes
const SMELTING_RECIPES: { [key: string]: SmithingRecipe } = {
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

// Smithing recipes for creating items from bars
const SMITHING_RECIPES: { [key: string]: SmithingRecipe } = {
  BRONZE_SWORD: {
    resultItem: ItemType.BRONZE_SWORD,
    requiredLevel: 4,
    experienceReward: 12,
    ingredients: [
      { type: ItemType.BRONZE_BAR, count: 1 }
    ]
  },
  BRONZE_PICKAXE: {
    resultItem: ItemType.BRONZE_PICKAXE,
    requiredLevel: 5,
    experienceReward: 15,
    ingredients: [
      { type: ItemType.BRONZE_BAR, count: 2 }
    ]
  },
  BRONZE_AXE: {
    resultItem: ItemType.BRONZE_AXE,
    requiredLevel: 6,
    experienceReward: 15,
    ingredients: [
      { type: ItemType.BRONZE_BAR, count: 2 }
    ]
  },
  IRON_SWORD: {
    resultItem: ItemType.IRON_SWORD,
    requiredLevel: 20,
    experienceReward: 25,
    ingredients: [
      { type: ItemType.IRON_BAR, count: 1 }
    ]
  },
  IRON_PICKAXE: {
    resultItem: ItemType.IRON_PICKAXE,
    requiredLevel: 25,
    experienceReward: 30,
    ingredients: [
      { type: ItemType.IRON_BAR, count: 2 }
    ]
  },
  IRON_AXE: {
    resultItem: ItemType.IRON_AXE,
    requiredLevel: 26,
    experienceReward: 30,
    ingredients: [
      { type: ItemType.IRON_BAR, count: 2 }
    ]
  },
  STEEL_SWORD: {
    resultItem: ItemType.STEEL_SWORD,
    requiredLevel: 35,
    experienceReward: 37,
    ingredients: [
      { type: ItemType.STEEL_BAR, count: 1 }
    ]
  },
  STEEL_PICKAXE: {
    resultItem: ItemType.STEEL_PICKAXE,
    requiredLevel: 40,
    experienceReward: 40,
    ingredients: [
      { type: ItemType.STEEL_BAR, count: 2 }
    ]
  },
  STEEL_AXE: {
    resultItem: ItemType.STEEL_AXE,
    requiredLevel: 41,
    experienceReward: 40,
    ingredients: [
      { type: ItemType.STEEL_BAR, count: 2 }
    ]
  }
};

export class SmithingHandler {
  private io: Server;
  private players: Record<string, any>;
  private playerSmithing: Record<string, NodeJS.Timeout> = {};

  constructor(io: Server, players: Record<string, any>) {
    this.io = io;
    this.players = players;
  }

  /**
   * Setup all smithing-related socket handlers
   */
  public setupSmithingHandlers(socket: any): void {
    this.setupStartSmeltingHandler(socket);
    this.setupStartSmithingHandler(socket);
    this.setupCancelSmithingHandler(socket);
  }

  /**
   * Setup the handler for starting smelting
   */
  private setupStartSmeltingHandler(socket: any): void {
    socket.on('startSmelting', (data: { barType: string, mode: SmithingMode }) => {
      try {
        console.log(`Player ${socket.id} started smelting a ${data.barType}`);
        
        const player = this.players[socket.id];
        if (!player) {
          console.error(`Player ${socket.id} not found`);
          socket.emit('smithingError', { message: 'Player not found' });
          return;
        }
        
        // Get the recipe for this bar
        const recipe = SMELTING_RECIPES[data.barType];
        if (!recipe) {
          console.error(`Invalid bar type: ${data.barType}`);
          socket.emit('smithingError', { message: 'Invalid recipe' });
          return;
        }
        
        // Check if player has required level
        const smithingLevel = player.skills?.smithing?.level || 1;
        if (smithingLevel < recipe.requiredLevel) {
          console.log(`Player ${socket.id} does not have required smithing level ${recipe.requiredLevel}`);
          socket.emit('smithingError', { message: `Requires smithing level ${recipe.requiredLevel}` });
          return;
        }
        
        // Calculate maximum number of bars that can be created based on available ingredients
        let maxBars = Infinity;
        recipe.ingredients.forEach(ingredient => {
          const playerItem = player.inventory.find((item: any) => item.type === ingredient.type);
          const availableCount = playerItem ? (playerItem.count || playerItem.quantity || 0) : 0;
          const possibleBars = Math.floor(availableCount / ingredient.count);
          maxBars = Math.min(maxBars, possibleBars);
        });
        
        if (maxBars <= 0) {
          console.log(`Player ${socket.id} does not have required items for ${data.barType}`);
          socket.emit('smithingError', { message: 'You don\'t have the required materials' });
          return;
        }
        
        console.log(`Player ${socket.id} can smelt up to ${maxBars} ${data.barType}`);
        
        // Maximum of 28 items to simulate inventory space limitations (typical MMO inventory size)
        const MAX_INVENTORY_SIZE = 28;
        const currentInventorySize = player.inventory.length;
        
        // Check if player has an existing stack of the result item
        const existingItemIndex = player.inventory.findIndex((item: any) => item.type === recipe.resultItem);
        
        // If there's no existing stack and inventory is full, limit bars
        if (existingItemIndex === -1 && currentInventorySize >= MAX_INVENTORY_SIZE) {
          console.log(`Player ${socket.id} inventory is full`);
          socket.emit('smithingError', { message: 'Your inventory is full' });
          return;
        }
        
        // Track bars to be created
        let barsToCreate = maxBars;
        
        // Start smelting process for multiple bars
        let barsCompleted = 0;
        let currentBarProgress = 0;
        
        // Clear any existing interval
        if (this.playerSmithing[socket.id]) {
          clearInterval(this.playerSmithing[socket.id]);
        }
        
        // Function to update total progress
        const getOverallProgress = () => {
          if (barsToCreate === 0) return 1;
          return (barsCompleted + currentBarProgress / 100) / barsToCreate;
        };
        
        // Create the interval for smelting progress
        const progressInterval = setInterval(() => {
          // Update progress for current bar
          currentBarProgress += 10;
          
          // Send progress update to client
          const overallProgress = getOverallProgress();
          socket.emit('smithingProgress', { progress: overallProgress });
          
          // Check if current bar is complete
          if (currentBarProgress >= 100) {
            // Process one completed bar
            
            // Remove ingredients from inventory for this bar
            recipe.ingredients.forEach(ingredient => {
              const playerItemIndex = player.inventory.findIndex((item: any) => item.type === ingredient.type);
              if (playerItemIndex !== -1) {
                const playerItem = player.inventory[playerItemIndex];
                // Handle count or quantity property
                if (playerItem.count !== undefined) {
                  playerItem.count -= ingredient.count;
                  if (playerItem.count <= 0) {
                    player.inventory.splice(playerItemIndex, 1);
                  }
                } else if (playerItem.quantity !== undefined) {
                  playerItem.quantity -= ingredient.count;
                  if (playerItem.quantity <= 0) {
                    player.inventory.splice(playerItemIndex, 1);
                  }
                }
              }
            });
            
            // Add the bar to player's inventory
            const existingItemIndex = player.inventory.findIndex((item: any) => item.type === recipe.resultItem);
            
            if (existingItemIndex !== -1) {
              // Player already has this item, just increment count/quantity
              const existingItem = player.inventory[existingItemIndex];
              if (existingItem.count !== undefined) {
                existingItem.count += 1;
              } else if (existingItem.quantity !== undefined) {
                existingItem.quantity += 1;
              }
            } else {
              // Add new item to inventory
              player.inventory.push({
                type: recipe.resultItem,
                count: 1
              });
            }
            
            // Send updated inventory to client after each bar is processed
            socket.emit('inventoryUpdate', { 
              inventory: player.inventory 
            });
            
            // Add experience for smithing
            if (!player.skills) {
              player.skills = {};
            }
            
            if (!player.skills.smithing) {
              player.skills.smithing = { level: 1, xp: 0 };
            }
            
            // Handle different property names (xp vs experience)
            if (player.skills.smithing.xp !== undefined) {
              player.skills.smithing.xp += recipe.experienceReward;
              
              // Check for level up
              const oldLevel = player.skills.smithing.level;
              const newLevel = Math.floor(1 + Math.sqrt(player.skills.smithing.xp / 100));
              
              if (newLevel > oldLevel) {
                player.skills.smithing.level = newLevel;
                socket.emit('levelUp', {
                  skill: 'smithing',
                  level: newLevel
                });
              }
            } else if (player.skills.smithing.experience !== undefined) {
              player.skills.smithing.experience += recipe.experienceReward;
              
              // Check for level up
              const oldLevel = player.skills.smithing.level;
              const newLevel = Math.floor(1 + Math.sqrt(player.skills.smithing.experience / 100));
              
              if (newLevel > oldLevel) {
                player.skills.smithing.level = newLevel;
                socket.emit('levelUp', {
                  skill: 'smithing',
                  level: newLevel
                });
              }
            }
            
            // Increment completed bars counter
            barsCompleted++;
            
            // Reset progress for next bar
            currentBarProgress = 0;
            
            // Check if we've created all planned bars or should continue
            // Recalculate max possible bars for the next iteration
            let canContinue = false;
            
            if (barsCompleted < barsToCreate) {
              // Check if we still have materials for the next bar
              let hasMaterials = true;
              recipe.ingredients.forEach(ingredient => {
                const playerItem = player.inventory.find((item: any) => item.type === ingredient.type);
                const availableCount = playerItem ? (playerItem.count || playerItem.quantity || 0) : 0;
                if (availableCount < ingredient.count) {
                  hasMaterials = false;
                }
              });
              
              // Check if we have inventory space
              const inventoryFull = existingItemIndex === -1 && player.inventory.length >= MAX_INVENTORY_SIZE;
              
              // Continue only if we have materials and inventory space
              canContinue = hasMaterials && !inventoryFull;
            }
            
            // If we can't continue or have finished all bars, complete the process
            if (!canContinue || barsCompleted >= barsToCreate) {
              clearInterval(progressInterval);
              socket.emit('smithingComplete', { barsCreated: barsCompleted });
              
              // Save player data
              if (player.userId) {
                savePlayerInventory(player.userId, player.inventory)
                  .catch((error: Error) => console.error('Error saving player inventory:', error));
                  
                savePlayerSkills(player.userId, player.skills)
                  .catch((error: Error) => console.error('Error saving player skills:', error));
              }
              
              // Clean up interval reference
              delete this.playerSmithing[socket.id];
            }
          }
        }, 500);
        
        // Store the interval ID to cancel if needed
        this.playerSmithing[socket.id] = progressInterval;
      } catch (error) {
        console.error('Error in startSmelting handler:', error);
        socket.emit('smithingError', { message: 'Internal server error' });
      }
    });
  }
  
  /**
   * Setup the handler for starting smithing
   */
  private setupStartSmithingHandler(socket: any): void {
    socket.on('startSmithing', (data: { itemType: string, mode: SmithingMode }) => {
      try {
        console.log(`Player ${socket.id} started smithing a ${data.itemType}`);
        
        const player = this.players[socket.id];
        if (!player) {
          console.error(`Player ${socket.id} not found`);
          return;
        }
        
        // Get the recipe for this item
        const recipe = SMITHING_RECIPES[data.itemType];
        if (!recipe) {
          console.error(`Invalid item type: ${data.itemType}`);
          return;
        }
        
        // Check if player has required level
        const smithingLevel = player.skills?.smithing?.level || 1;
        if (smithingLevel < recipe.requiredLevel) {
          console.log(`Player ${socket.id} does not have required smithing level ${recipe.requiredLevel}`);
          return;
        }
        
        // Check if player has required items
        const hasItems = recipe.ingredients.every(ingredient => {
          const playerItem = player.inventory.find((item: any) => item.type === ingredient.type);
          return playerItem && (playerItem.count || playerItem.quantity) >= ingredient.count;
        });
        
        if (!hasItems) {
          console.log(`Player ${socket.id} does not have required items for ${data.itemType}`);
          return;
        }
        
        // Remove ingredients from inventory
        recipe.ingredients.forEach(ingredient => {
          const playerItemIndex = player.inventory.findIndex((item: any) => item.type === ingredient.type);
          if (playerItemIndex !== -1) {
            const playerItem = player.inventory[playerItemIndex];
            // Handle count or quantity property
            if (playerItem.count !== undefined) {
              playerItem.count -= ingredient.count;
              if (playerItem.count <= 0) {
                player.inventory.splice(playerItemIndex, 1);
              }
            } else if (playerItem.quantity !== undefined) {
              playerItem.quantity -= ingredient.count;
              if (playerItem.quantity <= 0) {
                player.inventory.splice(playerItemIndex, 1);
              }
            }
          }
        });
        
        // Start smithing progress simulation
        let progress = 0;
        const progressInterval = setInterval(() => {
          progress += 10;
          socket.emit('smithingProgress', { progress });
          
          if (progress >= 100) {
            clearInterval(progressInterval);
            
            // Add the crafted item to player's inventory
            const existingItemIndex = player.inventory.findIndex((item: any) => item.type === recipe.resultItem);
            
            if (existingItemIndex !== -1) {
              // Player already has this item, just increment count/quantity
              const existingItem = player.inventory[existingItemIndex];
              if (existingItem.count !== undefined) {
                existingItem.count += 1;
              } else if (existingItem.quantity !== undefined) {
                existingItem.quantity += 1;
              }
            } else {
              // Add new item to inventory
              player.inventory.push({
                type: recipe.resultItem,
                count: 1
              });
            }
            
            // Send updated inventory to client after each bar is processed
            socket.emit('inventoryUpdate', { 
              inventory: player.inventory 
            });
            
            // Add experience for smithing
            if (!player.skills) {
              player.skills = {};
            }
            
            if (!player.skills.smithing) {
              player.skills.smithing = { level: 1, xp: 0 };
            }
            
            // Handle different property names (xp vs experience)
            if (player.skills.smithing.xp !== undefined) {
              player.skills.smithing.xp += recipe.experienceReward;
              
              // Check for level up
              const oldLevel = player.skills.smithing.level;
              const newLevel = Math.floor(1 + Math.sqrt(player.skills.smithing.xp / 100));
              
              if (newLevel > oldLevel) {
                player.skills.smithing.level = newLevel;
                socket.emit('levelUp', {
                  skill: 'smithing',
                  level: newLevel
                });
              }
            } else if (player.skills.smithing.experience !== undefined) {
              player.skills.smithing.experience += recipe.experienceReward;
              
              // Check for level up
              const oldLevel = player.skills.smithing.level;
              const newLevel = Math.floor(1 + Math.sqrt(player.skills.smithing.experience / 100));
              
              if (newLevel > oldLevel) {
                player.skills.smithing.level = newLevel;
                socket.emit('levelUp', {
                  skill: 'smithing',
                  level: newLevel
                });
              }
            }
            
            // Send completion event
            socket.emit('smithingComplete');
            
            // Clean up interval reference
            delete this.playerSmithing[socket.id];
            
            // Save player data
            if (player.userId) {
              savePlayerInventory(player.userId, player.inventory)
                .catch((error: Error) => console.error('Error saving player inventory:', error));
                
              savePlayerSkills(player.userId, player.skills)
                .catch((error: Error) => console.error('Error saving player skills:', error));
            }
          }
        }, 500);
        
        // Store the interval ID to cancel if needed
        this.playerSmithing[socket.id] = progressInterval;
      } catch (error) {
        console.error('Error in startSmithing handler:', error);
      }
    });
  }
  
  /**
   * Setup the handler for canceling smithing
   */
  private setupCancelSmithingHandler(socket: any): void {
    socket.on('cancelSmelting', () => {
      this.cancelSmithing(socket);
    });
    
    socket.on('cancelSmithing', () => {
      this.cancelSmithing(socket);
    });
  }
  
  /**
   * Cancel an active smithing operation
   */
  private cancelSmithing(socket: any): void {
    try {
      // Clear any existing smithing interval
      if (this.playerSmithing[socket.id]) {
        clearInterval(this.playerSmithing[socket.id]);
        delete this.playerSmithing[socket.id];
        console.log(`Player ${socket.id} cancelled smithing operation`);
      }
    } catch (error) {
      console.error('Error in cancel smithing handler:', error);
    }
  }
} 