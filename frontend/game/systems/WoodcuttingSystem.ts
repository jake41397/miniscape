import * as THREE from 'three';
import { getSocket } from '../network/socket';
import { ItemType } from '../../types/player';
import { addExperience } from '../state/SkillSystem';
import { SkillType } from '../../components/ui/SkillsPanel';
import { XP_REWARDS, SKILL_REQUIREMENTS } from '../state/SkillSystem';
import { ResourceNode, ResourceType } from '../world/resources';
import soundManager from '../audio/soundManager';

// Tree types
export enum TreeType {
  NORMAL = 'normal',
  OAK = 'oak',
  WILLOW = 'willow',
  MAPLE = 'maple',
  YEW = 'yew',
}

// Tree configuration
export interface TreeConfig {
  type: TreeType;
  requiredLevel: number;
  experienceReward: number;
  depleteChance: number; // Chance to deplete the tree (0-1)
  respawnTime: number; // Time in ms to respawn after depletion
  logType: ItemType;
}

// Tree configurations
export const TREE_CONFIGS: Record<TreeType, TreeConfig> = {
  [TreeType.NORMAL]: {
    type: TreeType.NORMAL,
    requiredLevel: 1,
    experienceReward: 25,
    depleteChance: 0.3,
    respawnTime: 10000, // 10 seconds
    logType: ItemType.LOG,
  },
  [TreeType.OAK]: {
    type: TreeType.OAK,
    requiredLevel: 15,
    experienceReward: 37.5,
    depleteChance: 0.25,
    respawnTime: 15000, // 15 seconds
    logType: ItemType.OAK_LOG,
  },
  [TreeType.WILLOW]: {
    type: TreeType.WILLOW,
    requiredLevel: 30,
    experienceReward: 67.5,
    depleteChance: 0.2,
    respawnTime: 20000, // 20 seconds
    logType: ItemType.WILLOW_LOG,
  },
  [TreeType.MAPLE]: {
    type: TreeType.MAPLE,
    requiredLevel: 45,
    experienceReward: 100,
    depleteChance: 0.15,
    respawnTime: 30000, // 30 seconds
    logType: ItemType.MAPLE_LOG,
  },
  [TreeType.YEW]: {
    type: TreeType.YEW,
    requiredLevel: 60,
    experienceReward: 175,
    depleteChance: 0.1,
    respawnTime: 40000, // 40 seconds
    logType: ItemType.YEW_LOG,
  },
};

// Map tree types to tree IDs used in resource nodes
export const TREE_TYPE_MAP: Record<string, TreeType> = {
  'tree': TreeType.NORMAL,
  'oak_tree': TreeType.OAK,
  'willow_tree': TreeType.WILLOW,
  'maple_tree': TreeType.MAPLE,
  'yew_tree': TreeType.YEW,
};

// WoodcuttingSystem interface options
interface WoodcuttingSystemOptions {
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  onLogChopped?: (logType: ItemType) => void;
  onExperienceGained?: (experience: number) => void;
  onTreeDepleted?: (treeId: string) => void;
}

export class WoodcuttingSystem {
  private playerRef: React.MutableRefObject<THREE.Mesh | null>;
  private isChopping: boolean = false;
  private choppingInterval: NodeJS.Timeout | null = null;
  private currentTree: ResourceNode | null = null;
  private onLogChopped?: (logType: ItemType) => void;
  private onExperienceGained?: (experience: number) => void;
  private onTreeDepleted?: (treeId: string) => void;
  private choppingAnimationRef?: THREE.AnimationAction | null = null;
  
  constructor(options: WoodcuttingSystemOptions) {
    this.playerRef = options.playerRef;
    this.onLogChopped = options.onLogChopped;
    this.onExperienceGained = options.onExperienceGained;
    this.onTreeDepleted = options.onTreeDepleted;
  }
  
  // Start chopping a tree
  public startChopping(tree: ResourceNode): boolean {
    if (this.isChopping) {
      console.log("Already chopping");
      return false;
    }
    
    if (!this.playerRef.current) {
      console.log("Player reference not found");
      return false;
    }
    
    // Check if the tree is close enough
    const playerPosition = this.playerRef.current.position;
    const distanceToTree = playerPosition.distanceTo(
      new THREE.Vector3(tree.x, tree.y, tree.z)
    );
    
    if (distanceToTree > 3) {
      console.log("Too far from tree");
      return false;
    }
    
    // Check if the tree is already depleted
    if (tree.state === 'harvested') {
      console.log("Tree is already depleted");
      return false;
    }
    
    this.isChopping = true;
    this.currentTree = tree;
    
    // Turn player to face the tree
    if (this.playerRef.current) {
      const direction = new THREE.Vector3(
        tree.x - this.playerRef.current.position.x,
        0,
        tree.z - this.playerRef.current.position.z
      ).normalize();
      
      const angle = Math.atan2(direction.x, direction.z);
      this.playerRef.current.rotation.y = angle;
    }
    
    // Send chopping request to server using the gather event
    getSocket().then(socket => {
      if (socket) {
        socket.emit('gather', tree.id);
      }
    });
    
    // Start chopping interval locally for animation and feedback
    this.choppingInterval = setInterval(() => {
      this.tryToChop();
    }, 2000); // Try to chop every 2 seconds
    
    // Play sound effect
    soundManager.play('chop_tree');
    
    return true;
  }
  
