import mongoose, { Schema, Document, Types } from 'mongoose';
import logger from '../../utils/logger';
import { PlayerData, ResourceNode, WorldItem } from './index';

// Define interfaces for model objects
export interface IWorldItem extends Document {
  dropId: string;
  itemType: string;
  x: number;
  y: number;
  z: number;
}

export interface IResourceNode extends Document {
  id: string;
  type: string;
  specificType: string;
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
export const loadWorldItems = async (): Promise<IWorldItem[]> => {
  try {
    // Import the withDatabaseRetry utility
    const { withDatabaseRetry } = require('../../utils/dbUtils');
    
    const worldItems = await withDatabaseRetry(
      async () => WorldItem.find(),
      'Load world items',
      3, // 3 retries
      1000 // 1 second initial delay with exponential backoff
    );
    
    return worldItems.map((item: any) => {
      const itemObj = item.toObject();
      return {
        ...itemObj,
        dropId: itemObj.itemId
      } as unknown as IWorldItem;
    });
  } catch (error) {
    logger.error('Error loading world items', error instanceof Error ? error : new Error('Unknown error'));
    return [];
  }
};

/**
 * Load all resource nodes from the database
 */
export const loadResourceNodes = async (): Promise<IResourceNode[]> => {
  try {
    console.log('Executing loadResourceNodes query from MongoDB database...');
    
    // Import the withDatabaseRetry utility
    const { withDatabaseRetry } = require('../../utils/dbUtils');
    
    const resourceNodes = await withDatabaseRetry(
      async () => ResourceNode.find(),
      'Load resource nodes',
      3, // 3 retries
      1000 // 1 second initial delay with exponential backoff
    );
    
    if (!resourceNodes || resourceNodes.length === 0) {
      console.log('No resource nodes found in database. Please check if data exists in the ResourceNode collection.');
      return [];
    }
    
    console.log(`Raw resource_nodes data from MongoDB:`, resourceNodes);
    
    // Map database fields to ResourceNode interface
    const mappedNodes = resourceNodes.map((node: any) => {
      // Convert node to plain object
      const nodeObj = node.toObject();
      
      // Get the _id as string safely
      const id = nodeObj._id instanceof Types.ObjectId 
        ? nodeObj._id.toString() 
        : String(nodeObj._id);
      
      // Initialize with default state and remaining resources
      const metadata: Record<string, any> = {};
      
      // Set appropriate metadata based on the specific_type
      if (nodeObj.nodeType === 'tree') {
        metadata.treeType = nodeObj.specificType;
      } else if (nodeObj.nodeType === 'rock') {
        metadata.rockType = nodeObj.specificType;
      } else if (nodeObj.nodeType === 'fish') {
        // Determine spot type from specific_type
        if (nodeObj.specificType.includes('shrimp') || nodeObj.specificType.includes('herring') || 
            nodeObj.specificType.includes('anchovy')) {
          metadata.spotType = 'net';
        } else if (nodeObj.specificType.includes('lobster') || nodeObj.specificType.includes('crab')) {
          metadata.spotType = 'cage';
        } else {
          metadata.spotType = 'harpoon';
        }
        
        // Extract fish type
        const fishType = nodeObj.specificType.replace('_spot', '');
        metadata.fishTypes = [fishType];
      }
      
      return {
        id: id,
        type: nodeObj.nodeType,
        specificType: nodeObj.specificType,
        x: Number(nodeObj.x),
        y: Number(nodeObj.y),
        z: Number(nodeObj.z),
        respawnTime: Number(nodeObj.respawnTime || 60) * 1000, // Convert to milliseconds
        state: 'normal', // All resources start in normal state
        remainingResources: getDefaultResourceCount(nodeObj.specificType),
        metadata
      } as unknown as IResourceNode;
    });
    
    console.log(`Mapped ${mappedNodes.length} resource nodes with IDs:`, mappedNodes.map((n: any) => n.id));
    return mappedNodes;
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
    // Check if this is a temporary user
    const isTemporaryUser = userId.startsWith('temp-');
    
    if (isTemporaryUser) {
      // For temporary users, update the PlayerData with sessionId
      const result = await PlayerData.updateOne(
        { sessionId: userId },
        { 
          x: x,
          y: y,
          z: z,
          lastActive: new Date()
        }
      );
      
      if (!result.matchedCount) {
        logger.warn(`Player data not found for temp user ${userId}`);
      }
    } else {
      // For authenticated users, update the PlayerData with userId
      const result = await PlayerData.updateOne(
        { userId },
        { 
          x: x, 
          y: y, 
          z: z,
          updatedAt: new Date()
        }
      );
      
      if (!result.matchedCount) {
        logger.error(`Player data not found for user ${userId}`);
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(`Error saving position for player ${userId}`, error);
    // Don't rethrow the error - this prevents crashes but logs the issue
  }
};

/**
 * Save player inventory to the database
 */
export const savePlayerInventory = async (userId: string, inventory: any[]): Promise<void> => {
  try {
    // Check if this is a temporary user
    const isTemporaryUser = userId.startsWith('temp-');
    
    if (isTemporaryUser) {
      // For temporary users, update using sessionId
      const result = await PlayerData.updateOne(
        { sessionId: userId },
        { 
          inventory: inventory,
          lastActive: new Date()
        }
      );
      
      if (!result.matchedCount) {
        logger.warn(`Player data not found for temp user ${userId}`);
      }
    } else {
      // For authenticated users, update using userId
      const result = await PlayerData.updateOne(
        { userId },
        { 
          inventory: inventory,
          updatedAt: new Date()
        }
      );
      
      if (!result.matchedCount) {
        logger.error(`Player data not found for user ${userId}`);
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(`Error saving inventory for player ${userId}`, error);
    // Don't rethrow the error - this prevents crashes but logs the issue
  }
};

/**
 * Add a dropped item to the world in the database
 */
export const dropItemInWorld = async (dropId: string, itemType: string, x: number, y: number, z: number): Promise<void> => {
  try {
    // Import the withDatabaseRetry utility
    const { withDatabaseRetry } = require('../../utils/dbUtils');
    
    const newWorldItem = new WorldItem({
      itemId: dropId,
      itemType: itemType,
      x: x,
      y: y,
      z: z
    });
    
    await withDatabaseRetry(
      async () => newWorldItem.save(),
      `Save world item ${dropId}`,
      3, // 3 retries
      1000 // 1 second initial delay with exponential backoff
    );
  } catch (error) {
    logger.error('Error adding item to world', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
};

/**
 * Remove a dropped item from the world in the database
 */
export const removeWorldItem = async (dropId: string): Promise<void> => {
  try {
    // Import the withDatabaseRetry utility
    const { withDatabaseRetry } = require('../../utils/dbUtils');
    
    await withDatabaseRetry(
      async () => WorldItem.deleteOne({ itemId: dropId }),
      `Remove world item ${dropId}`,
      3, // 3 retries
      1000 // 1 second initial delay with exponential backoff
    );
  } catch (error) {
    logger.error('Error removing item from world', error instanceof Error ? error : new Error('Unknown error'));
    throw error;
  }
};

/**
 * Save player skills to the database
 */
export const savePlayerSkills = async (userId: string, skills: any): Promise<void> => {
  try {
    // Check if this is a temporary user
    const isTemporaryUser = userId.startsWith('temp-');
    
    if (isTemporaryUser) {
      // For temporary users
      const result = await PlayerData.updateOne(
        { sessionId: userId },
        { 
          stats: { ...skills },
          lastActive: new Date()
        }
      );
      
      if (!result.matchedCount) {
        logger.warn(`Player data not found for temp user ${userId}`);
        
        // Try alternative approach - store in the inventory as a special item
        await storeSkillsInInventory(userId, skills);
      }
    } else {
      // For authenticated users
      const result = await PlayerData.updateOne(
        { userId },
        { 
          stats: { ...skills },
          updatedAt: new Date()
        }
      );
      
      if (!result.matchedCount) {
        logger.error(`Player data not found for user ${userId}`);
      }
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(`Error saving skills for player ${userId}`, error);
    
    // Attempt fallback for temporary users
    if (userId.startsWith('temp-')) {
      try {
        await storeSkillsInInventory(userId, skills);
      } catch (fallbackError) {
        const error = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
        logger.error(`Fallback storage for skills also failed for user ${userId}`, error);
      }
    }
  }
};

/**
 * Helper function to store skills in the inventory for temporary users
 * This is a fallback method if the normal skills storage fails
 */
async function storeSkillsInInventory(userId: string, skills: any): Promise<void> {
  try {
    // Get current inventory
    const playerData = await PlayerData.findOne(
      { sessionId: userId },
      { inventory: 1 }
    ).lean();
    
    if (!playerData) {
      logger.warn(`Player data not found for temp user ${userId} in storeSkillsInInventory`);
      return;
    }
    
    // Get the inventory or default to empty array
    let inventory: any[] = playerData.inventory || [];
    
    // Find and remove any existing skills item
    inventory = inventory.filter((item: any) => item.type !== '_skills_data');
    
    // Add skills as a special inventory item that won't be displayed
    inventory.push({
      id: `skills-${Date.now()}`,
      type: '_skills_data',
      skills: skills
    });
    
    // Update the inventory
    const result = await PlayerData.updateOne(
      { sessionId: userId },
      { 
        inventory: inventory,
        lastActive: new Date()
      }
    );
    
    if (!result.matchedCount) {
      logger.warn(`Error updating inventory with skills for temp user ${userId}: No matching document`);
    }
  } catch (err) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(`Error in storeSkillsInInventory for user ${userId}:`, error);
  }
}

/**
 * Check database connection
 */
export const checkDatabaseConnection = async (): Promise<boolean> => {
  try {
    // Check mongoose connection state
    const connected = mongoose.connection.readyState === 1;
    if (!connected) {
      throw new Error('Mongoose connection not established');
    }
    
    console.log('Database connection verified');
    return true;
  } catch (error) {
    console.error('Database connection check failed:', error);
    return false;
  }
};

/**
 * Insert a new resource node
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
    const newNode = new ResourceNode({
      nodeType: node.node_type,
      specificType: node.specific_type,
      x: node.x,
      y: node.y,
      z: node.z,
      respawnTime: node.respawn_time || 30
    });
    
    const savedNode = await newNode.save();
    const nodeId = savedNode._id;
    
    // Safely convert _id to string
    if (nodeId) {
      return nodeId instanceof Types.ObjectId 
        ? nodeId.toString() 
        : String(nodeId);
    }
    
    return null;
  } catch (error) {
    console.error('Error inserting resource node:', error);
    return null;
  }
}; 