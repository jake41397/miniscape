import { Server } from 'socket.io';
import { savePlayerInventory } from '../../models/gameModel';
import { ExtendedSocket, InventoryItem, Player, PlayersStore } from '../types';

export class InventoryHandler {
  private io: Server;
  private players: PlayersStore;
  
  constructor(io: Server, players: PlayersStore) {
    this.io = io;
    this.players = players;
  }
  
  /**
   * Setup inventory update listener
   */
  public setupInventoryUpdateHandler(socket: ExtendedSocket): void {
    socket.on('updateInventory', async (inventory: InventoryItem[]) => {
      if (!this.players[socket.id]) return;
      
      try {
        // Update player inventory in server memory
        this.players[socket.id].inventory = inventory;
        
        // Save to database if we have a user ID
        if (socket.user && socket.user.id) {
          await savePlayerInventory(socket.user.id, inventory);
        }
      } catch (error) {
        console.error('Error updating inventory:', error);
      }
    });
  }
  
  /**
   * Send inventory to player
   */
  public sendInventory(socket: ExtendedSocket, inventory: InventoryItem[]): void {
    socket.emit('inventoryUpdate', inventory);
  }
  
  /**
   * Handle item use event
   */
  public setupItemUseHandler(socket: ExtendedSocket): void {
    socket.on('useItem', async (data: { itemId: string }) => {
      if (!this.players[socket.id]) return;
      
      const { itemId } = data;
      const playerInventory = this.players[socket.id].inventory;
      
      // Find the item in player inventory
      const itemIndex = playerInventory.findIndex(item => item.id === itemId);
      
      if (itemIndex === -1) {
        // Item not found in inventory
        return;
      }
      
      const item = playerInventory[itemIndex];
      
      try {
        // Handle different item types
        switch (item.type) {
          case 'food':
            // Handle food consumption (healing, etc.)
            console.log(`Player ${socket.id} consumed food: ${item.id}`);
            
            // Reduce quantity
            if (item.quantity > 1) {
              playerInventory[itemIndex].quantity -= 1;
            } else {
              // Remove item if quantity is now 0
              playerInventory.splice(itemIndex, 1);
            }
            
            // Send updated inventory
            socket.emit('inventoryUpdate', playerInventory);
            
            // Save to database
            if (socket.user && socket.user.id) {
              await savePlayerInventory(socket.user.id, playerInventory);
            }
            break;
            
          // Add other item types here
          default:
            console.log(`Player ${socket.id} used item: ${item.id}`);
            break;
        }
      } catch (error) {
        console.error('Error handling item use:', error);
      }
    });
  }
  
  /**
   * Handle equip item event
   */
  public setupEquipItemHandler(socket: ExtendedSocket): void {
    socket.on('equipItem', async (data: { itemId: string }) => {
      if (!this.players[socket.id]) return;
      
      const { itemId } = data;
      const player = this.players[socket.id];
      const playerInventory = player.inventory;
      
      // Find the item in player inventory
      const itemIndex = playerInventory.findIndex(item => item.id === itemId);
      
      if (itemIndex === -1) {
        // Item not found in inventory
        console.log(`Player ${socket.id} tried to equip non-existent item: ${itemId}`);
        return;
      }
      
      const item = playerInventory[itemIndex];
      
      try {
        // Check if this is an equippable item type
        const equippableTypes = ['bronze_pickaxe', 'bronze_axe'];
        if (!equippableTypes.includes(item.type)) {
          console.log(`Player ${socket.id} tried to equip non-equippable item: ${item.type}`);
          return;
        }
        
        // Set the equipped item
        player.equippedItem = item;
        console.log(`Player ${socket.id} equipped item: ${item.type} (${item.id})`);
        
        // Notify client about equipped item
        socket.emit('equippedItem', item);
        
        // Save player's state to database if needed
        // This would depend on your database schema
      } catch (error) {
        console.error('Error handling item equip:', error);
      }
    });
  }
  
