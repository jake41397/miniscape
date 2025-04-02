import { v4 as uuidv4 } from 'uuid';
import { WorldItem } from '../models/mongodb';
import logger from '../utils/logger';

interface WorldItemData {
  dropId: string;
  itemType: string;
  x: number;
  y: number;
  z: number;
  created?: Date;
}

export async function getWorldItems(): Promise<WorldItemData[]> {
  try {
    // Get all world items from MongoDB
    const items = await WorldItem.find({});
    
    // Map MongoDB documents to the expected format
    return items.map(item => ({
      dropId: item.itemId,
      itemType: item.itemType,
      x: item.x,
      y: item.y,
      z: item.z,
      created: item.createdAt
    }));
  } catch (error) {
    logger.error('Error fetching world items:', error instanceof Error ? error : new Error('Unknown error'));
    return [];
  }
}

export async function dropItemInWorld(
  dropId: string,
  itemType: string,
  x: number,
  y: number,
  z: number
): Promise<boolean> {
  try {
    logger.info(`Saving world item to database: ${dropId} (${itemType}) at (${x}, ${y}, ${z})`);
    
    // Check if this item already exists (by dropId)
    const existingItem = await WorldItem.findOne({ itemId: dropId });
    
    if (existingItem) {
      logger.info(`Item ${dropId} already exists in database, updating`);
      // Update the existing item
      existingItem.itemType = itemType;
      existingItem.x = x;
      existingItem.y = y;
      existingItem.z = z;
      await existingItem.save();
    } else {
      // Insert the new item
      const worldItem = new WorldItem({
        itemId: dropId,
        itemType,
        x,
        y,
        z
      });
      
      await worldItem.save();
      logger.info(`Inserted new item ${dropId} into database`);
    }
    
    return true;
  } catch (error) {
    logger.error('Error dropping item in world:', error instanceof Error ? error : new Error('Unknown error'));
    return false;
  }
}

export async function removeWorldItem(dropId: string): Promise<boolean> {
  try {
    // Delete the item by itemId
    const result = await WorldItem.deleteOne({ itemId: dropId });
    
    // Check if the item was deleted
    return result.deletedCount > 0;
  } catch (error) {
    logger.error('Error removing world item:', error instanceof Error ? error : new Error('Unknown error'));
    return false;
  }
}

export async function removeAllWorldItems(): Promise<boolean> {
  try {
    // Count how many items we expect to delete
    const itemCount = await WorldItem.countDocuments({});
    logger.info(`Found ${itemCount} items to delete from WorldItem collection`);
    
    if (itemCount === 0) {
      logger.info('No items to delete - WorldItem collection is already empty');
      return true;
    }
    
    // Delete all items
    const result = await WorldItem.deleteMany({});
    
    // Verify deletion was successful
    const remainingCount = await WorldItem.countDocuments({});
    
    if (remainingCount > 0) {
      logger.warn(`Warning: ${remainingCount} items remain in the database after deletion attempt`);
      
      // Get the remaining items for logging
      const remainingItems = await WorldItem.find({}).limit(5);
      logger.warn('First 5 remaining items:', remainingItems);
      
      return false;
    }
    
    logger.info(`Successfully removed all ${result.deletedCount} items from the WorldItem collection`);
    return true;
  } catch (error) {
    logger.error('Error removing all world items:', error instanceof Error ? error : new Error('Unknown error'));
    return false;
  }
} 