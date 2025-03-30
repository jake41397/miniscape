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
  state: 'normal' | 'harvested';
  remainingResources: number;
  metadata: Record<string, any>;
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
    console.log('Executing loadResourceNodes query from database...');
    
    const { data, error } = await supabase
      .from('resource_nodes')
      .select('*');
    
    if (error) {
      console.error('Supabase error loading resource_nodes:', error);
      throw error;
    }
    
    console.log(`Raw resource_nodes data from Supabase:`, data);
    
    if (!data || data.length === 0) {
      console.log('No resource nodes found in database. Please check if data exists in the resource_nodes table.');
      return [];
    }
    
    // Map database fields to ResourceNode interface
    const resourceNodes = data.map((node: any): ResourceNode => {
      // Initialize with default state and remaining resources
      const metadata: Record<string, any> = {};
      
      // Set appropriate metadata based on the specific_type
      if (node.node_type === 'tree') {
        metadata.treeType = node.specific_type;
      } else if (node.node_type === 'rock') {
        metadata.rockType = node.specific_type;
      } else if (node.node_type === 'fish') {
        // Determine spot type from specific_type
        if (node.specific_type.includes('shrimp') || node.specific_type.includes('herring') || 
            node.specific_type.includes('anchovy')) {
          metadata.spotType = 'net';
        } else if (node.specific_type.includes('lobster') || node.specific_type.includes('crab')) {
          metadata.spotType = 'cage';
        } else {
          metadata.spotType = 'harpoon';
        }
        
        // Extract fish type
        const fishType = node.specific_type.replace('_spot', '');
        metadata.fishTypes = [fishType];
      }
      
      return {
        id: node.id,
        type: node.node_type,
        x: Number(node.x),
        y: Number(node.y),
        z: Number(node.z),
        respawnTime: Number(node.respawn_time || 60) * 1000, // Convert to milliseconds
        state: 'normal', // All resources start in normal state
        remainingResources: getDefaultResourceCount(node.specific_type),
        metadata
      };
    });
    
    console.log(`Mapped ${resourceNodes.length} resource nodes with IDs:`, resourceNodes.map(n => n.id));
    return resourceNodes;
  } catch (error) {
    console.error('Error loading resource nodes:', error);
    console.error('Stack trace:', new Error().stack);
    return [];
  }
};

// Utility function to determine default resource count based on type
function getDefaultResourceCount(specificType: string): number {
  // Higher tier resources have fewer available harvests
  if (specificType.includes('magic') || specificType.includes('runite')) {
    return 2;
  } else if (specificType.includes('yew') || specificType.includes('adamantite')) {
    return 3;
  } else if (specificType.includes('maple') || specificType.includes('mithril')) {
    return 4;
  } else {
    return 5; // Default for common resources
  }
}

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

/**
 * Save player skills to database
 */
export const savePlayerSkills = async (userId: string, skills: any): Promise<void> => {
  try {
    const { error } = await supabase
      .from('player_data')
      .update({ 
        skills: skills,
        updated_at: new Date().toISOString()
      })
      .eq('user_id', userId);
    
    if (error) {
      throw error;
    }
  } catch (error) {
    logger.error(`Error saving skills for player ${userId}:`, error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
};

/**
 * Check database connection and attempt to reconnect if needed
 */
export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    console.log('Checking database connection...');
    
    // Try a simple query to verify connection
    const { data, error } = await supabase
      .from('resource_nodes')
      .select('count');
    
    if (error) {
      console.error('Database connection check failed:', error);
      return false;
    }
    
    console.log('Database connection is working properly.');
    return true;
  } catch (error) {
    console.error('Error checking database connection:', error);
    return false;
  }
};

/**
 * Insert a resource node into the database
 */
export const insertResourceNode = async (node: {
  node_type: string;
  specific_type: string;
  x: number;
  y: number;
  z: number;
  respawn_time?: number;
}): Promise<string | null> => {
  try {
    const { data, error } = await supabase
      .from('resource_nodes')
      .insert({
        node_type: node.node_type,
        specific_type: node.specific_type,
        x: node.x,
        y: node.y,
        z: node.z,
        respawn_time: node.respawn_time || 60 // Default 60 seconds
      })
      .select('id')
      .single();
    
    if (error) {
      console.error('Error inserting resource node:', error);
      return null;
    }
    
    return data.id;
  } catch (error) {
    console.error('Failed to insert resource node:', error);
    return null;
  }
}; 