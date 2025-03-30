import * as THREE from 'three';
import { getSocket } from '../network/socket';
import { WorldItem, createItemMesh } from './resources';
import { Item } from '../../types/player';
import soundManager from '../audio/soundManager';

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

    console.log('%c 🎮 SETTING UP ITEM SOCKET LISTENERS', 'background: #4CAF50; color: white; font-size: 14px;');
    console.log('Socket ID:', (socket as any).id);

    // Create a single global tracking object for all drops across events
    if (!(window as any).processedItemDropIds) {
      (window as any).processedItemDropIds = {};
    }

    // Listen for new dropped items
    (socket as any).on('itemDropped', (item: any) => {
      try {
        console.log(`%c 📦 SOCKET EVENT: Received itemDropped event:`, "background: #FF9800; color: white; font-size: 14px;", item);
        if (!item || !item.dropId || !item.itemType) {
          console.error('Invalid item data received in itemDropped event:', item);
          return;
        }

        // CRITICAL: Check BEFORE any processing if this mesh already exists in the scene
        const existingMesh = Array.from(this.scene.children).find(
          child => child.userData && child.userData.dropId === item.dropId
        );
        
        if (existingMesh) {
          console.log(`%c 🚫 Mesh for drop ID ${item.dropId} already exists in scene - SKIPPING (itemDropped)`, "background: #FF0000; color: white;");
          return;
        }

        // Lock this specific itemDropId to prevent race conditions
        if ((window as any).processedItemDropIds[item.dropId]) {
          console.log(`%c 🔒 Drop ID ${item.dropId} already being processed - SKIPPING (itemDropped)`, "background: #FF9800; color: white;");
          return;
        }
        
        // Mark this item as processed IMMEDIATELY to prevent race conditions
        console.log(`%c 🔐 Locking drop ID ${item.dropId} for processing (itemDropped)`, "color: #FF5722;");
        (window as any).processedItemDropIds[item.dropId] = Date.now();
        
        // Play a sound for item dropping
        soundManager.play('itemDrop' as any);
        
        console.log(`%c 🌎 Creating world item from itemDropped event: ${item.itemType} at (${item.x}, ${item.y}, ${item.z})`, "background: #4CAF50; color: white;");
        
        // Add to world items - this creates the animated mesh
        this.addWorldItem({
          dropId: item.dropId,
          itemType: item.type || item.itemType, // Try both formats - important
          x: item.x,
          y: item.y,
          z: item.z
        });
      } catch (error) {
        console.error('Error handling itemDropped event:', error);
      }
    });

    // Handle worldItemAdded events - only create mesh if not already processed
    (socket as any).on('worldItemAdded', (item: any) => {
      try {
        console.log(`%c 📦 SOCKET EVENT: Received worldItemAdded event:`, "background: #2196F3; color: white; font-size: 14px;", item);
        if (!item || !item.dropId || !item.itemType) {
          console.error('Invalid item data received in worldItemAdded event:', item);
          return;
        }
        
        // CRITICAL: Check FIRST if mesh already exists in scene
        const existingMesh = Array.from(this.scene.children).find(
          child => child.userData && child.userData.dropId === item.dropId
        );
        
        if (existingMesh) {
          console.log(`%c 🚫 Mesh for drop ID ${item.dropId} already exists in scene - SKIPPING (worldItemAdded)`, "background: #FF0000; color: white;");
          
          // Even if we skip creating a new mesh, ensure the existing one has animation
          existingMesh.userData.animateY = true;
          existingMesh.userData.baseY = existingMesh.position.y || 0.25;
          existingMesh.userData.phase = Math.random() * Math.PI * 2;
          existingMesh.userData.rotationSpeed = (Math.random() * 0.3) + 0.2;
          return;
        }
        
        // Check if we've already processed or are currently processing this drop ID
        if ((window as any).processedItemDropIds[item.dropId]) {
          console.log(`%c 🔒 Drop ID ${item.dropId} already being processed - SKIPPING (worldItemAdded)`, "background: #2196F3; color: white;");
          return;
        }
        
        // Mark this item as processed IMMEDIATELY
        console.log(`%c 🔐 Locking drop ID ${item.dropId} for processing (worldItemAdded)`, "color: #2196F3;");
        (window as any).processedItemDropIds[item.dropId] = Date.now();
        
        // Check if it's our own drop or another player's - just for logging
        const isOurDrop = item.droppedBy === (socket as any).id;
        console.log(`%c Item dropped by ${isOurDrop ? 'us' : 'another player'}: ${item.itemType}`, isOurDrop ? "color: #FF5722;" : "color: #00BCD4;");
        
        console.log(`%c 🌎 Creating world item from worldItemAdded event: ${item.itemType} at (${item.x}, ${item.y}, ${item.z})`, "background: #4CAF50; color: white;");
        
        // Play sound only for other players' drops
        if (!isOurDrop) {
          soundManager.play('itemDrop' as any);
        }
        
        // Add to world items - this will create the mesh with animation properties
        this.addWorldItem({
          dropId: item.dropId,
          itemType: item.type || item.itemType,
          x: item.x,
          y: item.y,
          z: item.z
        });
      } catch (error) {
        console.error('Error handling worldItemAdded event:', error);
      }
    });

    // Listen for item pickup events
    (socket as any).on('itemPickedUp', (data: any) => {
      console.log(`Received itemPickedUp event:`, data);
      // When an item is picked up, we need to:
      // 1. Remove the item from the scene
      this.removeWorldItem(data.dropId);
      // 2. Remove it from our tracking to allow it to be recreated if dropped again
      if ((window as any).processedItemDropIds) {
        delete (window as any).processedItemDropIds[data.dropId];
      }
    });

    // Also listen for the alternative worldItemRemoved event
    (socket as any).on('worldItemRemoved', (dropId: string) => {
      console.log(`Received worldItemRemoved event: ${dropId}`);
      // When an item is removed, we need to:
      // 1. Remove the item from the scene
      this.removeWorldItem(dropId);
      // 2. Remove it from our tracking to allow it to be recreated if dropped again
      if ((window as any).processedItemDropIds) {
        delete (window as any).processedItemDropIds[dropId];
      }
    });

    // Check for existing world items
    console.log('Requesting initial world items');
    this.requestWorldItems();

    // Listen for all world items (initial sync)
    (socket as any).on('worldItems', (items: any[]) => {
      console.log(`Received ${items.length} world items from server:`, items);
      
      // Only clear if we get a valid response
      if (Array.isArray(items)) {
        // Clear existing items first
        this.clearAllItems();
        
        // Add all items from server
        if (items.length > 0) {
          items.forEach(item => {
            if (item && item.dropId && item.itemType) {
              this.addWorldItem(item);
            } else {
              console.error('Invalid item in worldItems array:', item);
            }
          });
        } else {
          console.log("Server returned zero world items. The area is empty.");
        }
      } else {
        console.error('worldItems event received non-array data:', items);
      }
    });
    
    console.log('Item socket listeners set up successfully');
  };

  // Request world items from server - can be called anytime to refresh
  public requestWorldItems = async () => {
    console.log('Requesting world items from server');
    const socket = await getSocket();
    if (socket) {
      (socket as any).emit('getWorldItems');
      console.log('getWorldItems event sent to server');
    } else {
      console.error('Failed to get socket for requesting world items');
    }
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
    
    console.log(`%c 📦 ItemManager.dropItem: Attempting to drop ${item.type} at position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`, "background: #FF9800; color: white; font-size: 14px;");
    console.log(`Item being dropped:`, item);
    
    try {
      // Create a unique client tracking ID for this specific drop attempt
      const clientDropId = `client-drop-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      
      // Add client-side tracking for this particular drop
      if (!(window as any).pendingItemDrops) {
        (window as any).pendingItemDrops = {};
      }
      (window as any).pendingItemDrops[clientDropId] = {
        itemId: item.id,
        itemType: item.type,
        startTime: Date.now()
      };
      
      // Set up one-time listeners for this specific drop
      const dropSuccessTimeout = setTimeout(() => {
        console.log(`%c ⚠️ Drop request timed out for ${item.type}`, "color: #FF9800;");
        delete (window as any).pendingItemDrops[clientDropId];
      }, 5000); // 5 second timeout
      
      // Listen for worldItemAdded events that might correspond to our drop
      const worldItemHandler = (worldItem: any) => {
        // Check if this is our item by matching type and approximate drop time
        const now = Date.now();
        const isPotentialMatch = 
          worldItem.itemType === item.type && 
          Math.abs(now - (window as any).pendingItemDrops[clientDropId]?.startTime) < 3000;
        
        if (isPotentialMatch) {
          console.log(`%c ✅ Received confirmation of dropped item: ${worldItem.dropId}`, "color: #4CAF50; font-weight: bold;");
          
          // Clean up
          clearTimeout(dropSuccessTimeout);
          delete (window as any).pendingItemDrops[clientDropId];
          (socket as any).off('worldItemAdded', worldItemHandler);
          
          // Important: Force animation to be enabled for this item if we have it in our world items
          const existingItem = this.worldItems.find(i => i.dropId === worldItem.dropId);
          if (existingItem && existingItem.mesh) {
            existingItem.mesh.userData.animateY = true;
            existingItem.mesh.userData.baseY = existingItem.mesh.position.y || 0.25;
            existingItem.mesh.userData.phase = Math.random() * Math.PI * 2;
            existingItem.mesh.userData.rotationSpeed = (Math.random() * 0.3) + 0.2;
          }
        }
      };
      
      // Set up the one-time listener
      (socket as any).on('worldItemAdded', worldItemHandler);
      
      // Prepare the drop data with all necessary information
      const dropData = {
        itemId: item.id,          // Item ID for inventory management
        itemType: item.type,      // CRITICAL: Include the item type directly
        x: position.x,
        y: position.y,
        z: position.z,
        clientDropId
      };
      
      console.log(`%c 📤 Emitting dropItem event with data:`, "color: #2196F3;", dropData);
      
      // Send the drop request
      (socket as any).emit('dropItem', dropData);
      
      // Schedule cleanup for the listener in case we don't get a match
      setTimeout(() => {
        (socket as any).off('worldItemAdded', worldItemHandler);
      }, 5000);
      
      console.log(`%c 🎯 Drop request sent for ${item.type} at position: (${position.x.toFixed(2)}, ${position.y.toFixed(2)}, ${position.z.toFixed(2)})`, "color: #4CAF50;");
      return true;
    } catch (error) {
      console.error('%c 💥 Error dropping item:', "color: red; font-weight: bold;", error);
      return false;
    }
  };

  // Add an item to the world
  public addWorldItem = (item: WorldItem) => {
    console.log(`%c ➕ Adding world item: ${item.itemType} at (${item.x.toFixed(2)}, ${item.y.toFixed(2)}, ${item.z.toFixed(2)})`, "background: #4CAF50; color: white; font-size: 14px;");
    
    if (!item.dropId) {
      console.error("Cannot add item without a dropId");
      return;
    }
    
    // CRITICAL STEP: Scan the entire scene first to see if a mesh with this dropId already exists
    // This is our strongest defense against duplicates
    const existingMeshes = Array.from(this.scene.children).filter(
      child => child.userData && child.userData.dropId === item.dropId
    );

    if (existingMeshes.length > 0) {
      console.log(`%c 🚫 Found ${existingMeshes.length} existing mesh(es) in scene for drop ID: ${item.dropId} - preventing duplicate`, "background: #FF0000; color: white;");
      
      // If we somehow have multiple meshes for this drop ID (should never happen), clean up extras
      if (existingMeshes.length > 1) {
        console.log(`%c ⚠️ CRITICAL: Found multiple meshes (${existingMeshes.length}) for same drop ID: ${item.dropId} - cleaning up extras`, "background: #FF0000; color: white;");
        
        // Keep only the first mesh, remove others
        for (let i = 1; i < existingMeshes.length; i++) {
          const extraMesh = existingMeshes[i];
          extraMesh.visible = false;
          this.scene.remove(extraMesh);
          console.log(`Removed extra mesh ${i} from scene`);
        }
      }
      
      // Make sure the primary mesh is animated
      const primaryMesh = existingMeshes[0];
      if (!primaryMesh.userData.animateY) {
        console.log(`Ensuring mesh is animated`);
        primaryMesh.userData.animateY = true;
        primaryMesh.userData.baseY = primaryMesh.position.y || 0.25; 
        primaryMesh.userData.phase = Math.random() * Math.PI * 2;
        primaryMesh.userData.rotationSpeed = (Math.random() * 0.3) + 0.2;
      }
      
      // Still update our tracking array if the item isn't there
      const existingItemIndex = this.worldItems.findIndex(i => i.dropId === item.dropId);
      if (existingItemIndex === -1) {
        // Add to our tracking array with the existing mesh
        this.worldItems.push({
          ...item,
          mesh: primaryMesh as THREE.Mesh
        });
        
        console.log(`Added item to worldItems array with existing mesh`);
        
        // Notify listeners
        if (this.onWorldItemsUpdated) {
          this.onWorldItemsUpdated(this.worldItems);
        }
      }
      
      return;
    }
    
    // Check if item already exists in our tracking array
    const existingItem = this.worldItems.find(i => i.dropId === item.dropId);
    if (existingItem) {
      console.log(`Item ${item.dropId} already exists in tracking array`);
      
      // Check if the mesh exists and is in the scene
      if (existingItem.mesh && existingItem.mesh.parent) {
        // Update position if needed
        existingItem.x = item.x;
        existingItem.y = item.y;
        existingItem.z = item.z;
        
        // Update mesh position
        existingItem.mesh.position.set(item.x, item.y, item.z);
        console.log(`Updated mesh position for ${item.itemType}`);
        
        // Ensure animation properties are set
        existingItem.mesh.userData.animateY = true;
        return;
      } else {
        // Mesh doesn't exist or isn't in scene - remove the item and recreate it
        console.log(`Item ${item.dropId} exists but mesh is missing or not in scene, recreating`);
        this.removeWorldItem(item.dropId);
        // Continue with creation below
      }
    }

    // Create mesh for the item
    try {
      console.log(`%c 🔨 Creating NEW mesh for ${item.itemType}`, "background: #2196F3; color: white; font-size: 14px;");
      
      // EXTRA CHECK: Verify again that no mesh with this dropId exists in the scene
      // This handles edge cases where a mesh was created between our initial check and now
      const lastMinuteCheck = Array.from(this.scene.children).find(
        child => child.userData && child.userData.dropId === item.dropId
      );
      
      if (lastMinuteCheck) {
        console.log(`%c ⚠️ RACE CONDITION CAUGHT: Mesh for ${item.dropId} created during processing - aborting duplicate creation`, "background: #FF0000; color: white;");
        return; // Abort mesh creation
      }
      
      // Normalize item type to lowercase and handle possible type variations
      let normalizedType = String(item.itemType || "unknown").toLowerCase();
      console.log(`Normalizing item type: '${item.itemType}' to lowercase: '${normalizedType}'`);
      
      if (normalizedType === 'fish' || normalizedType === 'raw_fish') {
        normalizedType = 'fish';
      } else if (normalizedType === 'coal_ore' || normalizedType === 'coal') {
        normalizedType = 'coal';
      } else if (normalizedType === 'wood' || normalizedType === 'logs' || normalizedType === 'log') {
        normalizedType = 'log';
      }
      
      console.log(`Final normalized item type: '${normalizedType}'`);
      
      // Try-catch the mesh creation to prevent crashes
      let mesh;
      try {
        // Create the item mesh
        mesh = createItemMesh(normalizedType);
      } catch (e) {
        console.error(`%c ❌ Error creating mesh for ${normalizedType}:`, "background: red; color: white;", e);
        // Create a fallback mesh
        mesh = createItemMesh("unknown");
      }
      
      // Set position - make sure it's slightly above ground to prevent z-fighting
      const posY = Math.max(item.y, 0.2); // Ensure minimum height
      mesh.position.set(item.x, posY, item.z);
      
      // Add a unique ID to the mesh itself for easier debugging
      mesh.name = `WorldItem-${item.dropId}-${item.itemType}`;
      
      // CRITICAL: Ensure animation properties are set correctly
      // Store item data in the mesh userData
      mesh.userData.dropId = item.dropId;
      mesh.userData.itemType = item.itemType;
      mesh.userData.animateY = true; // Enable hover animation - CRITICAL PROPERTY
      mesh.userData.baseY = posY; // Set base height
      mesh.userData.phase = Math.random() * Math.PI * 2; // Random phase for varied motion
      mesh.userData.rotationSpeed = (Math.random() * 0.3) + 0.2; // Random rotation speed
      
      // Add to scene
      this.scene.add(mesh);
      console.log(`%c ✅ Added mesh to scene for ${item.itemType} at (${item.x.toFixed(2)}, ${posY.toFixed(2)}, ${item.z.toFixed(2)})`, "background: #4CAF50; color: white;");
      
      // Store in items list
      const worldItem: WorldItem = {
        ...item,
        y: posY, // Update with adjusted y position
        mesh
      };
      
      this.worldItems.push(worldItem);
      console.log(`%c 📊 Added item to worldItems array, current count: ${this.worldItems.length}`, "color: #9C27B0; font-weight: bold;");
      
      // Notify listeners
      if (this.onWorldItemsUpdated) {
        this.onWorldItemsUpdated(this.worldItems);
      }
      
      // Force a re-render of all items on update to make sure they're visible
      this.updateItems(0.01);
      
      // Ensure server has this item in its worldItems list 
      this.ensureServerHasItem(item);
    } catch (error) {
      console.error(`%c 💥 FATAL ERROR: Failed to create mesh for ${item.itemType}:`, "background: red; color: white; font-size: 16px;", error);
    }
  };

  // Helper method to ensure the server has this item in its worldItems list
  private ensureServerHasItem = async (item: WorldItem) => {
    try {
      const socket = await getSocket();
      if (!socket) {
        console.error('No socket available for ensuring server has item');
        return;
      }
      
      console.log(`%c 🔄 Ensuring server has item: ${item.dropId} (${item.itemType})`, "background: #9C27B0; color: white;");
      
      // Set up a response handler to confirm registration
      const confirmationHandler = (response: any) => {
        if (response && response.success) {
          console.log(`%c ✅ Server successfully registered item: ${item.dropId}`, "color: #4CAF50;");
        } else if (response && response.exists) {
          console.log(`%c ℹ️ Item ${item.dropId} already exists on server`, "color: #2196F3;");
        } else if (response && response.error) {
          console.error(`Server error registering item: ${response.error}`);
        }
      };
      
      // Set up a one-time listener for the confirmation
      (socket as any).once('registerWorldItemResponse', confirmationHandler);
      
      // Inform the server about this item to ensure it's in the server's worldItems list
      (socket as any).emit('registerWorldItem', {
        dropId: item.dropId,
        itemType: item.itemType,
        x: item.x,
        y: item.y,
        z: item.z,
        requireConfirmation: true
      });
      
      console.log(`%c 📤 Sent registerWorldItem for: ${item.dropId}`, "color: #2196F3;");
      
      // Clean up the listener after a timeout
      setTimeout(() => {
        (socket as any).off('registerWorldItemResponse', confirmationHandler);
      }, 5000);
    } catch (error) {
      console.error('Failed to ensure server has item:', error);
    }
  };

  // Remove item from world
  public removeWorldItem = (dropId: string) => {
    console.log(`%c 🗑️ Removing world item with dropId: ${dropId}`, "background: #F44336; color: white; font-size: 14px;");
    
    // First, remove from our global tracking to allow recreation if needed
    if ((window as any).processedItemDropIds) {
      delete (window as any).processedItemDropIds[dropId];
      console.log(`Removed ${dropId} from global tracking`);
    }
    
    // Next, search the scene directly for any meshes with this dropId
    // This is the most reliable way to find and remove any duplicate meshes
    const itemMeshes = Array.from(this.scene.children).filter(
      child => child.userData && child.userData.dropId === dropId
    );
    
    if (itemMeshes.length > 0) {
      console.log(`%c Found ${itemMeshes.length} mesh(es) in scene with dropId: ${dropId}`, "color: #F44336;");
      
      // Remove all meshes with this dropId from the scene
      itemMeshes.forEach(mesh => {
        // Make it invisible first to prevent flickering
        mesh.visible = false;
        
        // Remove from scene
        this.scene.remove(mesh);
        console.log(`Removed mesh from scene`);
        
        // Clean up resources
        if ((mesh as THREE.Mesh).geometry) {
          (mesh as THREE.Mesh).geometry.dispose();
        }
        
        const material = (mesh as THREE.Mesh).material;
        if (Array.isArray(material)) {
          material.forEach(m => m.dispose());
        } else if (material) {
          material.dispose();
        }
        
        // Clear userData to release references
        mesh.userData = {};
      });
    }
    
    // Then, remove from our tracking array
    const itemIndex = this.worldItems.findIndex(item => item.dropId === dropId);
    if (itemIndex >= 0) {
      // Remove from the array
      this.worldItems.splice(itemIndex, 1);
      console.log(`%c Item removed from worldItems array. Remaining: ${this.worldItems.length}`, "color: #F44336;");
    } else {
      console.warn(`%c ⚠️ Item with dropId ${dropId} not found in worldItems array`, "color: #FF9800;");
    }
    
    // Notify listeners
    if (this.onWorldItemsUpdated) {
      this.onWorldItemsUpdated(this.worldItems);
    }
    
    // Force a render update
    this.updateItems(0.01);
    
    return true;
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
        if (item.mesh) {
          // Always make sure the animateY property is set for all items
          if (!item.mesh.userData.animateY) {
            console.log(`%c 🔄 Forcing animation for item mesh: ${item.itemType}`, "color: #FF9800;");
            item.mesh.userData.animateY = true;
            item.mesh.userData.baseY = item.mesh.position.y || 0.25;
            item.mesh.userData.phase = Math.random() * Math.PI * 2; // Random phase for varied motion
            item.mesh.userData.rotationSpeed = (Math.random() * 0.3) + 0.2;
          }
          
          // Always animate ALL items - we never want static meshes
          // Apply halving/doubling scalar logic to hover animation
          const phase = item.mesh.userData.phase || 0;
          const baseY = item.mesh.userData.baseY || 0.25;
          
          // Using halving/doubling scalar logic 
          const timeMultiplier = 4 * 0.5; // Equivalent to 2
          const amplitudeMultiplier = 0.2 * 0.5; // Equivalent to 0.1
          
          item.mesh.position.y = baseY + Math.sin(time * timeMultiplier + phase) * amplitudeMultiplier;
          
          // Apply halving/doubling scalar logic to rotation
          const rotationSpeed = item.mesh.userData.rotationSpeed || 0.5;
          item.mesh.rotation.y += (delta * 1.0) * rotationSpeed;
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

  // Test function to manually add an item at the player's position
  public testCreateItem = async (itemType: string = 'coal') => {
    if (!this.playerRef.current) {
      console.error("Can't create test item - player reference is null");
      return false;
    }
    
    console.log(`%c 🧪 Requesting test item: ${itemType} from server`, "background: #E91E63; color: white; font-size: 14px;");
    
    try {
      // Get socket for server communication
      const socket = await getSocket();
      if (!socket) {
        console.error("Socket not available for test item creation");
        return false;
      }
      
      // Request the server to add this item to our inventory
      // This ensures the item will be in our inventory on both client and server
      (socket as any).emit('testAddItem', itemType);
      console.log(`%c 📤 Sent testAddItem request to server for ${itemType}`, "color: #2196F3;");
      
      // Return success - we'll get an inventory update via socket events
      return true;
    } catch (error) {
      console.error("Failed to create test item:", error);
      return false;
    }
  };

  // Handle item pickup
  public pickupItem = async (dropId: string) => {
    console.log(`%c 🔍 Attempting to pick up item: ${dropId}`, "background: #9C27B0; color: white; font-size: 14px;");
    
    // Find the item in our local worldItems array
    const item = this.worldItems.find(i => i.dropId === dropId);
    
    if (!item) {
      console.warn(`%c ⚠️ Item ${dropId} not found in local worldItems array`, "color: #FF9800;");
      
      // Request a refresh of world items to ensure we're in sync with server
      this.requestWorldItems();
      return false;
    }
    
    try {
      // Use the socket to send pickup request
      const socket = await getSocket();
      if (!socket) {
        console.error('No socket available for item pickup');
        return false;
      }
      
      // Use the modern event format
      console.log(`%c 📤 Sending pickupItem event for: ${dropId}`, "background: #2196F3; color: white;");
      (socket as any).emit('pickupItem', { dropId, timestamp: Date.now() });
      
      // We'll wait for the server to confirm before removing the item
      return true;
    } catch (error) {
      console.error('Error picking up item:', error);
      return false;
    }
  };
}

export default ItemManager; 