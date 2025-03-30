import { SkillType } from '../../components/ui/SkillsPanel';

// Skill data interface
export interface SkillData {
  level: number;
  experience: number;
}

// Player skills interface
export interface PlayerSkills {
  [key: string]: SkillData;
}

// Define requirement levels for different actions
export const SKILL_REQUIREMENTS = {
  // Resource gathering
  TREE_TYPES: {
    'normal': { [SkillType.WOODCUTTING]: 1 },
    'oak': { [SkillType.WOODCUTTING]: 15 },
    'willow': { [SkillType.WOODCUTTING]: 30 },
    'maple': { [SkillType.WOODCUTTING]: 45 },
    'yew': { [SkillType.WOODCUTTING]: 60 },
  },
  ROCK_TYPES: {
    'copper': { [SkillType.MINING]: 1 },
    'tin': { [SkillType.MINING]: 1 },
    'coal': { [SkillType.MINING]: 20 },
    'iron': { [SkillType.MINING]: 15 },
    'gold': { [SkillType.MINING]: 40 },
    'mithril': { [SkillType.MINING]: 55 },
  },
  FISH_TYPES: {
    'shrimp': { [SkillType.FISHING]: 1 },
    'sardine': { [SkillType.FISHING]: 5 },
    'trout': { [SkillType.FISHING]: 20 },
    'salmon': { [SkillType.FISHING]: 30 },
    'lobster': { [SkillType.FISHING]: 40 },
    'swordfish': { [SkillType.FISHING]: 50 },
  },
};

// Define experience rewards for different actions
export const XP_REWARDS = {
  WOODCUTTING: {
    'normal': 25,
    'oak': 37.5,
    'willow': 67.5,
    'maple': 100,
    'yew': 175,
  },
  MINING: {
    'copper': 17.5,
    'tin': 17.5,
    'coal': 50,
    'iron': 35,
    'gold': 65,
    'mithril': 80,
  },
  FISHING: {
    'shrimp': 10,
    'sardine': 20,
    'trout': 50,
    'salmon': 70,
    'lobster': 90,
    'swordfish': 100,
  },
  COMBAT: {
    // Base XP per hit point of damage
    BASE_XP_PER_DAMAGE: 4,
  }
};

// Calculate experience needed for a specific level
export const experienceForLevel = (level: number): number => {
  if (level <= 1) return 0;
  return Math.floor(level * (level - 1) * 50);
};

// Calculate level based on experience
export const levelFromExperience = (experience: number): number => {
  // Start from level 1
  let level = 1;
  
  // Keep incrementing level until we find the right one
  while (experienceForLevel(level + 1) <= experience) {
    level++;
  }
  
  return level;
};

// Check if a player meets skill requirements
export const meetsRequirements = (
  playerSkills: PlayerSkills,
  requirements: { [skillType: string]: number }
): boolean => {
  for (const [skillType, requiredLevel] of Object.entries(requirements)) {
    const playerLevel = playerSkills[skillType]?.level || 1;
    if (playerLevel < requiredLevel) {
      return false;
    }
  }
  return true;
};

// Add experience to a skill and return the new skill data
export const addExperience = (
  skillData: SkillData,
  experienceToAdd: number
): { skillData: SkillData; leveledUp: boolean } => {
  const oldLevel = skillData.level;
  const newExperience = skillData.experience + experienceToAdd;
  const newLevel = levelFromExperience(newExperience);
  
  return {
    skillData: {
      level: newLevel,
      experience: newExperience
    },
    leveledUp: newLevel > oldLevel
  };
};

// Initialize default skills for a new player
export const initializePlayerSkills = (): PlayerSkills => {
  return {
    [SkillType.ATTACK]: { level: 1, experience: 0 },
    [SkillType.STRENGTH]: { level: 1, experience: 0 },
    [SkillType.DEFENSE]: { level: 1, experience: 0 },
    [SkillType.MINING]: { level: 1, experience: 0 },
    [SkillType.WOODCUTTING]: { level: 1, experience: 0 },
    [SkillType.FISHING]: { level: 1, experience: 0 },
  };
};

// Get requirement message for the player
export const getRequirementMessage = (
  playerSkills: PlayerSkills,
  requirements: { [skillType: string]: number }
): string => {
  const missingRequirements = Object.entries(requirements)
    .filter(([skillType, requiredLevel]) => {
      const playerLevel = playerSkills[skillType]?.level || 1;
      return playerLevel < requiredLevel;
    })
    .map(([skillType, requiredLevel]) => {
      const skillName = SkillType[skillType.toUpperCase() as keyof typeof SkillType];
      const playerLevel = playerSkills[skillType]?.level || 1;
      return `${skillName} (${playerLevel}/${requiredLevel})`;
    });

  if (missingRequirements.length === 0) {
    return '';
  }

  return `You need higher ${missingRequirements.join(', ')} to do this.`;
};

// Calculate success chance based on skill level and action difficulty
export const calculateSuccessChance = (
  skillLevel: number,
  actionDifficulty: number
): number => {
  // Base success rate (50%)
  const baseRate = 0.5;
  
  // Skill bonus (up to 45% based on level vs difficulty)
  const skillBonus = Math.min(0.45, Math.max(0, (skillLevel - actionDifficulty) * 0.03));
  
  // Random factor (up to 5%)
  const randomFactor = Math.random() * 0.05;
  
  return Math.min(0.95, Math.max(0.1, baseRate + skillBonus + randomFactor));
};

// Simulate skill-based action with success/failure chance
export const attemptSkillAction = (
  skillLevel: number,
  actionDifficulty: number
): boolean => {
  const successChance = calculateSuccessChance(skillLevel, actionDifficulty);
  return Math.random() < successChance;
}; 