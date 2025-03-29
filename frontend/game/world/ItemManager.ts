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
    if (!socket) {
      console.error('Failed to initialize item socket listeners - no socket available');
      return;
    }

    console.log('Setting up item socket listeners');

    // Listen for new dropped items
    (socket as any).on('itemDropped', (item: any) => {
      try {
        console.log(`SOCKET EVENT: Received itemDropped event:`, item);
        if (!item || !item.dropId || !item.itemType) {
          console.error('Invalid item data received in itemDropped event:', item);
          return;
        }
        
        // Check if we already have this item (could be our own drop)
        const existingItem = this.worldItems.find(i => i.dropId === item.dropId);
        if (existingItem && existingItem.mesh) {
          console.log(`Item already exists in world items: ${item.dropId}`);
          return;
        }
        
        console.log(`Creating world item from itemDropped event: ${item.itemType} at (${item.x}, ${item.y}, ${item.z})`);
        this.addWorldItem({
          dropId: item.dropId,
          itemType: item.itemType,
          x: item.x,
          y: item.y,
          z: item.z
        });
      } catch (error) {
        console.error('Error handling itemDropped event:', error);
      }
    });

    // Also listen for the alternative worldItemAdded event
    (socket as any).on('worldItemAdded', (item: any) => {
      try {
        console.log(`SOCKET EVENT: Received worldItemAdded event:`, item);
        if (!item || !item.dropId || !item.itemType) {
          console.error('Invalid item data received in worldItemAdded event:', item);
          return;
        }
        
        // Check if we already have this item (could be our own drop)
        const existingItem = this.worldItems.find(i => i.dropId === item.dropId);
        if (existingItem && existingItem.mesh) {
          console.log(`Item already exists in world items: ${item.dropId}`);
          return;
        }
        
        // Check if it's our own drop or another player's
        const isOurDrop = item.droppedBy === (socket as any).id;
        console.log(`Item dropped by ${isOurDrop ? 'us' : 'another player'}: ${item.itemType}`);
        
        console.log(`Creating world item from worldItemAdded event: ${item.itemType} at (${item.x}, ${item.y}, ${item.z})`);
        this.addWorldItem({
          dropId: item.dropId,
          itemType: item.itemType,
          x: item.x,
          y: item.y,
          z: item.z
        });
      } catch (error) {
        console.error('Error handling worldItemAdded event:', error);
      }
    });

    // Check for existing world items
    console.log('Requesting initial world items');
    (socket as any).emit('getWorldItems');

    // Listen for item pickup events
    (socket as any).on('itemPickedUp', (data: any) => {
      console.log(`Received itemPickedUp event:`, data);
      this.removeWorldItem(data.dropId);
    });

    // Also listen for the alternative worldItemRemoved event
    (socket as any).on('worldItemRemoved', (dropId: string) => {
      console.log(`Received worldItemRemoved event: ${dropId}`);
      this.removeWorldItem(dropId);
    });

    // Listen for all world items (initial sync)
    (socket as any).on('worldItems', (items: any[]) => {
      console.log(`Received ${items.length} world items from server:`, items);
      
      // Only clear if we get a valid response
      if (Array.isArray(items)) {
        // Clear existing items first
        this.clearAllItems();
        
        // Add all items from server
        items.forEach(item => {
          if (item && item.dropId && item.itemType) {
            this.addWorldItem(item);
          } else {
            console.error('Invalid item in worldItems array:', item);
          }
        });
      } else {
        console.error('worldItems event received non-array data:', items);
      }
    });
    
    console.log('Item socket listeners set up successfully');
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
    
    console.log(`ItemManager.dropItem: Position data for drop:`, {
      x: position.x,
      y: position.y,
      z: position.z
    });
    
    try {
      // Create a unique clientDropId to track this drop attempt
      const clientDropId = `client-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Use a SIMPLE, DIRECT approach sending just the essential data
      // This is what the test drop uses and it works
      console.log(`Using DIRECT DROP approach for ${item.type} at position:`, position);
      
      const dropData = {
        itemId: item.id,          // Item ID for inventory management
        itemType: item.type,      // CRITICAL: Include the item type directly
        x: position.x,
        y: position.y,
        z: position.z,
        clientDropId            // Include the client drop ID to track it
      };
      
      console.log(`Emitting dropItem event with DIRECT data:`, dropData);
      
      // Only send the single, complete format to avoid any confusion
      (socket as any).emit('dropItem', dropData);
      
      console.log(`Drop request sent for ${item.type} at position: ${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)}`);
      return true;
    } catch (error) {
      console.error('Error emitting dropItem event:', error);
      return false;
    }
  };

  // Add an item to the world
  public addWorldItem = (item: WorldItem) => {
    console.log(`Adding world item: ${item.itemType} at (${item.x.toFixed(2)}, ${item.y.toFixed(2)}, ${item.z.toFixed(2)})`);
    
    // Check if item already exists
    const existingItem = this.worldItems.find(i => i.dropId === item.dropId);
    if (existingItem) {
      console.log(`Item ${item.dropId} already exists, updating position`);
      // Update position if needed
      existingItem.x = item.x;
      existingItem.y = item.y;
      existingItem.z = item.z;
      
      // Update mesh position
      if (existingItem.mesh) {
        existingItem.mesh.position.set(item.x, item.y, item.z);
        console.log(`Updated mesh position for ${item.itemType}`);
      }
      
      return;
    }

    // Create mesh for the item
    try {
      console.log(`Creating mesh for ${item.itemType}`);
      
      // Normalize item type to lowercase and handle possible type variations
      let normalizedType = String(item.itemType).toLowerCase();
      console.log(`Normalizing item type: '${item.itemType}' to lowercase: '${normalizedType}'`);
      
      if (normalizedType === 'fish' || normalizedType === 'raw_fish') {
        normalizedType = 'fish';
      } else if (normalizedType === 'coal_ore' || normalizedType === 'coal') {
        normalizedType = 'coal';
      } else if (normalizedType === 'wood' || normalizedType === 'logs' || normalizedType === 'log') {
        normalizedType = 'log';
      }
      
      console.log(`Final normalized item type: '${normalizedType}'`);
      
      // Create the item mesh
      const mesh = createItemMesh(normalizedType);
      
      // Set position - make sure it's slightly above ground to prevent z-fighting
      const posY = Math.max(item.y, 0.2); // Ensure minimum height
      mesh.position.set(item.x, posY, item.z);
      
      // Store item data in the mesh userData
      mesh.userData.dropId = item.dropId;
      mesh.userData.itemType = item.itemType;
      mesh.userData.animateY = true; // Enable hover animation
      mesh.userData.baseY = posY; // Set base height
      mesh.userData.phase = Math.random() * Math.PI * 2; // Random phase for varied motion
      
      // Add to scene
      this.scene.add(mesh);
      console.log(`Created 3D mesh for ${item.itemType} at (${item.x.toFixed(2)}, ${posY.toFixed(2)}, ${item.z.toFixed(2)})`);
      
      // Store in items list
      const worldItem: WorldItem = {
        ...item,
        y: posY, // Update with adjusted y position
        mesh
      };
      
      this.worldItems.push(worldItem);
      console.log(`Added item to worldItems array, current count: ${this.worldItems.length}`);
      
      // Notify listeners
      if (this.onWorldItemsUpdated) {
        this.onWorldItemsUpdated(this.worldItems);
      }
      
      // Force a re-render of all items on update to make sure they're visible
      this.updateItems(0.01);
    } catch (error) {
      console.error(`Failed to create mesh for ${item.itemType}:`, error);
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

  // Test drop function for debugging
  public testDrop = async (): Promise<boolean> => {
    const socket = await getSocket();
    if (!socket || !this.playerRef.current) return false;

    console.log('Sending testDrop request to server');
    
    try {
      // Send the test drop request
      (socket as any).emit('testDrop');
      
      // Test both debug messages
      (socket as any).emit('debugEcho', { message: 'Testing drop system', timestamp: Date.now() });
      
      // Listen for the response
      (socket as any).once('testDropResponse', (response: any) => {
        console.log('Received testDrop response:', response);
        
        if (response && response.success && response.item) {
          console.log(`Test item created: ${response.item.itemType} at position (${response.item.x}, ${response.item.y}, ${response.item.z})`);
        } else {
          console.error('Test drop failed:', response);
        }
      });
      
      // Listen for the debug echo response
      (socket as any).once('debugEchoResponse', (response: any) => {
        console.log('Received debug echo response:', response);
      });
      
      return true;
    } catch (error) {
      console.error('Error sending test drop request:', error);
      return false;
    }
  };
}

export default ItemManager; 