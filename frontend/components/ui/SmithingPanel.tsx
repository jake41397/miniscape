import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useGame } from '../../contexts/GameContext';
import { SmithingMode, SMELTING_RECIPES, SMITHING_RECIPES } from '../../game/systems/SmithingSystem';
import { ItemType } from '../../types/player';

interface SmithingPanelProps {
  visible: boolean;
  onClose: () => void;
  mode: SmithingMode;
  onChangeMode: (mode: SmithingMode) => void;
  onSmelt: (barType: string) => void;
  onSmith: (itemType: string) => void;
  progress: number;
  isSmithing: boolean;
}

const SmithingPanel: React.FC<SmithingPanelProps> = ({
  visible,
  onClose,
  mode,
  onChangeMode,
  onSmelt,
  onSmith,
  progress,
  isSmithing
}) => {
  const { gameState } = useGame();
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);
  
  if (!visible) return null;
  
  // Get player's smithing level
  const smithingLevel = gameState.player?.skills?.smithing?.level || 1;
  
  // Get player's inventory
  const inventory = gameState.player?.inventory || [];
  
  // Filter recipes based on mode
  const recipes = mode === SmithingMode.SMELTING ? SMELTING_RECIPES : SMITHING_RECIPES;
  
  // Check if player has ingredients for a recipe
  const hasIngredients = (recipe: any): boolean => {
    for (const ingredient of recipe.ingredients) {
      const playerItem = inventory.find(item => item.type === ingredient.type);
      if (!playerItem || playerItem.count < ingredient.count) {
        return false;
      }
    }
    return true;
  };
  
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
          <h2 className="text-white text-xl font-bold">
            {mode === SmithingMode.SMELTING ? 'Smelting' : 'Smithing'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>
        
        {/* Mode selection */}
        <div className="flex gap-2 mb-4">
          <button
            className={`flex-1 py-2 px-3 rounded text-white ${
              mode === SmithingMode.SMELTING
                ? 'bg-amber-700 border border-amber-400'
                : 'bg-stone-700 border border-gray-600 hover:border-amber-400'
            }`}
            onClick={() => onChangeMode(SmithingMode.SMELTING)}
            disabled={isSmithing}
          >
            Smelting
          </button>
          
          <button
            className={`flex-1 py-2 px-3 rounded text-white ${
              mode === SmithingMode.SMITHING
                ? 'bg-amber-700 border border-amber-400'
                : 'bg-stone-700 border border-gray-600 hover:border-amber-400'
            }`}
            onClick={() => onChangeMode(SmithingMode.SMITHING)}
            disabled={isSmithing}
          >
            Smithing
          </button>
        </div>
        
        {/* Progress bar (when smithing) */}
        {isSmithing && (
          <div className="mb-4">
            <div className="flex justify-between text-white text-sm mb-1">
              <span>Progress</span>
              <span>{Math.round(progress)}%</span>
            </div>
            <div className="w-full bg-gray-700 h-2 rounded-full overflow-hidden">
              <div 
                className="h-full bg-amber-500"
                style={{ width: `${progress}%` }}
              ></div>
            </div>
          </div>
        )}
        
        {/* Recipe list */}
        <div className="space-y-2 max-h-64 overflow-y-auto pr-2">
          {Object.entries(recipes).map(([key, recipe]: [string, any]) => {
            const canCraft = smithingLevel >= recipe.requiredLevel && hasIngredients(recipe);
            const isSelected = selectedRecipe === key;
            
            return (
              <div
                key={key}
                className={`p-3 rounded cursor-pointer transition-colors ${
                  isSelected
                    ? 'bg-amber-700 border border-amber-400'
                    : canCraft
                    ? 'bg-stone-700 border border-gray-600 hover:border-amber-400'
                    : 'bg-stone-800 border border-gray-700 opacity-50 cursor-not-allowed'
                }`}
                onClick={() => {
                  if (canCraft && !isSmithing) {
                    setSelectedRecipe(key);
                  }
                }}
              >
                <div className="flex justify-between items-center mb-1">
                  <h3 className="text-white font-bold">
                    {key.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}
                  </h3>
                  <span className="text-xs text-amber-300">
                    Level {recipe.requiredLevel}
                  </span>
                </div>
                
                <div className="text-gray-300 text-sm mb-2">
                  XP: {recipe.experienceReward}
                </div>
                
                <div className="text-sm text-gray-400">
                  <span className="text-white">Requires:</span>
                  <ul className="mt-1 space-y-1">
                    {recipe.ingredients.map((ingredient: any, index: number) => {
                      const playerItem = inventory.find(item => item.type === ingredient.type);
                      const hasEnough = playerItem && playerItem.count >= ingredient.count;
                      
                      return (
                        <li 
                          key={index}
                          className={`flex justify-between ${hasEnough ? 'text-gray-300' : 'text-red-400'}`}
                        >
                          <span>
                            {ingredient.type.split('_').map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()).join(' ')}
                          </span>
                          <span>
                            {playerItem?.count || 0}/{ingredient.count}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
        
        {/* Action button */}
        <button
          className={`w-full py-2 mt-4 rounded font-bold ${
            selectedRecipe && !isSmithing
              ? 'bg-amber-600 hover:bg-amber-500 text-white'
              : 'bg-gray-700 text-gray-400 cursor-not-allowed'
          }`}
          onClick={() => {
            if (selectedRecipe && !isSmithing) {
              if (mode === SmithingMode.SMELTING) {
                onSmelt(selectedRecipe);
              } else {
                onSmith(selectedRecipe);
              }
            }
          }}
          disabled={!selectedRecipe || isSmithing}
        >
          {mode === SmithingMode.SMELTING ? 'Smelt' : 'Smith'}
        </button>
      </div>
    </motion.div>
  );
};

export default SmithingPanel; 