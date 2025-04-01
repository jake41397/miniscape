import * as THREE from 'three';
import { getSocket } from '../network/socket';
import { ItemType } from '../../types/player';
import { SkillType } from '../../components/ui/SkillsPanel';
import { ResourceNode, ResourceType } from '../world/resources';
import soundManager from '../audio/soundManager';

// Rock types
export enum RockType {
  COPPER = 'copper',
  TIN = 'tin',
  IRON = 'iron',
  COAL = 'coal',
  GOLD = 'gold',
  MITHRIL = 'mithril',
}

// Rock configuration
export interface RockConfig {
  type: RockType;
  requiredLevel: number;
  experienceReward: number;
  depleteChance: number; // Chance to deplete the rock (0-1)
  respawnTime: number; // Time in ms to respawn after depletion
  oreType: ItemType;
}

// Rock configurations
export const ROCK_CONFIGS: Record<RockType, RockConfig> = {
  [RockType.COPPER]: {
    type: RockType.COPPER,
    requiredLevel: 1,
    experienceReward: 17.5,
    depleteChance: 0.25,
    respawnTime: 10000, // 10 seconds
    oreType: ItemType.COPPER_ORE,
  },
  [RockType.TIN]: {
    type: RockType.TIN,
    requiredLevel: 1,
    experienceReward: 17.5,
    depleteChance: 0.25,
    respawnTime: 10000, // 10 seconds
    oreType: ItemType.TIN_ORE,
  },
  [RockType.IRON]: {
    type: RockType.IRON,
    requiredLevel: 15,
    experienceReward: 35,
    depleteChance: 0.20,
    respawnTime: 15000, // 15 seconds
    oreType: ItemType.IRON_ORE,
  },
  [RockType.COAL]: {
    type: RockType.COAL,
    requiredLevel: 30,
    experienceReward: 50,
    depleteChance: 0.15,
    respawnTime: 20000, // 20 seconds
    oreType: ItemType.COAL,
  },
  [RockType.GOLD]: {
    type: RockType.GOLD,
    requiredLevel: 40,
    experienceReward: 65,
    depleteChance: 0.10,
    respawnTime: 30000, // 30 seconds
    oreType: ItemType.GOLD_ORE,
  },
  [RockType.MITHRIL]: {
    type: RockType.MITHRIL,
    requiredLevel: 55,
    experienceReward: 80,
    depleteChance: 0.05,
    respawnTime: 40000, // 40 seconds
    oreType: ItemType.MITHRIL_ORE,
  },
};

// Map rock types to rock IDs used in resource nodes
export const ROCK_TYPE_MAP: Record<string, RockType> = {
  'copper_rock': RockType.COPPER,
  'tin_rock': RockType.TIN,
  'iron_rock': RockType.IRON,
  'coal_rock': RockType.COAL,
  'gold_rock': RockType.GOLD,
  'mithril_rock': RockType.MITHRIL,
};

// MiningSystem interface options
interface MiningSystemOptions {
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  onOreMined?: (oreType: ItemType) => void;
  onRockDepleted?: (rockId: string) => void;
}

export class MiningSystem {
  private playerRef: React.MutableRefObject<THREE.Mesh | null>;
  private isMining: boolean = false;
  private miningInterval: NodeJS.Timeout | null = null;
  private currentRock: ResourceNode | null = null;
  private onOreMined?: (oreType: ItemType) => void;
  private onRockDepleted?: (rockId: string) => void;
  private miningAnimationRef?: THREE.AnimationAction | null = null;
  
  constructor(options: MiningSystemOptions) {
    this.playerRef = options.playerRef;
    this.onOreMined = options.onOreMined;
    this.onRockDepleted = options.onRockDepleted;
  }
  
