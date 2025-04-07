import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../../contexts/GameContext';

// Define skill types
export enum SkillType {
  ATTACK = 'attack',
  STRENGTH = 'strength',
  DEFENSE = 'defense',
  MINING = 'mining',
  WOODCUTTING = 'woodcutting',
  FISHING = 'fishing',
  SMITHING = 'smithing',
}

// Define skill information
const skillInfo = {
  [SkillType.ATTACK]: {
    name: 'Attack',
    description: 'Increases accuracy in combat',
    icon: '⚔️',
  },
  [SkillType.STRENGTH]: {
    name: 'Strength',
    description: 'Increases maximum hit in combat',
    icon: '💪',
  },
  [SkillType.DEFENSE]: {
    name: 'Defense',
    description: 'Reduces damage taken in combat',
    icon: '🛡️',
  },
  [SkillType.MINING]: {
    name: 'Mining',
    description: 'Ability to mine various ores',
    icon: '⛏️',
  },
  [SkillType.WOODCUTTING]: {
    name: 'Woodcutting',
    description: 'Ability to cut various trees',
    icon: '🪓',
  },
  [SkillType.FISHING]: {
    name: 'Fishing',
    description: 'Ability to catch various fish',
    icon: '🎣',
  },
  [SkillType.SMITHING]: {
    name: 'Smithing',
    description: 'Ability to smelt ore into bars and forge items',
    icon: '🔨',
  },
};

// Calculate XP required for a given level
const xpForLevel = (level: number) => {
  return Math.floor(level * (level - 1) * 50);
};

interface SkillsPanelProps {
  visible: boolean;
  onClose: () => void;
}

