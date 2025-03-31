import React, { useState, useEffect } from 'react';
import { SmithingMode, SMELTING_RECIPES, SMITHING_RECIPES } from '../../game/systems/SmithingSystem';
import { useGame } from '../../contexts/GameContext';
import { getSocket } from '../../game/network/socket';
import { ItemType } from '../../types/player';
import soundManager from '../../game/audio/soundManager';

interface SmithingPanelProps {
  visible: boolean;
  onClose: () => void;
  mode: SmithingMode;
  progress: number;
  isProcessing: boolean;
  onSmelt: (barType: string) => void;
  onSmith: (itemType: string) => void;
}

const SmithingPanel: React.FC<SmithingPanelProps> = ({
  visible,
  onClose,
  mode = SmithingMode.SMELTING,
  progress = 0,
  isProcessing = false,
  onSmelt,
  onSmith
}) => {
  console.log(`%c 🏺 SmithingPanel rendered: visible=${visible}, mode=${mode}`, "background: #cc7000; color: white; font-size: 14px;");
  
  // Get inventory and skills from window
  const inventory = window.playerInventory || [];
  const skills = window.playerSkills || {};
  
  // Track selected recipe
  const [selectedRecipe, setSelectedRecipe] = useState<string | null>(null);
  
  // Use ESC key to close panel
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && visible) {
        onClose();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose]);
  
  // When panel opens, check for recipe in window object
  useEffect(() => {
    if (visible && (window as any).selectedSmithingRecipe) {
      const recipeKey = (window as any).selectedSmithingRecipe;
      console.log(`%c 🏺 Found window.selectedSmithingRecipe = ${recipeKey}`, "background: #cc7000; color: white; font-size: 14px;");
      
      // Validate recipe exists in the appropriate collection based on mode
      const recipeCollection = mode === SmithingMode.SMELTING ? SMELTING_RECIPES : SMITHING_RECIPES;
      if (recipeCollection[recipeKey]) {
        console.log(`%c 🏺 Setting selected recipe to ${recipeKey}`, "color: #cc7000;");
        setSelectedRecipe(recipeKey);
        
        // Auto-trigger the action if auto-smelting is enabled
        if (mode === SmithingMode.SMELTING && !isProcessing) {
          console.log(`%c 🏺 Auto-triggering onSmelt with ${recipeKey}`, "background: #cc7000; color: white; font-size: 14px;");
          setTimeout(() => onSmelt(recipeKey), 200);
        } else if (mode === SmithingMode.SMITHING && !isProcessing) {
          console.log(`%c 🏺 Auto-triggering onSmith with ${recipeKey}`, "background: #cc7000; color: white; font-size: 14px;");
          setTimeout(() => onSmith(recipeKey), 200);
        }
      } else {
        console.error(`%c 🏺 Recipe ${recipeKey} not found in ${mode} recipes`, "color: red;");
      }
      
      // Clear the recipe from window to avoid reusing it accidentally
      delete (window as any).selectedSmithingRecipe;
    }
  }, [visible, mode, isProcessing, onSmelt, onSmith]);
  
  if (!visible) return null;

  // Get player's smithing level
  const smithingLevel = skills?.smithing?.level || 1;
  
  // Render recipes based on current mode
  const renderRecipes = () => {
    const recipes = mode === SmithingMode.SMELTING ? SMELTING_RECIPES : SMITHING_RECIPES;
    
    return Object.entries(recipes).map(([key, recipe]) => {
      // Check if player has the required level
      const hasLevel = smithingLevel >= recipe.requiredLevel;
      
      // Check if player has all the ingredients
      const hasIngredients = recipe.ingredients.every(ingredient => {
        const playerItem = inventory.find(item => item.type === ingredient.type);
        return playerItem && playerItem.count >= ingredient.count;
      });
      
      // Format recipe name to display
      const recipeName = key.replace(/_/g, ' ').toLowerCase()
        .split(' ')
        .map(word => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ');
      
      return (
        <div 
          key={key}
          className={`relative flex flex-col p-3 border-2 rounded-md cursor-pointer 
            ${selectedRecipe === key ? 'bg-amber-100 border-amber-500' : 'bg-slate-100 border-slate-300'} 
            ${!hasLevel || !hasIngredients ? 'opacity-50' : 'hover:bg-amber-50'}`}
          onClick={() => {
            if (hasLevel && hasIngredients && !isProcessing) {
              setSelectedRecipe(key);
              soundManager.play('ui_click');
            }
          }}
        >
          <div className="text-lg font-semibold">{recipeName}</div>
          
          <div className="flex flex-col mt-2">
            {recipe.ingredients.map((ingredient, index) => {
              const playerItem = inventory.find(item => item.type === ingredient.type);
              const hasItem = playerItem && playerItem.count >= ingredient.count;
              
              const ingredientName = ingredient.type.replace(/_/g, ' ')
                .toLowerCase()
                .split(' ')
                .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                .join(' ');
              
              return (
                <div 
                  key={index} 
                  className={`flex justify-between items-center ${hasItem ? 'text-green-600' : 'text-red-600'}`}
                >
                  <span>{ingredientName}</span>
                  <span>
                    {playerItem ? playerItem.count : 0}/{ingredient.count}
                  </span>
                </div>
              );
            })}
          </div>
          
          {!hasLevel && (
            <div className="text-red-500 mt-2">
              Requires Smithing Level {recipe.requiredLevel}
            </div>
          )}
        </div>
      );
    });
  };

  // Get the title based on current mode
  const getTitle = () => {
    return mode === SmithingMode.SMELTING ? 'Smelting' : 'Smithing';
  };
  
  // Get description based on current mode
  const getDescription = () => {
    return mode === SmithingMode.SMELTING 
      ? 'Select an ore to smelt:' 
      : 'Select an item to craft:';
  };
  
  // Get button text based on current mode and processing state
  const getButtonText = () => {
    if (isProcessing) {
      return mode === SmithingMode.SMELTING ? 'Smelting...' : 'Smithing...';
    }
    return mode === SmithingMode.SMELTING ? 'Smelt' : 'Smith';
  };
  
  // Handle button click based on current mode
  const handleButtonClick = () => {
    if (!selectedRecipe || isProcessing) return;
    
    console.log('SmithingPanel: handleButtonClick called with:', {
      mode,
      selectedRecipe,
      isProcessing
    });
    
    if (mode === SmithingMode.SMELTING) {
      console.log('SmithingPanel: Calling onSmelt with:', selectedRecipe);
      onSmelt(selectedRecipe);
    } else {
      console.log('SmithingPanel: Calling onSmith with:', selectedRecipe);
      onSmith(selectedRecipe);
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
      <div className="bg-slate-800 rounded-lg shadow-lg p-5 max-w-md w-full max-h-[90vh] overflow-auto">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-bold text-amber-400">{getTitle()}</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white"
          >
            ✕
          </button>
        </div>
        
        <div className="text-white mb-4">
          {getDescription()}
        </div>
        
        <div className="grid grid-cols-1 gap-4 mb-4">
          {renderRecipes()}
        </div>
        
        {isProcessing && (
          <div className="mt-4">
            <div className="w-full bg-gray-700 rounded-full h-4">
              <div 
                className="bg-amber-500 h-4 rounded-full" 
                style={{ width: `${progress}%` }}
              ></div>
            </div>
            <div className="text-center text-white mt-2">
              {mode === SmithingMode.SMELTING ? 'Smelting' : 'Smithing'}... {progress}%
            </div>
          </div>
        )}
        
        <div className="flex justify-end mt-4">
          <button
            disabled={!selectedRecipe || isProcessing}
            onClick={handleButtonClick}
            className={`px-4 py-2 rounded font-semibold 
              ${(!selectedRecipe || isProcessing) 
                ? 'bg-gray-500 text-gray-300 cursor-not-allowed' 
                : 'bg-amber-500 text-white hover:bg-amber-600'}`}
          >
            {getButtonText()}
          </button>
        </div>
      </div>
    </div>
  );
};

export default SmithingPanel; 