  // Start mining a rock
  public startMining(rock: ResourceNode): boolean {
    if (this.isMining) {
      console.log("Already mining");
      return false;
    }
    
    if (!this.playerRef.current) {
      console.log("Player reference not found");
      return false;
    }
    
    this.isMining = true;
    this.currentRock = rock;
    
    // Turn player to face the rock
    if (this.playerRef.current) {
      const direction = new THREE.Vector3(
        rock.x - this.playerRef.current.position.x,
        0,
        rock.z - this.playerRef.current.position.z
      ).normalize();
      
      const angle = Math.atan2(direction.x, direction.z);
      this.playerRef.current.rotation.y = angle;
    }
    
    // Send mining request to server using the gather event
    getSocket().then(socket => {
      if (socket) {
        socket.emit('gather', rock.id);
      }
    });
    
    // Start mining interval locally for animation and feedback
    this.miningInterval = setInterval(() => {
      this.tryToMine();
    }, 2500); // Try to mine every 2.5 seconds
    
    // Play sound effect
    soundManager.play('mining_hit');
    
    return true;
  }
  
  // Stop mining
  public stopMining(): void {
    if (!this.isMining) return;
    
    this.isMining = false;
    this.currentRock = null;
    
    if (this.miningInterval) {
      clearInterval(this.miningInterval);
      this.miningInterval = null;
    }
    
    // Stop animation if any
    if (this.miningAnimationRef) {
      this.miningAnimationRef.stop();
      this.miningAnimationRef = null;
    }
  }
  
  // Try to mine the rock
  private tryToMine(): void {
    if (!this.isMining || !this.currentRock) return;
    
    // The actual mining logic is handled by the server
    // but we can provide visual and audio feedback here
    
    // Play mining sound
    soundManager.play('mining_hit');
  }
  
  // Handle ore mined event from server
  public handleOreMined(data: { oreType: ItemType, experience: number }): void {
    if (!this.isMining) return;
    
    const { oreType, experience } = data;
    
    // Call the callback if provided
    if (this.onOreMined) {
      this.onOreMined(oreType);
    }
    
    console.log(`Mined ${oreType} for ${experience} XP!`);
    
    // Example: Dispatch notification event
    const notificationEvent = new CustomEvent('show-notification', {
        detail: { message: `Mined ${oreType} (+${experience} XP)`, type: 'info' },
        bubbles: true
    });
    document.dispatchEvent(notificationEvent);
    
    // Example: Dispatch XP drop UI event
    const xpEvent = new CustomEvent('xp-drop', {
        detail: { skill: SkillType.MINING, xp: experience },
        bubbles: true
    });
    document.dispatchEvent(xpEvent);
  }
  
  // Handle rock depleted event
  public handleRockDepleted(rockId: string): void {
    if (this.currentRock && this.currentRock.id === rockId) {
      this.stopMining();
      
      // Call the callback if provided
      if (this.onRockDepleted) {
        this.onRockDepleted(rockId);
      }
      
      console.log(`Rock ${rockId} depleted`);
    }
  }
  
  // Clean up resources
  public cleanup(): void {
    this.stopMining();
  }
  
  // Initialize socket listeners
  public initSocketListeners(): void {
    getSocket().then(socket => {
      if (!socket) return;
      
      // Resource gathered event from server
      (socket as any).on('resourceGathered', (data: any) => {
        // Ensure data structure is as expected from backend for mining
        if (data && data.resourceType?.startsWith('rock_') &&
            data.itemType && data.experience !== undefined) {
          this.handleOreMined({
            oreType: data.itemType as ItemType,
            experience: data.experience
          });
        } else if (data && data.resourceType?.startsWith('rock_')) {
            console.warn('[MiningSystem] Received resourceGathered event for rock with unexpected data format:', data);
        }
      });
      
      // Resource unavailable event (e.g., rock depleted)
      (socket as any).on('resourceUnavailable', (data: any) => {
        // Check if the unavailable resource is the rock we are currently mining
        if (this.currentRock && data && data.resourceId === this.currentRock.id) {
          this.handleRockDepleted(data.resourceId);
        }
      });
      
      // Resource state changed event (e.g., rock visual update)
      (socket as any).on('resourceStateChanged', (data: any) => {
        if (data.resourceId && data.state === 'harvested' && this.currentRock?.id === data.resourceId) {
          this.handleRockDepleted(data.resourceId);
        }
      });
    });
  }
  
  // Remove socket listeners (not actually removing global listeners)
  public removeSocketListeners(): void {
    // We don't want to remove these listeners globally
    // since other systems might be using them
    // Just let our component clean up by stopping mining
  }
} 