  // Stop chopping
  public stopChopping(): void {
    if (!this.isChopping) return;
    
    this.isChopping = false;
    this.currentTree = null;
    
    if (this.choppingInterval) {
      clearInterval(this.choppingInterval);
      this.choppingInterval = null;
    }
    
    // Stop animation if any
    if (this.choppingAnimationRef) {
      this.choppingAnimationRef.stop();
      this.choppingAnimationRef = null;
    }
  }
  
  // Try to chop the tree
  private tryToChop(): void {
    if (!this.isChopping || !this.currentTree) return;
    
    // The actual chopping logic is handled by the server
    // but we can provide visual and audio feedback here
    
    // Play chopping sound
    soundManager.play('chop_tree');
  }
  
  // Handle log chopped event from server
  public handleLogChopped(data: { logType: ItemType, experience: number }): void {
    if (!this.isChopping) return;
    
    const { logType, experience } = data;
    
    // Call the callback if provided
    if (this.onLogChopped) {
      this.onLogChopped(logType);
    }
    
    // Handle experience gained
    if (this.onExperienceGained) {
      this.onExperienceGained(experience);
    }
    
    console.log(`Chopped ${logType} for ${experience} XP!`);
  }
  
  // Handle tree depleted event
  public handleTreeDepleted(treeId: string): void {
    if (this.currentTree && this.currentTree.id === treeId) {
      this.stopChopping();
      
      // Call the callback if provided
      if (this.onTreeDepleted) {
        this.onTreeDepleted(treeId);
      }
      
      console.log(`Tree ${treeId} depleted`);
    }
  }
  
  // Clean up resources
  public cleanup(): void {
    this.stopChopping();
  }
  
  // Check if player has the required axe
  public static hasRequiredAxe(
    inventory: { type: ItemType }[],
    equippedItem?: { type: ItemType } | null
  ): boolean {
    // Check equipped item first
    if (equippedItem) {
      if (
        equippedItem.type === ItemType.BRONZE_AXE ||
        equippedItem.type === ItemType.IRON_AXE ||
        equippedItem.type === ItemType.STEEL_AXE
      ) {
        return true;
      }
    }
    
    // Check inventory
    return inventory.some(item => 
      item.type === ItemType.BRONZE_AXE ||
      item.type === ItemType.IRON_AXE ||
      item.type === ItemType.STEEL_AXE
    );
  }
  
  // Check if player has the required skill level for a tree type
  public static hasRequiredLevel(
    skills: { [key: string]: { level: number } },
    treeType: TreeType
  ): boolean {
    const config = TREE_CONFIGS[treeType];
    const woodcuttingLevel = skills[SkillType.WOODCUTTING]?.level || 1;
    return woodcuttingLevel >= config.requiredLevel;
  }
  
  // Get the tree type from a resource node
  public static getTreeType(tree: ResourceNode): TreeType {
    const treeTypeId = tree.metadata?.treeType || 'tree';
    return TREE_TYPE_MAP[treeTypeId] || TreeType.NORMAL;
  }
  
  // Initialize socket listeners
  public initSocketListeners(): void {
    getSocket().then(socket => {
      if (!socket) return;
      
      // Resource gathered event from server
      (socket as any).on('resourceGathered', (data: any) => {
        // Check if this is a woodcutting-related update
        if (data.resourceType === 'tree') {
          this.handleLogChopped({
            logType: data.item?.type || ItemType.LOG,
            experience: data.experience || TREE_CONFIGS[TreeType.NORMAL].experienceReward
          });
        }
      });
      
      // Resource unavailable event (e.g., tree depleted)
      (socket as any).on('resourceUnavailable', (data: any) => {
        if (data.resourceId && this.currentTree?.id === data.resourceId) {
          this.handleTreeDepleted(data.resourceId);
        }
      });
      
      // Resource state changed event (e.g., tree visual update)
      (socket as any).on('resourceStateChanged', (data: any) => {
        if (data.resourceId && data.state === 'harvested' && this.currentTree?.id === data.resourceId) {
          this.handleTreeDepleted(data.resourceId);
        }
      });
    });
  }
  
  // Remove socket listeners (not actually removing global listeners)
  public removeSocketListeners(): void {
    // We don't want to remove these listeners globally
    // since other systems might be using them
    // Just let our component clean up by stopping chopping
  }
} 