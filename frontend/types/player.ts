// Player interface
export interface Player {
  id: string;
  userId?: string; // Supabase user ID
  name: string;
  x: number;
  y: number;
  z: number;
  rotation?: number; // Add rotation field
  // Optional properties that might be added later
  health?: number;
  maxHealth?: number;
  inventory?: Item[];
  equippedItem?: Item; // Currently equipped item (tool, weapon, etc.)
  skills?: { [skillName: string]: { level: number; experience: number } };
}

// Player position interface for network updates
export interface PlayerPosition {
  x: number;
  y: number;
  z: number;
  rotation?: number;  // Add rotation field
  timestamp?: number;  // Optional timestamp for synchronization
}

// Item interface
export interface Item {
  id: string;
  type: ItemType;
  count: number;
}

// Item types
export enum ItemType {
  // Woodcutting items
  LOG = 'log',
  OAK_LOG = 'oak_log',
  WILLOW_LOG = 'willow_log',
  MAPLE_LOG = 'maple_log',
  YEW_LOG = 'yew_log',
  
  // Mining items
  COPPER_ORE = 'copper_ore',
  TIN_ORE = 'tin_ore',
  COAL = 'coal',
  IRON_ORE = 'iron_ore',
  GOLD_ORE = 'gold_ore',
  MITHRIL_ORE = 'mithril_ore',
  
  // Fishing items
  SHRIMP = 'shrimp',
  SARDINE = 'sardine',
  TROUT = 'trout',
  SALMON = 'salmon',
  LOBSTER = 'lobster',
  SWORDFISH = 'swordfish',
  FISH = 'fish', // Generic fish (for backward compatibility)
  
  // Smithing items - Bars
  BRONZE_BAR = 'bronze_bar',
  IRON_BAR = 'iron_bar',
  STEEL_BAR = 'steel_bar',
  GOLD_BAR = 'gold_bar',
  MITHRIL_BAR = 'mithril_bar',
  
  // Tools
  BRONZE_PICKAXE = 'bronze_pickaxe',
  IRON_PICKAXE = 'iron_pickaxe',
  STEEL_PICKAXE = 'steel_pickaxe',
  BRONZE_AXE = 'bronze_axe',
  IRON_AXE = 'iron_axe',
  STEEL_AXE = 'steel_axe',
  FISHING_NET = 'fishing_net',
  FISHING_ROD = 'fishing_rod',
  
  // Weapons
  BRONZE_SWORD = 'bronze_sword',
  IRON_SWORD = 'iron_sword',
  STEEL_SWORD = 'steel_sword'
} 