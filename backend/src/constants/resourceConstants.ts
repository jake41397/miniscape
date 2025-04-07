/**
 * Constants related to resource nodes in the game.
 */

// Respawn times in seconds for different resource node specific types
export const RESOURCE_RESPAWN_TIMES: { [specificType: string]: number } = {
  // Trees
  'normal_tree': 30,
  'oak_tree': 45,
  'willow_tree': 60,
  'maple_tree': 90,
  'yew_tree': 120,
  'magic_tree': 300,

  // Rocks / Ores
  'copper_rock': 30,
  'tin_rock': 30,
  'iron_rock': 60,
  'coal_rock': 75,
  'gold_rock': 90,
  'mithril_rock': 150,
  'adamantite_rock': 240,
  'runite_rock': 600,
  
  // Fishing Spots (example types)
  'shrimp_spot': 30, 
  'herring_spot': 45,
  'anchovy_spot': 45,
  'trout_spot': 60,
  'salmon_spot': 60,
  'lobster_spot': 90,
  'tuna_spot': 120,
  'swordfish_spot': 120,
  'shark_spot': 300,

  // Default for unknown types
  'default': 60 
};

// Experience points granted for successfully harvesting a resource
export const RESOURCE_XP_REWARDS: { [specificType: string]: number } = {
  // Trees (Woodcutting XP)
  'normal_tree': 25,
  'oak_tree': 37.5,
  'willow_tree': 67.5,
  'maple_tree': 100,
  'yew_tree': 175,
  'magic_tree': 250,

  // Rocks / Ores (Mining XP)
  'copper_rock': 17.5,
  'tin_rock': 17.5,
  'iron_rock': 35,
  'coal_rock': 50,
  'gold_rock': 65,
  'mithril_rock': 80,
  'adamantite_rock': 95,
  'runite_rock': 125,
  
  // Fishing Spots (Fishing XP)
  'shrimp_spot': 10, 
  'herring_spot': 30,
  'anchovy_spot': 40,
  'trout_spot': 50,
  'salmon_spot': 70,
  'lobster_spot': 90,
  'tuna_spot': 80, // Example, might be lower XP than lobster
  'swordfish_spot': 100,
  'shark_spot': 110,

  // Default for unknown types
  'default': 10
};

// Required skill levels to harvest a resource
// Format: { specificType: { skill: SkillType, level: number } }
// Note: Using strings for SkillType keys for simplicity in this constant definition
export const RESOURCE_LEVEL_REQUIREMENTS: { [specificType: string]: { skill: string, level: number } } = {
  // Trees (Woodcutting Level)
  'normal_tree': { skill: 'woodcutting', level: 1 },
  'oak_tree': { skill: 'woodcutting', level: 15 },
  'willow_tree': { skill: 'woodcutting', level: 30 },
  'maple_tree': { skill: 'woodcutting', level: 45 },
  'yew_tree': { skill: 'woodcutting', level: 60 },
  'magic_tree': { skill: 'woodcutting', level: 75 },

  // Rocks / Ores (Mining Level)
  'copper_rock': { skill: 'mining', level: 1 },
  'tin_rock': { skill: 'mining', level: 1 },
  'iron_rock': { skill: 'mining', level: 15 },
  'coal_rock': { skill: 'mining', level: 30 },
  'gold_rock': { skill: 'mining', level: 40 },
  'mithril_rock': { skill: 'mining', level: 55 },
  'adamantite_rock': { skill: 'mining', level: 70 },
  'runite_rock': { skill: 'mining', level: 85 },
  
  // Fishing Spots (Fishing Level)
  'shrimp_spot': { skill: 'fishing', level: 1 }, 
  'herring_spot': { skill: 'fishing', level: 10 },
  'anchovy_spot': { skill: 'fishing', level: 15 },
  'trout_spot': { skill: 'fishing', level: 20 },
  'salmon_spot': { skill: 'fishing', level: 30 },
  'lobster_spot': { skill: 'fishing', level: 40 },
  'tuna_spot': { skill: 'fishing', level: 35 },
  'swordfish_spot': { skill: 'fishing', level: 50 },
  'shark_spot': { skill: 'fishing', level: 76 },

  // Default for unknown types
  'default': { skill: 'none', level: 1 }
};

/**
 * Gets the standardized respawn time for a given resource specific type.
 * @param specificType The specific type of the resource node.
 * @returns The respawn time in seconds.
 */
export const getResourceRespawnTime = (specificType: string): number => {
  return RESOURCE_RESPAWN_TIMES[specificType] ?? RESOURCE_RESPAWN_TIMES['default'];
};

/**
 * Gets the standardized XP reward for successfully harvesting a resource.
 * @param specificType The specific type of the resource node.
 * @returns The amount of XP granted.
 */
export const getResourceXpReward = (specificType: string): number => {
  return RESOURCE_XP_REWARDS[specificType] ?? RESOURCE_XP_REWARDS['default'];
};

/**
 * Gets the standardized skill requirement for harvesting a resource.
 * @param specificType The specific type of the resource node.
 * @returns An object containing the required skill (string) and level (number).
 */
export const getResourceLevelRequirement = (specificType: string): { skill: string, level: number } => {
  return RESOURCE_LEVEL_REQUIREMENTS[specificType] ?? RESOURCE_LEVEL_REQUIREMENTS['default'];
}; 