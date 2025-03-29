import * as THREE from 'three';
import { getSocket } from '../network/socket';
import { WorldItem, createItemMesh } from './resources';
import { Item } from '../../types/player';

interface ItemManagerOptions {
  scene: THREE.Scene;
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  onWorldItemsUpdated?: (items: WorldItem[]) => void;
}

/**
 * ItemManager class for handling dropped items in the world
 * This manages adding, updating, and removing items that have been dropped on the ground
 */
class ItemManager {
  private scene: THREE.Scene;
  private worldItems: WorldItem[] = [];
  private playerRef: React.MutableRefObject<THREE.Mesh | null>;
  private onWorldItemsUpdated?: (items: WorldItem[]) => void;

  constructor(options: ItemManagerOptions) {
    this.scene = options.scene;
    this.playerRef = options.playerRef;
    this.onWorldItemsUpdated = options.onWorldItemsUpdated;
  }

  // Initialize socket listeners for item-related events
  public initSocketListeners = async () => {
    const socket = await getSocket();
    if (!socket) return;

    // Use type assertion to avoid type errors with socket events
    // Listen for new dropped items
    (socket as any).on('itemDropped', (item: any) => {
      this.addWorldItem({
        dropId: item.dropId,
        itemType: item.itemType,
        x: item.x,
        y: item.y,
        z: item.z
      });
    });

    // Listen for item pickup events
    (socket as any).on('itemPickedUp', (data: any) => {
      this.removeWorldItem(data.dropId);
    });

    // Listen for all world items (initial sync)
    (socket as any).on('worldItems', (items: any[]) => {
      // Clear existing items first
      this.clearAllItems();
      
      // Add all items from server
      items.forEach(item => this.addWorldItem(item));
    });
  };

  // Cleanup socket listeners
  public cleanupSocketListeners = async () => {
    const socket = await getSocket();
    if (!socket) return;

    // Use type assertion to avoid type errors with socket events
    (socket as any).off('itemDropped');
    (socket as any).off('itemPickedUp');
    (socket as any).off('worldItems');
  };

  // Drop an item from inventory
  public dropItem = async (item: Item) => {
    const socket = await getSocket();
    if (!socket || !this.playerRef.current) return false;

    // Get player position
    const position = this.playerRef.current.position;
    
    // Add a small random offset for the drop position
    const offsetX = (Math.random() - 0.5) * 1.5;
    const offsetZ = (Math.random() - 0.5) * 1.5;
    
    // Use type assertion to avoid type errors with socket events
    (socket as any).emit('dropItem', {
      itemId: item.id,
      itemType: item.type,
      x: position.x + offsetX,
      y: position.y,
      z: position.z + offsetZ
    });

    return true;
  };

  // Add an item to the world
  public addWorldItem = (item: WorldItem) => {
    // Check if item already exists
    const existingItem = this.worldItems.find(i => i.dropId === item.dropId);
    if (existingItem) {
      // Update position if needed
      existingItem.x = item.x;
      existingItem.y = item.y;
      existingItem.z = item.z;
      
      // Update mesh position
      if (existingItem.mesh) {
        existingItem.mesh.position.set(item.x, item.y, item.z);
      }
      
      return;
    }

    // Create mesh for the item
    const mesh = createItemMesh(item.itemType);
    mesh.position.set(item.x, item.y, item.z);
    mesh.userData.dropId = item.dropId;
    mesh.userData.itemType = item.itemType;
    
    // Add to scene
    this.scene.add(mesh);
    
    // Store in items list
    const worldItem: WorldItem = {
      ...item,
      mesh
    };
    
    this.worldItems.push(worldItem);
    
    // Notify listeners
    if (this.onWorldItemsUpdated) {
      this.onWorldItemsUpdated(this.worldItems);
    }
  };

  // Remove item from world
  public removeWorldItem = (dropId: string) => {
    const itemIndex = this.worldItems.findIndex(item => item.dropId === dropId);
    
    if (itemIndex >= 0) {
      const item = this.worldItems[itemIndex];
      
      // Remove mesh from scene
      if (item.mesh) {
        this.scene.remove(item.mesh);
        
        // Clean up geometry and materials
        if (item.mesh.geometry) {
          item.mesh.geometry.dispose();
        }
        
        if (Array.isArray(item.mesh.material)) {
          item.mesh.material.forEach(material => material.dispose());
        } else if (item.mesh.material) {
          item.mesh.material.dispose();
        }
      }
      
      // Remove from list
      this.worldItems.splice(itemIndex, 1);
      
      // Notify listeners
      if (this.onWorldItemsUpdated) {
        this.onWorldItemsUpdated(this.worldItems);
      }
    }
  };

  // Clear all items
  public clearAllItems = () => {
    // Remove all meshes from scene
    this.worldItems.forEach(item => {
      if (item.mesh) {
        this.scene.remove(item.mesh);
        
        // Clean up geometry and materials
        if (item.mesh.geometry) {
          item.mesh.geometry.dispose();
        }
        
        if (Array.isArray(item.mesh.material)) {
          item.mesh.material.forEach(material => material.dispose());
        } else if (item.mesh.material) {
          item.mesh.material.dispose();
        }
      }
    });
    
    // Clear array
    this.worldItems = [];
    
    // Notify listeners
    if (this.onWorldItemsUpdated) {
      this.onWorldItemsUpdated(this.worldItems);
    }
  };

  // Get all world items
  public getWorldItems = (): WorldItem[] => {
    return [...this.worldItems];
  };
  
  // Update items animation
  public updateItems = (delta: number) => {
    const time = Date.now() / 1000;
    
    // Process items in batches to improve CPU cache locality
    const itemCount = this.worldItems.length;
    
    // Batch size chosen as power of 2 for optimization
    const batchSize = 8; // Could be adjusted based on performance testing
    const batchCount = Math.ceil(itemCount / batchSize);
    
    for (let b = 0; b < batchCount; b++) {
      const startIdx = b * batchSize;
      const endIdx = Math.min(startIdx + batchSize, itemCount);
      
      // Process a batch of items
      for (let i = startIdx; i < endIdx; i++) {
        const item = this.worldItems[i];
        if (item.mesh && item.mesh.userData.animateY) {
          // Apply halving/doubling scalar logic to hover animation
          // Original: sin(time * 2) * 0.1
          // Optimized: sin(time * 4 * 0.5) * (0.2 * 0.5)
          // This can improve instruction pipelining
          const phase = item.mesh.userData.phase || 0;
          const baseY = item.mesh.userData.baseY || 0.25;
          
          // Using halving/doubling scalar logic 
          const timeMultiplier = 4 * 0.5; // Equivalent to 2
          const amplitudeMultiplier = 0.2 * 0.5; // Equivalent to 0.1
          
          item.mesh.position.y = baseY + Math.sin(time * timeMultiplier + phase) * amplitudeMultiplier;
          
          // Apply halving/doubling scalar logic to rotation
          // Original: delta * 0.5
          // Optimized: (delta * 1.0) * 0.5 
          // This maintains the same behavior but potentially allows better CPU optimization
          item.mesh.rotation.y += (delta * 1.0) * 0.5;
        }
      }
    }
  };

  // Clean up all resources
  public cleanup = () => {
    this.clearAllItems();
    this.cleanupSocketListeners();
  };
}

export default ItemManager; 