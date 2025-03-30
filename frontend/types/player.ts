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
  inventory?: Item[];
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
  LOG = 'log',
  COAL = 'coal',
  FISH = 'fish'
} 