import { WorldItem } from '../world/resources';
import { Item } from '../../types/player';

// Define server-to-client events
interface ServerToClientEvents {
  // Player events
  playerJoined: (player: any) => void;
  playerLeft: (playerId: string) => void;
  playerMove: (playerData: any) => void;
  playerList: (players: any[]) => void;
  
  // Inventory events
  inventoryUpdate: (inventory: Item[]) => void;
  
  // World item events
  itemDropped: (item: WorldItem) => void;
  itemPickedUp: (data: { dropId: string }) => void;
  worldItems: (items: WorldItem[]) => void;
  
  // Resource events
  resourceUpdate: (resourceData: any) => void;
  
  // Chat events
  chatMessage: (message: any) => void;
  
  // System events
  error: (error: { message: string }) => void;
  playerData: (data: any) => void;
  zoneInfo: (data: any) => void;
}

// Define client-to-server events
interface ClientToServerEvents {
  // Player events
  playerMove: (positionData: { x: number, y: number, z: number }) => void;
  requestPlayers: () => void;
  
  // Inventory events
  requestInventory: () => void;
  
  // Item events
  dropItem: (data: { 
    itemId: string, 
    itemType: string,
    x?: number,
    y?: number,
    z?: number
  }) => void;
  pickup: (dropId: string) => void;
  pickupItem: (dropId: string) => void;
  
  // Resource events
  gather: (resourceId: string) => void;
  
  // Chat events
  sendChat: (message: { content: string, targetId?: string }) => void;
}

// Export both interfaces separately instead of combining them
// This helps us avoid naming conflicts while still having type definitions
export type { ServerToClientEvents, ClientToServerEvents }; 