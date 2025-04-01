import { WorldItem } from '../world/resources';
import { Item } from '../../types/player';

// Define server-to-client events
interface ServerToClientEvents {
  // Player events
  playerJoined: (player: any) => void;
  playerLeft: (playerId: string) => void;
  playerMove: (playerData: any) => void;
  playerMoved: (data: { id: string, x: number, y: number, z: number, rotation?: number, timestamp?: number }) => void;
  playerList: (players: any[]) => void;
  checkPlayersSync: (playerIds: string[], callback: (missingPlayerIds: string[]) => void) => void;
  
  // Inventory events
  inventoryUpdate: (inventory: Item[]) => void;
  equippedItem: (item: Item | null) => void;
  
  // World item events
  itemDropped: (item: WorldItem) => void;
  itemPickedUp: (data: { dropId: string }) => void;
  itemRemoved: (dropId: string) => void;
  worldItems: (items: WorldItem[]) => void;
  
  // Resource events
  resourceUpdate: (resourceData: any) => void;
  resourceStateChanged: (data: { 
    resourceId: string, 
    state?: 'normal' | 'harvested', 
    available: boolean,
    remainingResources?: number
  }) => void;
  resourceGathered: (data: { 
    resourceId: string, 
    resourceType: string, 
    item: any,
    remainingResources?: number
  }) => void;
  gatheringStarted: (data: { resourceId: string, action: string }) => void;
  
  // Chat events
  chatMessage: (message: any) => void;
  
  // NPC and Combat events
  updateNPCs: (npcs: any[]) => void;
  npcStateUpdate: (data: { 
    id: string, 
    health?: number, 
    maxHealth?: number, 
    combatState?: 'idle' | 'engaged' | 'dead',
    attacker?: string
  }) => void;
  updateHealth: (data: { amount: number }) => void;
  updatePlayerHealth: (data: { current: number, max: number }) => void;
  playerDeath: (data: { respawnPosition: { x: number, y: number, z: number } }) => void;
  
  // Experience and skill events
  experienceGained: (data: { 
    skill: string, 
    experience: number, 
    totalExperience: number,
    level: number 
  }) => void;
  levelUp: (data: { skill: string, level: number }) => void;
  
  // System events
  error: (error: { message: string }) => void;
  playerData: (data: any) => void;
  zoneInfo: (data: any) => void;
  playerCount: (data: { count: number }) => void;
  skillUpdate: (data: { skillType: string, level: number, experience: number }) => void;
  ping: (startTime: number, callback: (startTime: number) => void) => void;
  initPlayers: (players: any[]) => void;
  
  // Smithing events
  smithingProgress: (data: any) => void;
  smithingComplete: (data: any) => void;
  smithingError: (data: any) => void;
}

// Define client-to-server events
interface ClientToServerEvents {
  // Player events
  playerMove: (positionData: { x: number, y: number, z: number }) => void;
  requestPlayers: () => void;
  updateDisplayName: (data: { name: string }) => void;
  playerAction: (data: { type: string, targetId: string, damage: number, combatMode?: string }) => void;
  
  // Inventory events
  requestInventory: () => void;
  equipItem: (data: { itemId: string }) => void;
  updateInventory: (data: { type: string, count: number }) => void;
  
  // Item events
  dropItem: (data: { 
    itemId: string, 
    itemType: string,
    x?: number,
    y?: number,
    z?: number,
    clientDropId?: string
  }) => void;
  pickup: (dropId: string) => void;
  pickupItem: (dropId: string) => void;
  
  // Resource events
  gather: (resourceId: string) => void;
  gatherWithTool: (data: { resourceId: string, action: string }) => void;
  
  // NPC and Combat events
  attackNPC: (data: { npcId: string }) => void;
  damageNPC: (data: { npcId: string, damage: number }) => void;
  updateHealth: (data: { amount: number }) => void;
  
  // Chat events
  chat: (message: string) => void;
  chatCommand: (data: { command: string, params: any }) => void;
  
  // Skill events
  updatePlayerSkill: (data: { skillType: string, xpAmount: number }) => void;
  
  // Request events
  getResourceNodes: () => void;
  getWorldItems: () => void;
  getPlayers: () => void;
  getPlayerCount: () => void;
  getPlayerData: (playerId: string, callback: (playerData: any) => void) => void;
  requestAllPlayers: () => void;
  syncPlayerList: (playerIds: string[], callback: (serverPlayerIds: string[]) => void) => void;
  
  // System events
  ping: (startTime: number) => void;
  pong: (startTime: number) => void;
  
  // Smithing events
  startSmithing: (data: any) => void;
  cancelSmithing: () => void;
  smeltBronzeBar: (data: { inventory: any[], skills: any, recipe?: string }, callback: (response: { success: boolean, error?: string, updatedInventory?: any[] }) => void) => void;
}

// Export both interfaces separately instead of combining them
// This helps us avoid naming conflicts while still having type definitions
export type { ServerToClientEvents, ClientToServerEvents }; 