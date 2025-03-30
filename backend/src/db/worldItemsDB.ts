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
    const supabase = getDatabase();
    const { data, error } = await supabase
      .from('world_items')
      .select('*');
    
    if (error) {
      throw error;
    }
    
    return data as WorldItem[];
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
    
    const supabase = getDatabase();
    
    // Create the item object
    const worldItem = {
      dropId,
      itemType,
      x,
      y,
      z,
      created: new Date()
    };
    
    // Check if this item already exists (by dropId)
    const { data: existingItem, error: checkError } = await supabase
      .from('world_items')
      .select('*')
      .eq('dropId', dropId)
      .single();
    
    if (checkError && checkError.code !== 'PGRST116') {
      // A real error (not just "no rows returned")
      throw checkError;
    }
    
    if (existingItem) {
      console.log(`Item ${dropId} already exists in database, updating`);
      // Update the existing item
      const { error: updateError } = await supabase
        .from('world_items')
        .update({ x, y, z, itemType })
        .eq('dropId', dropId);
      
      if (updateError) {
        throw updateError;
      }
    } else {
      // Insert the new item
      const { error: insertError } = await supabase
        .from('world_items')
        .insert(worldItem);
      
      if (insertError) {
        throw insertError;
      }
      
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
    const supabase = getDatabase();
    const { error } = await supabase
      .from('world_items')
      .delete()
      .eq('dropId', dropId);
    
    if (error) {
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error removing world item:', error);
    return false;
  }
}

export async function removeAllWorldItems(): Promise<boolean> {
  try {
    const supabase = getDatabase();
    const { error } = await supabase
      .from('world_items')
      .delete()
      .neq('dropId', 'placeholder'); // Delete all rows
    
    if (error) {
      throw error;
    }
    
    return true;
  } catch (error) {
    console.error('Error removing all world items:', error);
    return false;
  }
} 