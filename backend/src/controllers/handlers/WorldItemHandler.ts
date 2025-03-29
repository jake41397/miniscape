import { Server } from 'socket.io';
import { loadWorldItems, removeWorldItem, savePlayerInventory } from '../../models/gameModel';
import { ExtendedSocket, InventoryItem, PlayersStore, WorldItem } from '../types';
import { v4 as uuidv4 } from 'uuid';

export class WorldItemHandler {
  private io: Server;
  private players: PlayersStore;
  private worldItems: WorldItem[] = [];
  
  constructor(io: Server, players: PlayersStore) {
    this.io = io;
    this.players = players;
  }
  
  /**
   * Initialize world items
   */
  public async initialize(): Promise<void> {
    try {
      // Load world items from database
      this.worldItems = await loadWorldItems();
      console.log(`Loaded ${this.worldItems.length} world items from database`);
    } catch (error) {
      console.error('Failed to initialize world items:', error);
      // Initialize with empty array
      this.worldItems = [];
    }
  }
  
  /**
   * Send world items to a specific socket
   */
  public sendWorldItems(socket: ExtendedSocket): void {
    socket.emit('initWorldItems', this.worldItems);
  }
  
  /**
   * Set up item pickup listener
   */
  public setupItemPickupHandler(socket: ExtendedSocket): void {
    socket.on('pickupItem', async (data: { itemId: string }) => {
      if (!this.players[socket.id]) return;
      
      const { itemId } = data;
      const player = this.players[socket.id];
      
      // Find the world item
      const itemIndex = this.worldItems.findIndex(item => item.dropId === itemId);
      if (itemIndex === -1) {
        console.log(`Item ${itemId} not found for pickup`);
        return;
      }
      
      const worldItem = this.worldItems[itemIndex];
      
      try {
        // Create inventory item from world item
        const inventoryItem: InventoryItem = {
          id: uuidv4(),
          type: worldItem.itemType,
          quantity: 1
        };
        
        // Add to player inventory
        player.inventory.push(inventoryItem);
        
        // Save inventory to database
        if (socket.user && socket.user.id) {
          await savePlayerInventory(socket.user.id, player.inventory);
        }
        
        // Remove item from world
        this.worldItems.splice(itemIndex, 1);
        
        // Remove from database
        await removeWorldItem(worldItem.dropId);
        
        // Broadcast item removal to all players
        this.io.emit('itemPickedUp', {
          dropId: worldItem.dropId,
          pickedBy: socket.id,
          item: inventoryItem
        });
        
        // Update player's inventory
        socket.emit('inventoryUpdate', player.inventory);
        
        console.log(`Player ${socket.id} picked up item ${worldItem.dropId} (${worldItem.itemType})`);
      } catch (error) {
        console.error('Error handling item pickup:', error);
      }
    });
  }
  
  /**
   * Add a new world item
   */
  public addWorldItem(item: WorldItem): void {
    // Add to local list
    this.worldItems.push(item);
    
    // Broadcast to all players
    this.io.emit('itemDropped', item);
  }
  
  /**
   * Remove a world item
   */
  public removeWorldItem(dropId: string): void {
    const itemIndex = this.worldItems.findIndex(item => item.dropId === dropId);
    if (itemIndex === -1) return;
    
    // Remove from local list
    this.worldItems.splice(itemIndex, 1);
    
    // Try to remove from database
    removeWorldItem(dropId).catch(err => console.error(`Error removing world item ${dropId}:`, err));
    
    // Broadcast to all players
    this.io.emit('itemRemoved', { dropId });
  }
  
  /**
   * Clean up old items that have been in the world too long
   */
  public cleanupOldItems(): void {
    const now = Date.now();
    const ITEM_LIFETIME = 5 * 60 * 1000; // 5 minutes
    
    // Find old items
    const oldItems = this.worldItems.filter(item => {
      // Parse timestamp from drop ID if available
      const timestampMatch = item.dropId.match(/(\d+)/);
      if (!timestampMatch) return false;
      
      const dropTime = parseInt(timestampMatch[1]);
      return !isNaN(dropTime) && (now - dropTime > ITEM_LIFETIME);
    });
    
    // Remove each old item
    oldItems.forEach(item => {
      this.removeWorldItem(item.dropId);
      console.log(`Removed old world item ${item.dropId} (${item.itemType})`);
    });
  }
  
  /**
   * Start periodic cleanup of old items
   */
  public startCleanupInterval(): NodeJS.Timeout {
    // Run cleanup every minute
    return setInterval(() => {
      this.cleanupOldItems();
    }, 60000);
  }
}

export default WorldItemHandler; 