  /**
   * Handle item drop
   */
  public setupItemDropHandler(socket: ExtendedSocket): void {
    socket.on('dropItem', async (data: { 
      itemId: string, 
      itemType?: string,
      quantity?: number,
      x?: number,
      y?: number,
      z?: number,
      clientDropId?: string
    }) => {
      try {
        console.log(`[${socket.id}] DROP ITEM (InventoryHandler) request received:`, data);
        console.log(`[${socket.id}] Players store has key ${socket.id}:`, !!this.players[socket.id]);
        console.log(`[${socket.id}] Players object keys:`, Object.keys(this.players));
        
        if (!this.players[socket.id]) {
          console.error(`[${socket.id}] Player not found in players store`);
          
          // EMERGENCY FIX: Create a test drop item at the provided position even if player isn't found
          // This ensures other players can at least see the drop
          if (data.x !== undefined && data.y !== undefined && data.z !== undefined && data.itemType) {
            const emergencyItem = {
              dropId: `emergency-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              itemType: data.itemType,
              x: data.x,
              y: data.y,
              z: data.z,
              droppedBy: socket.id
            };
            
            console.log(`[${socket.id}] EMERGENCY: Creating direct drop at (${data.x}, ${data.y}, ${data.z})`);
            
            // Broadcast item drop to all players
            this.io.emit('itemDropped', emergencyItem);
            this.io.emit('worldItemAdded', emergencyItem);
            return;
          }
          
          return;
        }
        
        const player = this.players[socket.id];
        console.log(`[${socket.id}] Found player: ${player.name}`);
        
        // Direct drop method - if item type is provided, use it directly
        if (data.itemType && data.x !== undefined && data.y !== undefined && data.z !== undefined) {
          console.log(`[${socket.id}] Using DIRECT DROP with provided item type: ${data.itemType}`);
          
          // Create unique drop ID
          const dropId = `drop-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          
          // Create the item data
          const itemData = {
            dropId,
            itemType: data.itemType,
            x: data.x,
            y: data.y,
            z: data.z,
            droppedBy: socket.id
          };
          
          console.log(`[${socket.id}] Broadcasting direct drop to ALL clients:`, itemData);
          
          // CRITICAL: Broadcast to ALL clients, including the sender
          this.io.emit('itemDropped', itemData);
          this.io.emit('worldItemAdded', itemData);
          
          // Handle inventory update separately - this ensures drop works even if inventory processing fails
          if (data.itemId) {
            try {
              this.removeItemFromInventory(socket, data.itemId, data.quantity || 1);
            } catch (error) {
              console.error(`[${socket.id}] Failed to update inventory, but drop was still created:`, error);
            }
          }
          
          return;
        }
        
        // Fall back to traditional inventory-based drop if direct drop isn't possible
        const { itemId, quantity = 1 } = data;
        
        // Use provided position or default to player's current position
        const x = data.x !== undefined ? data.x : player.x;
        const y = data.y !== undefined ? data.y : player.y;
        const z = data.z !== undefined ? data.z : player.z;
        
        console.log(`[${socket.id}] Traditional drop position: (${x}, ${y}, ${z})`);
        console.log(`[${socket.id}] Player inventory length:`, player.inventory?.length || 0);
        console.log(`[${socket.id}] Looking for itemId:`, itemId);
        
        const playerInventory = player.inventory || [];
        
        // Find the item in player inventory
        const itemIndex = playerInventory.findIndex(item => item.id === itemId);
        
        if (itemIndex === -1) {
          console.error(`[${socket.id}] Item ${itemId} not found in player's inventory`);
          console.log(`[${socket.id}] Available inventory item IDs:`, playerInventory.map(item => item.id));
          return;
        }
        
        const item = playerInventory[itemIndex];
        console.log(`[${socket.id}] Found item to drop: ${item.type} (${item.id})`);
        
        // Ensure quantity is valid
        const dropQuantity = Math.min(quantity, item.quantity || 1);
        
        if (dropQuantity <= 0) {
          console.error(`[${socket.id}] Invalid drop quantity: ${dropQuantity}`);
          return;
        }
        
        try {
          // Create unique drop ID
          const dropId = `drop-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
          
          // Log the drop position
          console.log(`[${socket.id}] Player dropped item ${item.type} at position (${x}, ${y}, ${z})`);
          
          // Broadcast item drop to all players with both events for compatibility
          const itemData = {
            dropId,
            itemType: item.type,
            x,
            y,
            z,
            droppedBy: socket.id
          };
          
          console.log(`[${socket.id}] Broadcasting item drop to ALL PLAYERS:`, itemData);
          
          // CRITICAL: Broadcast to ALL clients, including the sender
          this.io.emit('itemDropped', itemData);
          this.io.emit('worldItemAdded', itemData);
          
          // Update inventory
          if ((item.quantity || 1) > dropQuantity) {
            // Reduce quantity
            playerInventory[itemIndex].quantity = (playerInventory[itemIndex].quantity || 1) - dropQuantity;
            console.log(`[${socket.id}] Reduced item quantity to ${playerInventory[itemIndex].quantity}`);
          } else {
            // Remove item if all were dropped
            playerInventory.splice(itemIndex, 1);
            console.log(`[${socket.id}] Removed item from inventory`);
          }
          
          console.log(`[${socket.id}] Updated inventory:`, playerInventory);
          
          // Send updated inventory
          socket.emit('inventoryUpdate', playerInventory);
          
          // Save to database (async but we don't wait for it)
          if (socket.user?.id) {
            savePlayerInventory(socket.user.id, playerInventory).catch(error => {
              console.error(`Error saving inventory for user ${socket.user?.id}:`, error);
            });
          }
        } catch (error) {
          console.error(`[${socket.id}] Error in drop item handler:`, error);
          socket.emit('error', 'Failed to drop item. Please try again.');
        }
      } catch (error) {
        console.error(`[${socket.id}] Unexpected error in dropItem handler:`, error);
        socket.emit('error', 'An unexpected error occurred.');
      }
    });
  }
  
  // Helper method to remove an item from inventory
  private removeItemFromInventory(socket: ExtendedSocket, itemId: string, quantity: number): void {
    if (!this.players[socket.id]) return;
    
    const player = this.players[socket.id];
    const playerInventory = player.inventory || [];
    
    // Find the item in player inventory
    const itemIndex = playerInventory.findIndex(item => item.id === itemId);
    if (itemIndex === -1) return;
    
    const item = playerInventory[itemIndex];
    
    // Update inventory
    if ((item.quantity || 1) > quantity) {
      // Reduce quantity
      playerInventory[itemIndex].quantity = (playerInventory[itemIndex].quantity || 1) - quantity;
    } else {
      // Remove item if all were dropped
      playerInventory.splice(itemIndex, 1);
    }
    
    // Send updated inventory
    socket.emit('inventoryUpdate', playerInventory);
    
    // Save to database (async but we don't wait for it)
    if (socket.user?.id) {
      savePlayerInventory(socket.user.id, playerInventory).catch(error => {
        console.error(`Error saving inventory for user ${socket.user?.id}:`, error);
      });
    }
  }
  
  /**
   * Setup all inventory handlers
   */
  public setupAllHandlers(socket: ExtendedSocket): void {
    this.setupInventoryUpdateHandler(socket);
    this.setupItemUseHandler(socket);
    this.setupItemDropHandler(socket);
    this.setupRequestInventoryHandler(socket);
    this.setupDebugHandlers(socket);
  }
  
  /**
   * Setup handler for inventory request
   */
  public setupRequestInventoryHandler(socket: ExtendedSocket): void {
    socket.on('requestInventory', () => {
      if (!this.players[socket.id]) return;
      
      console.log(`[${socket.id}] Received inventory request from client`);
      
      // Send the current inventory to the player
      this.sendInventory(socket, this.players[socket.id].inventory || []);
    });
  }
  
  /**
   * Setup debug handlers to help troubleshoot issues
   */
  private setupDebugHandlers(socket: ExtendedSocket): void {
    // Handle request for world items (for debugging and synchronization)
    socket.on('getWorldItems', () => {
      console.log(`[${socket.id}] Received getWorldItems request`);
      
      // Query world items from database or in-memory store
      // This is a placeholder - you would replace with actual implementation
      const worldItems: {
        dropId: string;
        itemType: string;
        x: number;
        y: number;
        z: number;
      }[] = []; // You would populate this from your database
      
      console.log(`[${socket.id}] Sending ${worldItems.length} world items to client`);
      socket.emit('worldItems', worldItems);
    });
    
    // Add a debug echo handler to verify socket is working
    socket.on('debugEcho', (data: any) => {
      console.log(`[${socket.id}] Debug echo received:`, data);
      socket.emit('debugEchoResponse', { received: data, timestamp: Date.now() });
    });
    
    // Add a test drop handler to manually create an item in the world
    socket.on('testDrop', () => {
      try {
        console.log(`[${socket.id}] Test drop requested`);
        
        if (!this.players[socket.id]) {
          console.error(`[${socket.id}] Player not found for test drop`);
          return;
        }
        
        const player = this.players[socket.id];
        
        // Create a test item at the player's location
        const testItem = {
          dropId: `test-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          itemType: 'coal',
          x: player.x,
          y: player.y,
          z: player.z,
          droppedBy: socket.id
        };
        
        console.log(`[${socket.id}] Creating test item at (${testItem.x}, ${testItem.y}, ${testItem.z})`);
        
        // Broadcast to all players
        this.io.emit('itemDropped', testItem);
        this.io.emit('worldItemAdded', testItem);
        
        socket.emit('testDropResponse', { success: true, item: testItem });
      } catch (error) {
        console.error(`[${socket.id}] Error in test drop:`, error);
        socket.emit('testDropResponse', { success: false, error: 'Internal server error' });
      }
    });
  }
}

export default InventoryHandler; 