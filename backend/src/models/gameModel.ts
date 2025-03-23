import supabase from '../config/supabase';
import logger from '../utils/logger';

// Define interfaces for model objects
interface WorldItem {
  dropId: string;
  itemType: string;
  x: number;
  y: number;
  z: number;
}

interface ResourceNode {
  id: string;
  type: string;
  x: number;
  y: number;
  z: number;
  respawnTime: number;
}

/**
 * Load all world items from the database
 */
export const loadWorldItems = async (): Promise<WorldItem[]> => {
  try {
    const { data, error } = await supabase
      .from('world_items')
      .select('*');
    
    if (error) {
      throw error;
    }
    
    return data.map((item: any): WorldItem => ({
      dropId: item.id,
      itemType: item.item_type,
      x: item.x,
      y: item.y,
      z: item.z
    }));
  } catch (error) {
    logger.error('Error loading world items', error instanceof Error ? error : new Error('Unknown error'));
    return [];
  }
};

/**
 * Load all resource nodes from the database
 */
export const loadResourceNodes = async (): Promise<ResourceNode[]> => {
  try {
    const { data, error } = await supabase
      .from('resource_nodes')
      .select('*');
    
    if (error) {
      throw error;
    }
    
    return data.map((node: any): ResourceNode => ({
      id: node.id,
      type: node.node_type,
      x: node.x,
      y: node.y,
      z: node.z,
      respawnTime: node.respawn_time
    }));
  } catch (error) {
    logger.error('Error loading resource nodes', error instanceof Error ? error : new Error('Unknown error'));
    return [];
  }
};

/**
 * Save player position to the database
 */
export const savePlayerPosition = async (userId: string, x: number, y: number, z: number): Promise<void> => {
  try {
    const { error } = await supabase
      .from('player_data')
      .update({ 
        x: x, 
        y: y, 
        z: z,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
    
    if (error) {
      throw error;
    }
  } catch (error) {
    logger.error(`Error saving position for player ${userId}`, error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
};

/**
 * Save player inventory to the database
 */
export const savePlayerInventory = async (userId: string, inventory: any[]): Promise<void> => {
  try {
    const { error } = await supabase
      .from('player_data')
      .update({ 
        inventory: JSON.stringify(inventory),
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
    
    if (error) {
      throw error;
    }
  } catch (error) {
    logger.error(`Error saving inventory for player ${userId}`, error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
};

/**
 * Add a dropped item to the world in the database
 */
export const dropItemInWorld = async (dropId: string, itemType: string, x: number, y: number, z: number): Promise<void> => {
  try {
    const { error } = await supabase
      .from('world_items')
      .insert({
        id: dropId,
        item_type: itemType,
        x: x,
        y: y,
        z: z
      });
    
    if (error) {
      throw error;
    }
  } catch (error) {
    logger.error('Error adding item to world', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
};

/**
 * Remove an item from the world in the database
 */
export const removeWorldItem = async (dropId: string): Promise<void> => {
  try {
    const { error } = await supabase
      .from('world_items')
      .delete()
      .eq('id', dropId);
    
    if (error) {
      throw error;
    }
  } catch (error) {
    logger.error(`Error removing world item ${dropId}`, error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
}; 