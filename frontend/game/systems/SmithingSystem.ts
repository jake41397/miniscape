import * as THREE from 'three';
import { getSocket } from '../network/socket';
import { ItemType } from '../../types/player';
import { addExperience } from '../state/SkillSystem';
import { SkillType } from '../../components/ui/SkillsPanel';
import soundManager from '../audio/soundManager';

// Smithing mode - only SMELTING for now
export enum SmithingMode {
  SMELTING = 'smelting',
  SMITHING = 'smithing'
}

// Recipe ingredient interface
interface RecipeIngredient {
  type: ItemType;
  count: number;
}

// Smelting recipe interface
export interface SmeltingRecipe {
  resultItem: ItemType;
  requiredLevel: number;
  experienceReward: number;
  ingredients: RecipeIngredient[];
}

// Smelting recipes
export const SMELTING_RECIPES: { [key: string]: SmeltingRecipe } = {
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

// Smithing recipe interface (for creating items from bars)
export interface SmithingRecipe {
  resultItem: ItemType;
  requiredLevel: number;
  experienceReward: number;
  ingredients: RecipeIngredient[];
}

// Smithing recipes for creating tools and weapons from bars
export const SMITHING_RECIPES: { [key: string]: SmithingRecipe } = {
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

// SmithingSystem class
export class SmithingSystem {
  private playerRef: React.MutableRefObject<THREE.Mesh | null>;
  private isProcessing: boolean = false;
  
  constructor(playerRef: React.MutableRefObject<THREE.Mesh | null>) {
    this.playerRef = playerRef;
  }

  // Check if player has the required ingredients for smelting
  public canSmeltBar(barType: string, inventory: { type: ItemType, count: number }[]): boolean {
    const recipe = SMELTING_RECIPES[barType];
    if (!recipe) return false;
    
    // Check if player has all required ingredients
    return recipe.ingredients.every(ingredient => {
      const playerItem = inventory.find(item => item.type === ingredient.type);
      return playerItem && playerItem.count >= ingredient.count;
    });
  }
  
  // Check if player has the required ingredients for smithing an item
  public canSmithItem(itemType: string, inventory: { type: ItemType, count: number }[]): boolean {
    const recipe = SMITHING_RECIPES[itemType];
    if (!recipe) return false;
    
    // Check if player has all required ingredients
    return recipe.ingredients.every(ingredient => {
      const playerItem = inventory.find(item => item.type === ingredient.type);
      return playerItem && playerItem.count >= ingredient.count;
    });
  }
  
  // Start smelting a bar
  public startSmelting(barType: string, inventory: { type: ItemType, count: number }[], playerSkills: any): void {
    console.log(`[SMELTING] Starting smelting request for ${barType}`);
    
    // Only handle bronze bar smelting for now
    if (barType !== 'BRONZE_BAR') {
      console.log('[SMELTING] Only bronze bar smelting is supported');
      return;
    }

    const recipe = SMELTING_RECIPES[barType];
    if (!recipe) {
      console.log('[SMELTING] Invalid recipe');
      return;
    }

    // Check level requirement
    const smithingLevel = playerSkills[SkillType.SMITHING]?.level || 1;
    if (smithingLevel < recipe.requiredLevel) {
      console.log(`[SMELTING] Requires smithing level ${recipe.requiredLevel}`);
      return;
    }

    // Check ingredients
    const hasIngredients = this.canSmeltBar(barType, inventory);
    if (!hasIngredients) {
      console.log('[SMELTING] Missing required ingredients');
      return;
    }

    // Get socket and emit simple smelting request
    console.log('[SMELTING] Getting socket to emit smeltBronzeBar event...');
    getSocket().then(socket => {
      if (!socket) {
        console.error('[SMELTING] Socket not available');
        return;
      }

      console.log('[SMELTING] Socket available, emitting smeltBronzeBar event with data:', {
        inventory: inventory.length + ' items',
        hasSkills: !!playerSkills
      });

      socket.emit('smeltBronzeBar', {
        inventory,
        skills: playerSkills
      }, (response: { success: boolean, error?: string, updatedInventory?: any[] }) => {
        console.log('[SMELTING] Received response from server:', response);
        
        if (response.success) {
          // Play success sound
          soundManager.play('mining_hit');
          
          // Update inventory in window global
          if (window.playerInventory && response.updatedInventory) {
            window.playerInventory = response.updatedInventory;
          }
          
          // Dispatch inventory update event
          const inventoryUpdateEvent = new CustomEvent('inventory-updated', {
            detail: { inventory: response.updatedInventory },
            bubbles: true
          });
          document.dispatchEvent(inventoryUpdateEvent);
          
          // Show success notification as chat message
          const chatEvent = new CustomEvent('chat-message', {
            detail: { 
              content: 'Successfully smelted a bronze bar!',
              type: 'success',
              timestamp: Date.now()
            },
            bubbles: true
          });
          document.dispatchEvent(chatEvent);
        } else {
          console.error('[SMELTING] Server returned error:', response.error);
          // Show error notification as chat message
          const chatEvent = new CustomEvent('chat-message', {
            detail: { 
              content: response.error || 'Failed to smelt bronze bar',
              type: 'error',
              timestamp: Date.now()
            },
            bubbles: true
          });
          document.dispatchEvent(chatEvent);
        }
      });

      console.log('[SMELTING] Event emitted, waiting for response...');
    }).catch(error => {
      console.error('[SMELTING] Error getting socket:', error);
    });
  }
  
  // Cancel any active smithing operation
  public cancelSmelting(): void {
    if (!this.isProcessing) return;
    
    this.isProcessing = false;
    
    // Emit cancel event to server
    const socket = getSocket();
    if (socket) {
      socket.then(socket => {
        if (socket) {
          socket.emit('cancelSmelting' as any);
        }
      });
    }
  }
  
  // Start smithing an item
  public startSmithing(itemType: string, inventory: { type: ItemType, count: number }[], playerSkills: any): void {
    if (this.isProcessing) return;
    
    const recipe = SMITHING_RECIPES[itemType];
    if (!recipe) return;
    
    // Check if player has the required level
    const smithingLevel = playerSkills[SkillType.SMITHING]?.level || 1;
    if (smithingLevel < recipe.requiredLevel) {
      console.log(`Smithing level ${recipe.requiredLevel} required to smith ${itemType}`);
      return;
    }
    
    // Check if player has the required items
    if (!this.canSmithItem(itemType, inventory)) {
      console.log(`Missing required items to smith ${itemType}`);
      return;
    }
    
    // Start smithing process
    this.isProcessing = true;
    
    // Play smithing sound
    soundManager.play('mining_hit'); // Reusing mining sound for now
    
    // Emit smithing start event
    const socket = getSocket();
    if (socket) {
      socket.then(socket => {
        if (socket) {
          socket.emit('startSmithing' as any, {
            itemType,
            mode: SmithingMode.SMITHING
          });
        }
      });
    }
  }
  
  // Create a furnace mesh for the scene
  public static createFurnaceMesh(): THREE.Group {
    const furnaceGroup = new THREE.Group();
    
    // Furnace base - cylinder
    const baseGeometry = new THREE.CylinderGeometry(1.5, 2, 2, 8);
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x777777 });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 1;
    furnaceGroup.add(base);
    
    // Furnace top - smaller cylinder
    const topGeometry = new THREE.CylinderGeometry(1, 1.5, 1, 8);
    const topMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.y = 2.5;
    furnaceGroup.add(top);
    
    // Furnace opening - half sphere
    const openingGeometry = new THREE.SphereGeometry(0.8, 8, 8, 0, Math.PI);
    const openingMaterial = new THREE.MeshBasicMaterial({ color: 0xff6600 });
    const opening = new THREE.Mesh(openingGeometry, openingMaterial);
    opening.rotation.x = Math.PI / 2;
    opening.position.set(0, 1.5, 1.2);
    furnaceGroup.add(opening);
    
    // Add glow effect for the furnace
    const glowGeometry = new THREE.SphereGeometry(0.3, 8, 8);
    const glowMaterial = new THREE.MeshBasicMaterial({
      color: 0xff9900,
      transparent: true,
      opacity: 0.7
    });
    const glow = new THREE.Mesh(glowGeometry, glowMaterial);
    glow.position.set(0, 1.5, 1.2);
    furnaceGroup.add(glow);
    
    // Add userData for interaction
    furnaceGroup.userData.isFurnace = true;
    furnaceGroup.userData.isInteractable = true;
    furnaceGroup.userData.name = "Furnace";
    
    return furnaceGroup;
  }
  
  // Create an anvil mesh for the scene
  public static createAnvilMesh(): THREE.Group {
    const anvilGroup = new THREE.Group();
    
    // Anvil base - rectangular prism
    const baseGeometry = new THREE.BoxGeometry(1.5, 0.5, 1);
    const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const base = new THREE.Mesh(baseGeometry, baseMaterial);
    base.position.y = 0.25; // Half of the height
    anvilGroup.add(base);
    
    // Anvil middle section - narrower rectangular prism
    const middleGeometry = new THREE.BoxGeometry(0.7, 0.7, 0.8);
    const middleMaterial = new THREE.MeshStandardMaterial({ color: 0x444444 });
    const middle = new THREE.Mesh(middleGeometry, middleMaterial);
    middle.position.y = 0.85; // Base height + half of this height
    anvilGroup.add(middle);
    
    // Anvil top - working surface
    const topGeometry = new THREE.BoxGeometry(1.8, 0.4, 0.8);
    const topMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const top = new THREE.Mesh(topGeometry, topMaterial);
    top.position.y = 1.4; // Base + middle + half of this height
    anvilGroup.add(top);
    
    // Anvil horn - conical part
    const hornGeometry = new THREE.ConeGeometry(0.2, 0.8, 8);
    const hornMaterial = new THREE.MeshStandardMaterial({ color: 0x555555 });
    const horn = new THREE.Mesh(hornGeometry, hornMaterial);
    horn.rotation.z = Math.PI / 2; // Rotate to point horizontally
    horn.position.set(-1.1, 1.4, 0); // Position at the left end of the anvil
    anvilGroup.add(horn);
    
    // Add userData for interaction
    anvilGroup.userData.isAnvil = true;
    anvilGroup.userData.isInteractable = true;
    anvilGroup.userData.name = "Anvil";
    
    return anvilGroup;
  }
} 