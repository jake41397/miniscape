const supabase = require('../config/supabase');

/**
 * Load all world items from the database
 */
const loadWorldItems = async () => {
  try {
    const { data, error } = await supabase
      .from('world_items')
      .select('*');
    
    if (error) {
      throw error;
    }
    
    return data.map(item => ({
      dropId: item.id,
      itemType: item.item_type,
      x: item.x,
      y: item.y,
      z: item.z
    }));
  } catch (error) {
    console.error('Error loading world items:', error);
    return [];
  }
};

/**
 * Load all resource nodes from the database
 */
const loadResourceNodes = async () => {
  try {
    const { data, error } = await supabase
      .from('resource_nodes')
      .select('*');
    
    if (error) {
      throw error;
    }
    
    return data.map(node => ({
      id: node.id,
      type: node.node_type,
      x: node.x,
      y: node.y,
      z: node.z,
      respawnTime: node.respawn_time
    }));
  } catch (error) {
    console.error('Error loading resource nodes:', error);
    return [];
  }
};

/**
 * Save player position to the database
 */
const savePlayerPosition = async (userId, x, y, z) => {
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
    console.error(`Error saving position for player ${userId}:`, error);
    throw error;
  }
};

/**
 * Save player inventory to the database
 */
const savePlayerInventory = async (userId, inventory) => {
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
    console.error(`Error saving inventory for player ${userId}:`, error);
    throw error;
  }
};

/**
 * Add a dropped item to the world in the database
 */
const dropItemInWorld = async (dropId, itemType, x, y, z) => {
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
    console.error('Error adding item to world:', error);
    throw error;
  }
};

/**
 * Remove an item from the world in the database
 */
const removeWorldItem = async (dropId) => {
  try {
    const { error } = await supabase
      .from('world_items')
      .delete()
      .eq('id', dropId);
    
    if (error) {
      throw error;
    }
  } catch (error) {
    console.error(`Error removing world item ${dropId}:`, error);
    throw error;
  }
};

module.exports = {
  loadWorldItems,
  loadResourceNodes,
  savePlayerPosition,
  savePlayerInventory,
  dropItemInWorld,
  removeWorldItem
}; 