import * as THREE from 'three';
import { getSocket } from '../network/socket';
import { ItemType } from '../../types/player';
import { SkillType } from '../../components/ui/SkillsPanel';
import { ResourceNode, ResourceType } from '../world/resources';
import soundManager from '../audio/soundManager';

// Fish types
export enum FishType {
  SHRIMP = 'shrimp',
  SARDINE = 'sardine',
  TROUT = 'trout',
  SALMON = 'salmon',
  LOBSTER = 'lobster',
  SWORDFISH = 'swordfish',
}

// Fish spot types
export enum FishingSpotType {
  NET = 'net',
  BAIT = 'bait',
  CAGE = 'cage',
  HARPOON = 'harpoon',
}

// Fish spot configuration
export interface FishingSpotConfig {
  type: FishingSpotType;
  fish: FishType[];
  requiredTool: ItemType;
  requiredLevel: number;
}

// Fishing spot configurations
export const FISHING_SPOTS: Record<FishingSpotType, FishingSpotConfig> = {
  [FishingSpotType.NET]: {
    type: FishingSpotType.NET,
    fish: [FishType.SHRIMP, FishType.SARDINE],
    requiredTool: ItemType.FISHING_NET,
    requiredLevel: 1,
  },
  [FishingSpotType.BAIT]: {
    type: FishingSpotType.BAIT,
    fish: [FishType.TROUT, FishType.SALMON],
    requiredTool: ItemType.FISHING_ROD,
    requiredLevel: 20,
  },
  [FishingSpotType.CAGE]: {
    type: FishingSpotType.CAGE,
    fish: [FishType.LOBSTER],
    requiredTool: ItemType.FISHING_ROD,
    requiredLevel: 40,
  },
  [FishingSpotType.HARPOON]: {
    type: FishingSpotType.HARPOON,
    fish: [FishType.SWORDFISH],
    requiredTool: ItemType.FISHING_ROD,
    requiredLevel: 50,
  },
};

// Map fish types to inventory item types
export const FISH_TO_ITEM_MAP: Record<FishType, ItemType> = {
  [FishType.SHRIMP]: ItemType.SHRIMP,
  [FishType.SARDINE]: ItemType.SARDINE,
  [FishType.TROUT]: ItemType.TROUT,
  [FishType.SALMON]: ItemType.SALMON,
  [FishType.LOBSTER]: ItemType.LOBSTER,
  [FishType.SWORDFISH]: ItemType.SWORDFISH,
};

// FishingSystem interface options
interface FishingSystemOptions {
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  onFishCaught?: (fishType: FishType | ItemType) => void;
}

export class FishingSystem {
  private playerRef: React.MutableRefObject<THREE.Mesh | null>;
  private isFishing: boolean = false;
  private fishingInterval: NodeJS.Timeout | null = null;
  private currentFishingSpot: ResourceNode | null = null;
  private onFishCaught?: (fishType: FishType | ItemType) => void;
  
  constructor(options: FishingSystemOptions) {
    this.playerRef = options.playerRef;
    this.onFishCaught = options.onFishCaught;
  }
  
  // Start fishing at a specific spot
  public startFishing(fishingSpot: ResourceNode): boolean {
    if (this.isFishing) {
      console.log("Already fishing");
      return false;
    }
    
    if (!this.playerRef.current) {
      console.log("Player reference not found");
      return false;
    }
    
    this.isFishing = true;
    this.currentFishingSpot = fishingSpot;
    
    // Send fishing request to server using the gather event
    getSocket().then(socket => {
      if (socket) {
        socket.emit('gather', fishingSpot.id);
      }
    });
    
    // Start fishing interval locally for animation and feedback
    this.fishingInterval = setInterval(() => {
      this.tryToFish();
    }, 3000); // Try to catch a fish every 3 seconds
    
    // Play sound effect
    soundManager.play('fishing_splash');
    
    return true;
  }
  
  // Stop fishing
  public stopFishing(): void {
    if (!this.isFishing) return;
    
    this.isFishing = false;
    this.currentFishingSpot = null;
    
    if (this.fishingInterval) {
      clearInterval(this.fishingInterval);
      this.fishingInterval = null;
    }
    
    // Play sound effect
    soundManager.play('fishing_stop');
  }
  
  // Try to catch a fish
  private tryToFish(): void {
    if (!this.isFishing || !this.currentFishingSpot) return;
    
    // The actual fish catching logic is handled by the server
    // but we can provide visual and audio feedback here
    
    // Play animation or sound
    soundManager.play('fishing_splash');
  }
  
  // Handle fish caught event from server
  public handleFishCaught(data: { itemType: ItemType, experience: number }): void {
    if (!this.isFishing) return;
    
    const { itemType, experience } = data;
    
    // Play sound effect
    soundManager.play('fishing_catch');
    
    // Call the callback if provided
    if (this.onFishCaught) {
      this.onFishCaught(itemType);
    }
    
    console.log(`Caught a ${itemType} for ${experience} XP!`);
    
    // Example: Dispatch notification event
    const notificationEvent = new CustomEvent('show-notification', {
      detail: { message: `Caught ${itemType} (+${experience} XP)`, type: 'info' },
      bubbles: true
    });
    document.dispatchEvent(notificationEvent);
    
    // Example: Dispatch XP drop UI event
    const xpEvent = new CustomEvent('xp-drop', {
        detail: { skill: SkillType.FISHING, xp: experience },
        bubbles: true
    });
    document.dispatchEvent(xpEvent);
  }
  
  // Clean up resources
  public cleanup(): void {
    this.stopFishing();
  }
  
  // Initialize socket listeners
  public initSocketListeners(): void {
    getSocket().then(socket => {
      if (!socket) return;
      
      // Resource gathered event from server
      (socket as any).on('resourceGathered', (data: any) => {
        if (data && (data.resourceType === ResourceType.FISHING_SPOT) && data.itemType && data.experience !== undefined) {
          this.handleFishCaught({
            itemType: data.itemType as ItemType,
            experience: data.experience
          });
        } else if (data && data.resourceType === ResourceType.FISHING_SPOT) {
          console.warn('[FishingSystem] Received resourceGathered event for fishing spot with unexpected data format:', data);
        }
      });
      
      // Resource unavailable event (e.g., fishing spot depleted)
      (socket as any).on('resourceUnavailable', (data: any) => {
        if (this.currentFishingSpot && data.resourceId === this.currentFishingSpot.id) {
          this.stopFishing();
        }
      });
    });
  }
  
  // Remove socket listeners
  public removeSocketListeners(): void {
    getSocket().then(socket => {
      if (!socket) return;
      
      // We don't want to remove these listeners globally
      // since other systems might be using them
      // Just let our component clean up by stopping fishing
    });
  }
} 