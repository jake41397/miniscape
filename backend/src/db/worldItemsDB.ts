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
    
    // First, count how many items we expect to delete
    const { data: countData, error: countError } = await supabase
      .from('world_items')
      .select('dropId', { count: 'exact' });
    
    if (countError) {
      console.error('Error counting world items before deletion:', countError);
      return false;
    }
    
    const itemCount = countData?.length || 0;
    console.log(`Found ${itemCount} items to delete from world_items table`);
    
    if (itemCount === 0) {
      console.log('No items to delete - world_items table is already empty');
      return true;
    }
    
    // More direct delete approach - just delete everything
    console.log('Executing unconditional DELETE on world_items table');
    const { error } = await supabase
      .from('world_items')
      .delete()
      .neq('dropId', 'DO_NOT_DELETE_THIS_DUMMY_VALUE'); // This will match ALL rows
    
    if (error) {
      console.error('Error in removeAllWorldItems database operation:', error);
      throw error;
    }
    
    // Verify deletion was successful
    console.log('Checking if any items remain after deletion');
    const { data: remainingData, error: checkError } = await supabase
      .from('world_items')
      .select('dropId');
    
    if (checkError) {
      console.error('Error checking for remaining items after deletion:', checkError);
      return false;
    }
    
    const remainingCount = remainingData?.length || 0;
    if (remainingCount > 0) {
      console.warn(`Warning: ${remainingCount} items remain in the database after deletion attempt`);
      console.warn('First 5 remaining items:', remainingData.slice(0, 5));
      
      // Try another deletion method as fallback
      try {
        console.log('Attempting fallback deletion using iterative approach');
        
        // In some cases, there might be a limit on how many rows can be deleted at once
        // Try to delete in batches if there are many items
        let batchSize = 100;
        let deletedTotal = 0;
        
        // Get all remaining item IDs
        const { data: allRemainingItems } = await supabase
          .from('world_items')
          .select('dropId');
          
        if (!allRemainingItems || allRemainingItems.length === 0) {
          console.warn('No items found during batch deletion check - this is unexpected');
          return false;
        }
        
        console.log(`Starting batch deletion of ${allRemainingItems.length} items`);
        
        // Delete in batches
        for (let i = 0; i < allRemainingItems.length; i += batchSize) {
          const batch = allRemainingItems.slice(i, i + batchSize);
          const dropIds = batch.map(item => item.dropId);
          
          console.log(`Deleting batch ${i/batchSize + 1}, size: ${dropIds.length}`);
          
          // Delete this batch
          const { error: batchError } = await supabase
            .from('world_items')
            .delete()
            .in('dropId', dropIds);
            
          if (batchError) {
            console.error(`Error deleting batch ${i/batchSize + 1}:`, batchError);
            continue; // Try next batch
          }
          
          deletedTotal += dropIds.length;
        }
        
        console.log(`Batch deletion completed, deleted ${deletedTotal} items`);
        
        // Final verification
        const { data: finalItems, error: finalCheckError } = await supabase
          .from('world_items')
          .select('dropId');
          
        if (finalCheckError) {
          console.error('Error in final verification:', finalCheckError);
          return false;
        }
        
        if (finalItems && finalItems.length > 0) {
          console.error(`CRITICAL: ${finalItems.length} items still remain after batch deletion`);
          
          // Last resort: delete each item one by one
          console.log('Attempting last resort: deleting items one by one');
          let finalDeleteCount = 0;
          
          for (const item of finalItems) {
            const { error: singleDeleteError } = await supabase
              .from('world_items')
              .delete()
              .eq('dropId', item.dropId);
              
            if (!singleDeleteError) {
              finalDeleteCount++;
            }
          }
          
          console.log(`One-by-one deletion completed, deleted ${finalDeleteCount}/${finalItems.length} items`);
          
          // Final check
          const { data: lastCheck } = await supabase
            .from('world_items')
            .select('count');
            
          if (lastCheck && lastCheck.length > 0) {
            console.error(`FATAL: Could not delete all items after multiple attempts`);
            return false;
          }
          
          console.log('One-by-one deletion successful');
          return true;
        }
      } catch (fallbackError) {
        console.error('Error in fallback deletion attempt:', fallbackError);
        return false;
      }
    }
    
    console.log(`Successfully removed all ${itemCount} items from the world_items table`);
    return true;
  } catch (error) {
    console.error('Error removing all world items:', error);
    return false;
  }
} 