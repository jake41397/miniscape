import { Server, Socket } from 'socket.io';

// World boundaries
export const WORLD_BOUNDS = {
  minX: -50,
  maxX: 50,
  minZ: -50,
  maxZ: 50
};

export interface WorldBounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Player {
  id: string;
  userId: string;
  name: string;
  x: number;
  y: number;
  z: number;
  rotationY?: number;     // Y-axis rotation in radians
  inventory: InventoryItem[];
  lastPing?: number;      // Last time player responded to ping
  lastActive?: number;    // Last time player did something (moved, etc)
  latency?: number;       // Player's connection latency in ms
}

export interface InventoryItem {
  id: string;
  type: string;
  quantity: number;
  [key: string]: any;
}

export interface WorldItem {
  dropId: string;
  itemType: string;
  x: number;
  y: number;
  z: number;
}

export interface ResourceNode {
  id: string;
  type: string;
  x: number;
  y: number;
  z: number;
  respawnTime: number;
}

export interface ExtendedSocket extends Socket {
  user?: {
    id: string;
    [key: string]: any;
  };
  data: {
    lastPositionUpdate?: number;
    movementCount?: number;
    [key: string]: any;
  };
}

export interface PlayerPosition {
  x: number;
  y: number;
  z: number;
  rotationY?: number;     // Y-axis rotation in radians
  timestamp?: number;
  isAutoMove?: boolean;   // Flag to indicate this is from automove
}

export interface PlayersStore {
  [socketId: string]: Player;
} 