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
   * Handle item drop
   */
  public setupItemDropHandler(socket: ExtendedSocket): void {
    socket.on('dropItem', async (data: { 
      itemId: string, 
      quantity?: number,
      x: number,
      y: number,
      z: number
    }) => {
      if (!this.players[socket.id]) return;
      
      const { itemId, quantity = 1, x, y, z } = data;
      const playerInventory = this.players[socket.id].inventory;
      
      // Find the item in player inventory
      const itemIndex = playerInventory.findIndex(item => item.id === itemId);
      
      if (itemIndex === -1) {
        // Item not found in inventory
        return;
      }
      
      const item = playerInventory[itemIndex];
      
      // Ensure quantity is valid
      const dropQuantity = Math.min(quantity, item.quantity);
      
      if (dropQuantity <= 0) return;
      
      try {
        // Create unique drop ID
        const dropId = `${itemId}-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
        
        // Broadcast item drop to all players
        this.io.emit('itemDropped', {
          dropId,
          itemType: item.type,
          x,
          y,
          z,
          droppedBy: socket.id
        });
        
        // Update inventory
        if (item.quantity > dropQuantity) {
          // Reduce quantity
          playerInventory[itemIndex].quantity -= dropQuantity;
        } else {
          // Remove item if all were dropped
          playerInventory.splice(itemIndex, 1);
        }
        
        // Send updated inventory
        socket.emit('inventoryUpdate', playerInventory);
        
        // Save to database
        if (socket.user && socket.user.id) {
          await savePlayerInventory(socket.user.id, playerInventory);
        }
      } catch (error) {
        console.error('Error handling item drop:', error);
      }
    });
  }
}

export default InventoryHandler; 