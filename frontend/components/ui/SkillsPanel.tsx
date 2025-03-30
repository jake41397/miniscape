import React, { useState } from 'react';
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

  // If skills are not yet in gameState, use placeholder data
  const skills = gameState.player?.skills || {
    [SkillType.ATTACK]: { level: 1, experience: 0 },
    [SkillType.STRENGTH]: { level: 1, experience: 0 },
    [SkillType.DEFENSE]: { level: 1, experience: 0 },
    [SkillType.MINING]: { level: 1, experience: 0 },
    [SkillType.WOODCUTTING]: { level: 1, experience: 0 },
    [SkillType.FISHING]: { level: 1, experience: 0 },
  };

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

        <div className="grid grid-cols-3 gap-2 mb-4">
          {Object.entries(skillInfo).map(([skillKey, info]) => {
            const skillType = skillKey as SkillType;
            const skillData = skills[skillType] || { level: 1, experience: 0 };
            
            // Calculate progress percentage to next level
            const currentXp = skillData.experience;
            const currentLevel = skillData.level;
            const nextLevelXp = xpForLevel(currentLevel + 1);
            const prevLevelXp = xpForLevel(currentLevel);
            const xpForNextLevel = nextLevelXp - prevLevelXp;
            const xpProgress = currentXp - prevLevelXp;
            const progressPercent = Math.min(100, Math.max(0, (xpProgress / xpForNextLevel) * 100));
            
            return (
              <div
                key={skillKey}
                className={`p-2 border rounded cursor-pointer transition-colors ${
                  selectedSkill === skillType
                    ? 'border-amber-400 bg-amber-900 bg-opacity-50'
                    : 'border-gray-700 hover:border-amber-400'
                }`}
                onClick={() => handleSkillClick(skillType)}
                style={{ color: 'white' }}
              >
                <div className="flex items-center mb-1">
                  <span className="text-xl mr-2">{info.icon}</span>
                  <span className="text-white" style={{ color: 'white' }}>{info.name}</span>
                </div>
                <div className="text-right text-white font-bold" style={{ color: 'white' }}>
                  {skillData.level}
                </div>
                <div className="w-full bg-gray-700 h-1 mt-1 rounded overflow-hidden">
                  <div
                    className="bg-yellow-400 h-full"
                    style={{ width: `${progressPercent}%` }}
                  ></div>
                </div>
              </div>
            );
          })}
        </div>

        <AnimatePresence>
          {selectedSkill && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="border border-amber-900 rounded p-3 bg-stone-900"
              style={{ color: 'white' }}
            >
              <h3 className="text-white font-bold mb-2 flex items-center" style={{ color: 'white' }}>
                <span className="mr-2">{skillInfo[selectedSkill].icon}</span>
                {skillInfo[selectedSkill].name}
              </h3>
              <p className="text-gray-100 text-sm mb-3" style={{ color: 'white' }}>
                {skillInfo[selectedSkill].description}
              </p>
              
              <div className="flex justify-between text-xs text-white mb-1">
                <span style={{ color: 'white' }}>Current Level</span>
                <span className="text-white font-bold" style={{ color: 'white' }}>
                  {skills[selectedSkill].level}
                </span>
              </div>

              <div className="flex justify-between text-xs text-white mb-1">
                <span style={{ color: 'white' }}>Experience</span>
                <span className="text-white font-bold" style={{ color: 'white' }}>
                  {skills[selectedSkill].experience.toLocaleString()}
                </span>
              </div>

              <div className="flex justify-between text-xs text-white mb-2">
                <span style={{ color: 'white' }}>Next Level</span>
                <span className="text-white font-bold" style={{ color: 'white' }}>
                  {xpForLevel(skills[selectedSkill].level + 1).toLocaleString()} XP
                </span>
              </div>

              <div className="w-full bg-gray-700 h-2 rounded overflow-hidden">
                {(() => {
                  const currentXp = skills[selectedSkill].experience;
                  const currentLevel = skills[selectedSkill].level;
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
                <span style={{ color: 'white' }}>{xpForLevel(skills[selectedSkill].level).toLocaleString()}</span>
                <span style={{ color: 'white' }}>{xpForLevel(skills[selectedSkill].level + 1).toLocaleString()}</span>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};

export default SkillsPanel; 