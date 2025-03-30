// Additional type definitions for the application

// Import socket type extensions
import './socket.d';

// Common interfaces used throughout the application
interface Player {
  id: string;
  userId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  inventory: InventoryItem[];
  equippedItem?: InventoryItem; // Currently equipped item
}

interface InventoryItem {
  id: string;
  type: string;
  quantity: number;
  [key: string]: any;
}

interface WorldItem {
  dropId: string;
  itemType: string;
  x: number;
  y: number;
  z: number;
}

interface ResourceNode {
  id: string;
  type: string;
  x: number;
  y: number;
  z: number;
  respawnTime: number;
  remainingResources?: number; // Track remaining resources before depletion
  state?: 'normal' | 'harvested'; // Track the visual state of the resource
  metadata?: Record<string, any>; // Additional metadata for resource type
}

// Make interfaces available globally
declare global {
  interface Window {
    // Add any browser-specific global types here if needed
  }
}

export {
  Player,
  InventoryItem,
  WorldItem,
  ResourceNode
}; 