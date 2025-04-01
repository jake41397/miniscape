import { Server, Socket } from 'socket.io';
import { v4 as uuidv4 } from 'uuid';
import { savePlayerInventory, savePlayerSkills } from '../../models/gameModel';
import { Player } from '../types';
import { ExperienceHandler, SkillType } from './ExperienceHandler';

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

// Define smithing recipe interface
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
  private players: Record<string, Player>;
  private playerSmithing: Record<string, NodeJS.Timeout> = {};
  private experienceHandler: ExperienceHandler;

  constructor(io: Server, players: Record<string, Player>, experienceHandler: ExperienceHandler) {
    this.io = io;
    this.players = players;
    this.experienceHandler = experienceHandler;
  }

  /**
   * Setup all smithing-related socket handlers
   */
  public setupSmithingHandlers(socket: any): void {
    console.log(`[SMITHING] Setting up smithing handlers for socket ${socket.id}`);
    
    // Remove any existing listeners
    socket.removeAllListeners('smeltBronzeBar');
    socket.removeAllListeners('startSmithing');
    
    // Add handler for bronze bar smelting
    socket.on('smeltBronzeBar', (data: { inventory: any[], skills: any, recipe?: string }, callback: Function) => {
      console.log(`[SMITHING] Received smeltBronzeBar request from ${socket.id}`, {
        inventorySize: data.inventory.length,
        hasSkills: !!data.skills,
        skillsData: JSON.stringify(data.skills),
        recipe: data.recipe || 'BRONZE_BAR'
      });

      try {
        const player = this.players[socket.id];
        if (!player) {
          console.log(`[SMITHING] Player ${socket.id} not found`);
          callback({ success: false, error: 'Player not found' });
          return;
        }

        console.log(`[SMITHING] Found player ${socket.id}, checking requirements...`);

        // Get recipe (default to BRONZE_BAR if not specified)
        const recipeKey = data.recipe || 'BRONZE_BAR';
        const recipe = SMELTING_RECIPES[recipeKey];
        
        if (!recipe) {
          console.log(`[SMITHING] Invalid recipe: ${recipeKey}`);
          callback({ success: false, error: 'Invalid recipe' });
          return;
        }

        // Check smithing level
        const smithingLevel = player.skills?.smithing?.level || 1;
        console.log(`[SMITHING] Player smithing level: ${smithingLevel}, required: ${recipe.requiredLevel}`);

        if (smithingLevel < recipe.requiredLevel) {
          console.log(`[SMITHING] Player ${socket.id} lacks required level ${recipe.requiredLevel}, has ${smithingLevel}`);
          callback({ success: false, error: `Requires smithing level ${recipe.requiredLevel}` });
          return;
        }

        // Check ingredients with detailed logging
        console.log(`[SMITHING] Checking ingredients in inventory:`, JSON.stringify(player.inventory));
        let missingIngredients: string[] = [];
        
        const hasIngredients = recipe.ingredients.every(ingredient => {
          // Case insensitive match for item types
          const playerItem = player.inventory.find((item: any) => 
            item.type.toLowerCase() === ingredient.type.toLowerCase()
          );
          const itemCount = playerItem ? (playerItem.count || playerItem.quantity || 0) : 0;
          console.log(`[SMITHING] Checking ${ingredient.type}: need ${ingredient.count}, has ${itemCount}`);
          
          if (!playerItem || itemCount < ingredient.count) {
            missingIngredients.push(ingredient.type);
            return false;
          }
          return true;
        });

        if (!hasIngredients) {
          console.log(`[SMITHING] Player ${socket.id} missing ingredients: ${missingIngredients.join(', ')}`);
          callback({ 
            success: false, 
            error: `Missing required ingredients: ${missingIngredients.join(', ')}`,
            updatedInventory: player.inventory // Return the current inventory so client stays in sync
          });
          return;
        }

        console.log(`[SMITHING] All requirements met, processing smelting...`);

        // Remove ingredients from inventory
        recipe.ingredients.forEach(ingredient => {
          const playerItemIndex = player.inventory.findIndex((item: any) => 
            item.type.toLowerCase() === ingredient.type.toLowerCase()
          );
          if (playerItemIndex !== -1) {
            const playerItem = player.inventory[playerItemIndex];
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

        // Add resulting bar to inventory, ensuring correct format
        const existingBarIndex = player.inventory.findIndex((item) => item.type === recipe.resultItem);
        if (existingBarIndex !== -1) {
          const existingBar = player.inventory[existingBarIndex];
          existingBar.quantity = (existingBar.quantity || 0) + 1; 
        } else {
          player.inventory.push({
            id: uuidv4(),
            type: recipe.resultItem,
            quantity: 1
          });
        }

        // --- START REFACTORED XP LOGIC ---
        const experienceToAdd = recipe.experienceReward;
        let xpGained = 0;

        if (experienceToAdd > 0) {
          // Use the centralized ExperienceHandler
          const xpResult = this.experienceHandler.addExperience(player, SkillType.SMITHING, experienceToAdd);

          if (xpResult) {
            xpGained = experienceToAdd;

            // Check for level up using the result
            if (xpResult.leveledUp) {
              console.log(`[SMITHING] Player ${socket.id} leveled up Smithing to level ${xpResult.newLevel}!`);
              socket.emit('levelUp', {
                skill: SkillType.SMITHING,
                level: xpResult.newLevel
              });
              socket.emit('chatMessage', { 
                content: `Congratulations! You've reached Smithing level ${xpResult.newLevel}!`, 
                type: 'system', 
                timestamp: Date.now() 
              });
            }

            // Emit experience gained event
            socket.emit('experienceGained', {
              skill: SkillType.SMITHING,
              experience: experienceToAdd,
              totalExperience: xpResult.newExperience,
              level: xpResult.newLevel
            });

            // Save skills (ExperienceHandler modified player object directly)
            if (player.userId) {
              savePlayerSkills(player.userId, player.skills)
                .catch((error: Error) => console.error('[SMITHING] Error saving player skills:', error));
            } else {
               console.warn(`[SMITHING] Player ${socket.id} not authenticated, skills not saved.`);
            }
          } else {
             console.warn(`[SMITHING] addExperience returned null for player ${socket.id}. XP not added.`);
          }
        }
        // --- END REFACTORED XP LOGIC ---

        console.log(`[SMITHING] Successfully smelted bronze bar for player ${socket.id}, gained ${xpGained} XP.`);

        // Save player inventory
        if (player.userId) {
          savePlayerInventory(player.userId, player.inventory)
            .catch((error: Error) => console.error('[SMITHING] Error saving player inventory:', error));
        }

        // Send success response with updated inventory
        callback({
          success: true,
          updatedInventory: player.inventory
        });

      } catch (error) {
        console.error('[SMITHING] Error in smeltBronzeBar handler:', error);
        // Return a graceful error to the client
        callback({ 
          success: false, 
          error: 'Processing error occurred. Please try again.',
          // If we can access player inventory, return it to keep client in sync
          updatedInventory: this.players[socket.id]?.inventory || []
        });
      }
    });

    // Add handler for smithing items from bars
    // ... implement startSmithing handler if needed ...
  }
} 