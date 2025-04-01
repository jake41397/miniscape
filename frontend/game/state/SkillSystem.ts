import { SkillType } from '../../components/ui/SkillsPanel';

// Skill data interface (Still needed for frontend state)
export interface SkillData {
  level: number;
  experience: number;
}

// Player skills interface (Still needed for frontend state)
export interface PlayerSkills {
  [key: string]: SkillData;
}

// Initialize default skills for a new player 
// (Might still be useful for initial UI state before server data arrives)
export const initializePlayerSkills = (): PlayerSkills => {
  return {
    [SkillType.ATTACK]: { level: 1, experience: 0 },
    [SkillType.STRENGTH]: { level: 1, experience: 0 },
    [SkillType.DEFENSE]: { level: 1, experience: 0 },
    [SkillType.MINING]: { level: 1, experience: 0 },
    [SkillType.WOODCUTTING]: { level: 1, experience: 0 },
    [SkillType.FISHING]: { level: 1, experience: 0 },
    [SkillType.SMITHING]: { level: 1, experience: 0 },
  };
};

// REMOVED: SKILL_REQUIREMENTS - This logic should live on the backend.
// REMOVED: XP_REWARDS - This logic must live on the backend.
// REMOVED: experienceForLevel - Calculation now handled by backend.
// REMOVED: levelFromExperience - Calculation now handled by backend.
// REMOVED: addExperience - Action and calculation handled by backend.

// NOTE: Functions like meetsRequirements, getRequirementMessage, calculateSuccessChance, attemptSkillAction
// were present but potentially unused or should be re-evaluated.
// If the frontend needs to check requirements *before* sending an action to the server
// (e.g., to disable a button), meetsRequirements might be kept, but the source of truth
// for requirement data should come from the server, not a local constant.
// Success chance calculations should definitely happen server-side.
// For now, I am removing them to enforce backend authority.

/* // Removed meetsRequirements
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
*/

/* // Removed getRequirementMessage
export const getRequirementMessage = (
  playerSkills: PlayerSkills,
  requirements: { [skillType: string]: number }
): string => {
  // ... implementation ...
};
*/

/* // Removed calculateSuccessChance
export const calculateSuccessChance = (
  skillLevel: number,
  actionDifficulty: number
): number => {
  // ... implementation ...
};
*/

/* // Removed attemptSkillAction
export const attemptSkillAction = (
  skillLevel: number,
  actionDifficulty: number
): boolean => {
  // ... implementation ...
};
*/ 