const SkillsPanel: React.FC<SkillsPanelProps> = ({ visible, onClose }) => {
  const { gameState } = useGame();
  const [selectedSkill, setSelectedSkill] = useState<SkillType | null>(null);

  // Get skills from gameState, return null if player or skills are not loaded yet
  const playerSkills = gameState.player?.skills;

  // ---> REMOVE DEBUG LOGGING <--- 
  /*
  useEffect(() => {
    if (playerSkills) {
      console.log('[SkillsPanel] Detected change in playerSkills:', JSON.stringify(playerSkills));
    }
  }, [playerSkills]);
  */
  // ---> END DEBUG LOGGING <--- 

  const handleSkillClick = (skill: SkillType) => {
    setSelectedSkill(skill === selectedSkill ? null : skill);
  };

  if (!visible) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 20 }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-stone-800 border border-amber-900 rounded-lg shadow-xl p-4 w-full max-w-md">
        <div className="flex justify-between items-center mb-4 border-b border-amber-900 pb-2">
          <h2 className="text-white text-xl font-bold" style={{ color: 'white' }}>Skills</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>

        {/* Only render skill list if playerSkills are loaded */}
        {!playerSkills ? (
          <div className="text-center text-gray-400 p-4">Loading skills...</div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 mb-4">
              {Object.entries(skillInfo).map(([skillKey, info]) => {
                const skillType = skillKey as SkillType;
                const skillData = playerSkills[skillType] || { level: 1, experience: 0 }; // Fallback for potentially missing skills in data
                
                // Calculate progress percentage to next level
                const currentXp = skillData.experience;
                const currentLevel = skillData.level;
                const nextLevelXp = xpForLevel(currentLevel + 1);
                const prevLevelXp = xpForLevel(currentLevel);
                const xpForNextLevel = nextLevelXp - prevLevelXp;
                const xpProgress = currentXp - prevLevelXp;
                const progressPercent = Math.min(100, Math.max(0, (xpProgress / xpForNextLevel) * 100));
                
                // Calculate the maximum level across all skills for bar scaling
                const maxLevel = Object.values(playerSkills).reduce(
                  (max, skill) => Math.max(max, skill.level),
                  1
                );
                // Calculate relative width for level bar (based on max level)
                const levelBarWidth = Math.max(5, Math.min(100, (skillData.level / maxLevel) * 100));
                
                return (
                  <div
                    key={skillKey}
                    className={`border rounded cursor-pointer transition-colors ${
                      selectedSkill === skillType
                        ? 'border-amber-400 bg-amber-900 bg-opacity-50'
                        : 'border-gray-700 hover:border-amber-400'
                    }`}
                    onClick={() => handleSkillClick(skillType)}
                    style={{ color: 'white' }}
                  >
                    <div className="flex items-center p-2 relative">
                      {/* Background level bar */}
                      <div 
                        className="absolute left-0 top-0 bottom-0 bg-amber-900 bg-opacity-30"
                        style={{ width: `${levelBarWidth}%` }}
                      ></div>
                      
                      {/* Content (above the background bar) */}
                      <div className="flex items-center w-full z-10 relative">
                        <div className="flex items-center w-1/3">
                          <span className="text-xl mr-2">{info.icon}</span>
                          <span className="text-white font-medium" style={{ color: 'white' }}>{info.name}</span>
                        </div>
                        
                        <div className="w-1/3 text-center">
                          <div className="inline-flex items-center justify-center bg-stone-900 rounded-full w-8 h-8 border border-amber-600">
                            <span className="text-white font-bold" style={{ color: 'white' }}>
                              {skillData.level}
                            </span>
                          </div>
                        </div>
                        
                        <div className="w-1/3">
                          <div className="w-full bg-stone-900 h-2 rounded-full overflow-hidden">
                            <div
                              className="bg-yellow-400 h-full"
                              style={{ width: `${progressPercent}%` }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <AnimatePresence>
              {selectedSkill && playerSkills[selectedSkill] && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="border border-amber-900 rounded p-3 bg-stone-900"
                  style={{ color: 'white' }}
                >
                  <h3 className="text-white font-bold mb-2 flex items-center justify-center" style={{ color: 'white' }}>
                    <span className="mr-2">{skillInfo[selectedSkill].icon}</span>
                    {skillInfo[selectedSkill].name}
                  </h3>
                  <p className="text-gray-100 text-sm mb-3 text-center" style={{ color: 'white' }}>
                    {skillInfo[selectedSkill].description}
                  </p>
                  
                  <div className="flex justify-between text-xs text-white mb-1">
                    <span style={{ color: 'white' }}>Current Level</span>
                    <span className="text-white font-bold" style={{ color: 'white' }}>
                      {playerSkills[selectedSkill].level}
                    </span>
                  </div>

                  <div className="flex justify-between text-xs text-white mb-1">
                    <span style={{ color: 'white' }}>Experience</span>
                    <span className="text-white font-bold" style={{ color: 'white' }}>
                      {playerSkills[selectedSkill].experience.toLocaleString()}
                    </span>
                  </div>

                  <div className="flex justify-between text-xs text-white mb-2">
                    <span style={{ color: 'white' }}>Next Level</span>
                    <span className="text-white font-bold" style={{ color: 'white' }}>
                      {xpForLevel(playerSkills[selectedSkill].level + 1).toLocaleString()} XP
                    </span>
                  </div>

                  <div className="w-full bg-gray-700 h-2 rounded overflow-hidden">
                    {(() => {
                      const currentXp = playerSkills[selectedSkill].experience;
                      const currentLevel = playerSkills[selectedSkill].level;
                      const nextLevelXp = xpForLevel(currentLevel + 1);
                      const prevLevelXp = xpForLevel(currentLevel);
                      const xpForNextLevel = nextLevelXp - prevLevelXp;
                      const xpProgress = currentXp - prevLevelXp;
                      const progressPercent = Math.min(100, Math.max(0, (xpProgress / xpForNextLevel) * 100));
                      
                      return (
                        <div
                          className="bg-yellow-400 h-full"
                          style={{ width: `${progressPercent}%` }}
                        ></div>
                      );
                    })()}
                  </div>
                  
                  <div className="flex justify-between text-xs text-white mt-1">
                    <span style={{ color: 'white' }}>{xpForLevel(playerSkills[selectedSkill].level).toLocaleString()}</span>
                    <span style={{ color: 'white' }}>{xpForLevel(playerSkills[selectedSkill].level + 1).toLocaleString()}</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </>
        )}
      </div>
    </motion.div>
  );
};

export default SkillsPanel; 