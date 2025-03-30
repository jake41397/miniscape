import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CombatMode } from '../../game/systems/CombatSystem';

interface CombatPanelProps {
  visible: boolean;
  targetName: string | null;
  targetHealth: number;
  targetMaxHealth: number;
  playerHealth: number;
  playerMaxHealth: number;
  currentCombatMode: CombatMode;
  onChangeCombatMode: (mode: CombatMode) => void;
  onFlee: () => void;
}

const CombatPanel: React.FC<CombatPanelProps> = ({
  visible,
  targetName,
  targetHealth,
  targetMaxHealth,
  playerHealth,
  playerMaxHealth,
  currentCombatMode,
  onChangeCombatMode,
  onFlee
}) => {
  // Don't render if not visible
  if (!visible) return null;
  
  // Calculate health percentages
  const targetHealthPercent = Math.max(0, Math.min(100, (targetHealth / targetMaxHealth) * 100));
  const playerHealthPercent = Math.max(0, Math.min(100, (playerHealth / playerMaxHealth) * 100));
  
  // Get color for health bar based on percentage
  const getHealthColor = (percent: number): string => {
    if (percent < 20) return 'bg-red-600';
    if (percent < 40) return 'bg-orange-500';
    if (percent < 60) return 'bg-yellow-500';
    return 'bg-green-500';
  };
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-4 left-1/2 transform -translate-x-1/2 bg-stone-800 border border-amber-900 rounded-lg shadow-xl p-4 w-96"
      >
        {/* Target info */}
        <div className="mb-3">
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-white font-bold">
              {targetName || 'No Target'}
            </h3>
            <span className="text-white text-sm">
              {targetHealth}/{targetMaxHealth} HP
            </span>
          </div>
          <div className="w-full bg-gray-700 h-3 rounded-full overflow-hidden">
            <div 
              className={`h-full ${getHealthColor(targetHealthPercent)}`}
              style={{ width: `${targetHealthPercent}%` }}
            ></div>
          </div>
        </div>
        
        {/* Player health */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-1">
            <h3 className="text-white font-bold">
              Your Health
            </h3>
            <span className="text-white text-sm">
              {playerHealth}/{playerMaxHealth} HP
            </span>
          </div>
          <div className="w-full bg-gray-700 h-3 rounded-full overflow-hidden">
            <div 
              className={`h-full ${getHealthColor(playerHealthPercent)}`}
              style={{ width: `${playerHealthPercent}%` }}
            ></div>
          </div>
        </div>
        
        {/* Combat mode selection */}
        <div className="mb-4">
          <h3 className="text-white font-bold mb-2">Combat Style</h3>
          <div className="grid grid-cols-3 gap-2">
            <button
              className={`py-2 px-3 rounded text-white ${
                currentCombatMode === CombatMode.ATTACK
                  ? 'bg-amber-700 border border-amber-400'
                  : 'bg-stone-700 border border-gray-600 hover:border-amber-400'
              }`}
              onClick={() => onChangeCombatMode(CombatMode.ATTACK)}
            >
              Attack
              <div className="text-xs text-gray-400">Accuracy</div>
            </button>
            
            <button
              className={`py-2 px-3 rounded text-white ${
                currentCombatMode === CombatMode.STRENGTH
                  ? 'bg-amber-700 border border-amber-400'
                  : 'bg-stone-700 border border-gray-600 hover:border-amber-400'
              }`}
              onClick={() => onChangeCombatMode(CombatMode.STRENGTH)}
            >
              Strength
              <div className="text-xs text-gray-400">Max Hit</div>
            </button>
            
            <button
              className={`py-2 px-3 rounded text-white ${
                currentCombatMode === CombatMode.DEFENSE
                  ? 'bg-amber-700 border border-amber-400'
                  : 'bg-stone-700 border border-gray-600 hover:border-amber-400'
              }`}
              onClick={() => onChangeCombatMode(CombatMode.DEFENSE)}
            >
              Defense
              <div className="text-xs text-gray-400">Balanced</div>
            </button>
          </div>
        </div>
        
        {/* Flee button */}
        <button
          className="w-full py-2 bg-red-700 hover:bg-red-600 text-white font-bold rounded"
          onClick={onFlee}
        >
          Flee
        </button>
      </motion.div>
    </AnimatePresence>
  );
};

export default CombatPanel; 