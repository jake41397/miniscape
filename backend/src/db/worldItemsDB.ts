import { getDatabase } from './database';
import { v4 as uuidv4 } from 'uuid';

interface WorldItem {
  dropId: string;
  itemType: string;
  x: number;
  y: number;
  z: number;
  created?: Date;
}

export async function getWorldItems(): Promise<WorldItem[]> {
  try {
    const db = await getDatabase();
    const worldItems = await db.collection('worldItems').find({}).toArray();
    return worldItems as WorldItem[];
  } catch (error) {
    console.error('Error fetching world items:', error);
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
    console.log(`Saving world item to database: ${dropId} (${itemType}) at (${x}, ${y}, ${z})`);
    
    const db = await getDatabase();
    
    // Create the item object
    const worldItem: WorldItem = {
      dropId,
      itemType,
      x,
      y,
      z,
      created: new Date() // Add a timestamp
    };
    
    // Check if this item already exists (by dropId)
    const existingItem = await db.collection('worldItems').findOne({ dropId });
    
    if (existingItem) {
      console.log(`Item ${dropId} already exists in database, updating`);
      // Update the existing item
      await db.collection('worldItems').updateOne(
        { dropId },
        { $set: { x, y, z, itemType } }
      );
    } else {
      // Insert the new item
      await db.collection('worldItems').insertOne(worldItem);
      console.log(`Inserted new item ${dropId} into database`);
    }
    
    return true;
  } catch (error) {
    console.error('Error dropping item in world:', error);
    return false;
  }
}

export async function removeWorldItem(dropId: string): Promise<boolean> {
  try {
    const db = await getDatabase();
    const result = await db.collection('worldItems').deleteOne({ dropId });
    return result.deletedCount > 0;
  } catch (error) {
    console.error('Error removing world item:', error);
    return false;
  }
}

export async function removeAllWorldItems(): Promise<boolean> {
  try {
    const db = await getDatabase();
    await db.collection('worldItems').deleteMany({});
    return true;
  } catch (error) {
    console.error('Error removing all world items:', error);
    return false;
  }
} 