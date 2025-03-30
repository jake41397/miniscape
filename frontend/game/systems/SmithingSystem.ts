import * as THREE from 'three';
import { getSocket } from '../network/socket';
import { ItemType } from '../../types/player';
import { addExperience } from '../state/SkillSystem';
import { SkillType } from '../../components/ui/SkillsPanel';
import { XP_REWARDS, SKILL_REQUIREMENTS } from '../state/SkillSystem';
import soundManager from '../audio/soundManager';

// Smithing modes
export enum SmithingMode {
  SMELTING = 'smelting',
  SMITHING = 'smithing'
}

// Bar types
export enum BarType {
  BRONZE = 'bronze_bar',
  IRON = 'iron_bar',
  STEEL = 'steel_bar',
  GOLD = 'gold_bar',
  MITHRIL = 'mithril_bar'
}

// Smelting recipes
export interface SmeltingRecipe {
  resultItem: ItemType;
  requiredLevel: number;
  experienceReward: number;
  ingredients: { type: ItemType, count: number }[];
}

// Smithing recipes
export interface SmithingRecipe {
  resultItem: ItemType;
  requiredLevel: number;
  experienceReward: number;
  ingredients: { type: ItemType, count: number }[];
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

// Smithing recipes
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
    requiredLevel: 5,
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
    requiredLevel: 25,
    experienceReward: 30,
    ingredients: [
      { type: ItemType.IRON_BAR, count: 2 }
    ]
  },
  STEEL_SWORD: {
    resultItem: ItemType.STEEL_SWORD,
    requiredLevel: 35,
    experienceReward: 35,
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
    requiredLevel: 40,
    experienceReward: 40,
    ingredients: [
      { type: ItemType.STEEL_BAR, count: 2 }
    ]
  }
};

// Smithing System class
export class SmithingSystem {
  private playerRef: React.MutableRefObject<THREE.Mesh | null>;
  private isSmithing: boolean = false;
  private currentAction: SmithingMode | null = null;
  private actionProgress: number = 0;
  private actionDuration: number = 3000; // 3 seconds for smithing actions
  
  constructor(playerRef: React.MutableRefObject<THREE.Mesh | null>) {
    this.playerRef = playerRef;
  }
  
  // Check if player has required items for smelting
  public canSmeltBar(barType: string, inventory: { type: ItemType, count: number }[]): boolean {
    const recipe = SMELTING_RECIPES[barType];
    if (!recipe) return false;
    
    // Check each ingredient
    for (const ingredient of recipe.ingredients) {
      const playerItem = inventory.find(item => item.type === ingredient.type);
      if (!playerItem || playerItem.count < ingredient.count) {
        return false;
      }
    }
    
    return true;
  }
  
  // Check if player has required items for smithing
  public canSmithItem(itemType: string, inventory: { type: ItemType, count: number }[]): boolean {
    const recipe = SMITHING_RECIPES[itemType];
    if (!recipe) return false;
    
    // Check each ingredient
    for (const ingredient of recipe.ingredients) {
      const playerItem = inventory.find(item => item.type === ingredient.type);
      if (!playerItem || playerItem.count < ingredient.count) {
        return false;
      }
    }
    
    return true;
  }
  
  // Start smelting a bar
  public startSmelting(barType: string, inventory: { type: ItemType, count: number }[], playerSkills: any): void {
    if (this.isSmithing) return;
    
    const recipe = SMELTING_RECIPES[barType];
    if (!recipe) return;
    
    // Check if player has the required level
    const smithingLevel = playerSkills[SkillType.SMITHING]?.level || 1;
    if (smithingLevel < recipe.requiredLevel) {
      console.log(`Smithing level ${recipe.requiredLevel} required to smelt ${barType}`);
      return;
    }
    
    // Check if player has the required items
    if (!this.canSmeltBar(barType, inventory)) {
      console.log(`Missing required items to smelt ${barType}`);
      return;
    }
    
    // Start smelting process
    this.isSmithing = true;
    this.currentAction = SmithingMode.SMELTING;
    this.actionProgress = 0;
    
    // Play smelting sound
    soundManager.play('mining_hit'); // Reusing mining sound for now
    
    // Emit smelting start event
    const socket = getSocket();
    if (socket) {
      socket.then(socket => {
        if (socket) {
          socket.emit('startSmithing', {
            barType,
            mode: SmithingMode.SMELTING
          });
        }
      });
    }
  }
  
  // Start smithing an item
  public startSmithing(itemType: string, inventory: { type: ItemType, count: number }[], playerSkills: any): void {
    if (this.isSmithing) return;
    
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
    this.isSmithing = true;
    this.currentAction = SmithingMode.SMITHING;
    this.actionProgress = 0;
    
    // Play smithing sound
    soundManager.play('mining_hit'); // Reusing mining sound for now
    
    // Emit smithing start event
    const socket = getSocket();
    if (socket) {
      socket.then(socket => {
        if (socket) {
          socket.emit('startSmithing', {
            itemType,
            mode: SmithingMode.SMITHING
          });
        }
      });
    }
  }
  
  // Update smithing progress
  public update(delta: number): void {
    if (!this.isSmithing || !this.currentAction) return;
    
    // Update progress
    this.actionProgress += delta;
    
    // Check if action is complete
    if (this.actionProgress >= this.actionDuration) {
      this.completeSmithing();
    }
  }
  
  // Complete smithing action
  private completeSmithing(): void {
    this.isSmithing = false;
    
    // Emit complete event
    const socket = getSocket();
    if (socket) {
      socket.then(socket => {
        if (socket) {
          socket.emit('completeSmithing', {
            mode: this.currentAction
          });
        }
      });
    }
    
    // Reset state
    this.currentAction = null;
    this.actionProgress = 0;
  }
  
  // Cancel smithing action
  public cancelSmithing(): void {
    if (!this.isSmithing) return;
    
    this.isSmithing = false;
    this.currentAction = null;
    this.actionProgress = 0;
    
    // Emit cancel event
    const socket = getSocket();
    if (socket) {
      socket.then(socket => {
        if (socket) {
          socket.emit('cancelSmithing');
        }
      });
    }
  }
  
  // Get current smithing progress percentage
  public getProgress(): number {
    if (!this.isSmithing) return 0;
    return Math.min(100, (this.actionProgress / this.actionDuration) * 100);
  }
  
  // Check if player is currently smithing
  public getIsSmithing(): boolean {
    return this.isSmithing;
  }
  
  // Get current smithing mode
  public getCurrentAction(): SmithingMode | null {
    return this.currentAction;
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
    
    // Anvil base - box
    const baseGeometry = new THREE.BoxGeometry(1.5, 0.5, 0.8);
    const anvilMaterial = new THREE.MeshStandardMaterial({ color: 0x333333 });
    const base = new THREE.Mesh(baseGeometry, anvilMaterial);
    base.position.y = 0.25;
    anvilGroup.add(base);
    
    // Anvil middle section - narrower box
    const middleGeometry = new THREE.BoxGeometry(0.8, 0.3, 0.6);
    const middle = new THREE.Mesh(middleGeometry, anvilMaterial);
    middle.position.y = 0.65;
    anvilGroup.add(middle);
    
    // Anvil top section
    const topGeometry = new THREE.BoxGeometry(1.2, 0.4, 0.6);
    const top = new THREE.Mesh(topGeometry, anvilMaterial);
    top.position.y = 1;
    anvilGroup.add(top);
    
    // Add userData for interaction
    anvilGroup.userData.isAnvil = true;
    anvilGroup.userData.isInteractable = true;
    anvilGroup.userData.name = "Anvil";
    
    return anvilGroup;
  }
} 