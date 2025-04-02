import { Player } from '../types'; // Assuming Player type includes skills
import { savePlayerSkills } from '../../models/mongodb/gameModel'; // Import the function to save skills

/**
 * Enum defining the different skill types available in the game.
 * Used to reference skills programmatically.
 */
export enum SkillType {
  ATTACK = 'attack',
  STRENGTH = 'strength',
  DEFENSE = 'defense',
  MINING = 'mining',
  WOODCUTTING = 'woodcutting',
  FISHING = 'fishing',
  SMITHING = 'smithing',
  // Add other skills as needed
}

/**
 * Defines the base experience points awarded for various actions within each skill.
 * Keys should correspond to specific actions or items (e.g., tree types, ore types, fish types).
 */
export const BASE_XP_REWARDS: Partial<Record<SkillType, { [actionKey: string]: number }>> = {
  [SkillType.WOODCUTTING]: {
    'normal': 25,
    'oak': 37.5,
    'willow': 67.5,
    'maple': 100,
    'yew': 175,
  },
  [SkillType.MINING]: {
    'copper': 17.5,
    'tin': 17.5,
    'coal': 50,
    'iron': 35,
    'gold': 65,
    'mithril': 80,
  },
  [SkillType.FISHING]: {
    'shrimp': 10,
    'sardine': 20,
    'trout': 50,
    'salmon': 70,
    'lobster': 90,
    'swordfish': 100,
  },
  [SkillType.SMITHING]: {
    // Smelting
    'bronze_bar': 6,
    'iron_bar': 12,
    'steel_bar': 17,
    'gold_bar': 22,
    'mithril_bar': 30,
    // Smithing Items (example)
    'bronze_item': 12, // Placeholder - might vary per item
    'iron_item': 25,   // Placeholder
    'steel_item': 37,  // Placeholder
  },
  // COMBAT XP might be handled differently (e.g., per damage dealt)
};

/**
 * Calculates the total experience points required to reach a specific level.
 * @param level The target level.
 * @returns The total experience points needed for that level. Returns 0 for level 1 or less.
 */
export const experienceForLevel = (level: number): number => {
  if (level <= 1) return 0;
  // Using the formula: Total XP = floor(level * (level - 1) * 50)
  // This makes level 2 = 100XP, level 3 = 300XP (200 diff), level 4 = 600XP (300 diff)
  return Math.floor(level * (level - 1) * 50);
};

/**
 * Calculates the player's current level based on their total experience points in a skill.
 * @param experience The total experience points the player has in the skill.
 * @returns The calculated level (minimum 1, maximum 99).
 */
export const levelFromExperience = (experience: number): number => {
  if (experience <= 0) return 1;
  let level = 1;
  // Keep incrementing level until the XP required for the *next* level
  // exceeds the player's current XP.
  while (experienceForLevel(level + 1) <= experience) {
    level++;
    if (level >= 99) return 99; // Cap level at 99
  }
  return level;
};

/**
 * Handles experience calculation and skill updates for players.
 */
export class ExperienceHandler {

  /**
   * Adds experience to a specific skill for a player and handles level ups.
   * Modifies the player object directly.
   *
   * @param player The player object (must include the `skills` property).
   * @param skillType The enum representing the skill to update (e.g., SkillType.WOODCUTTING).
   * @param experienceToAdd The amount of experience points to add.
   * @returns An object indicating if a level up occurred, the new level, and the new total experience.
   *          Returns null if the experienceToAdd is zero or negative, or if player/skills are invalid.
   */
  public addExperience(
    player: Player,
    skillType: SkillType,
    experienceToAdd: number
  ): { leveledUp: boolean; newLevel: number; newExperience: number } | null {

    if (experienceToAdd <= 0 || !player) {
      return null;
    }

    // Ensure player.skills object exists
    if (!player.skills) {
      player.skills = {};
    }

    // Ensure the specific skill object exists, initialize if not
    if (!player.skills[skillType]) {
      player.skills[skillType] = { level: 1, experience: 0 };
    }

    const currentSkill = player.skills[skillType];
    const oldLevel = currentSkill.level;
    const newExperience = currentSkill.experience + experienceToAdd;
    const newLevel = levelFromExperience(newExperience);

    // Update player object
    currentSkill.experience = newExperience;
    currentSkill.level = newLevel;

    const leveledUp = newLevel > oldLevel;

    // Note: Saving skills is handled by the calling handler (e.g., ResourceHandler)
    // after calling this method.

    return {
      leveledUp,
      newLevel,
      newExperience,
    };
  }

  /**
   * Retrieves the base XP reward for a specific action within a skill.
   *
   * @param skillType The skill the action belongs to.
   * @param actionKey A key representing the specific action (e.g., 'normal' for woodcutting normal trees).
   * @returns The base XP reward amount, or 0 if not found.
   */
  public getXpReward(skillType: SkillType, actionKey: string): number {
     const skillRewards = BASE_XP_REWARDS[skillType];
     if (skillRewards && typeof skillRewards[actionKey] === 'number') {
       return skillRewards[actionKey];
     }
     console.warn(`[ExperienceHandler] XP Reward not found for skill '${skillType}', action '${actionKey}'`);
     return 0;
  }

  // Potential future methods:
  // - getExperienceForNextLevel(currentExperience: number): number
  // - getSkillLevel(player: Player, skillType: SkillType): number
} 