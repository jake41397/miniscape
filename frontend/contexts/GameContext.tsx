import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSocket } from '../game/network/socket';
import { Player, Item } from '../types/player';
import { initializePlayerSkills, PlayerSkills } from '../game/state/SkillSystem';
import { SkillType } from '../components/ui/SkillsPanel';

// Define game state interface
interface GameState {
  player: Player | null;
  otherPlayers: Player[];
  isConnected: boolean;
  playerCount: number;
  currentZone: string;
}

// Define context value interface
interface GameContextValue {
  gameState: GameState;
  updatePlayerSkill: (skillType: string, level: number, experience: number) => void;
  addExperienceToSkill: (skillType: string, experienceToAdd: number) => void;
  handleInventoryUpdate: (inventory: Item[]) => void;
  handlePlayerPositionUpdate: (x: number, y: number, z: number, rotation?: number) => void;
  handleZoneChange: (zoneName: string) => void;
  isInLumbridge: () => boolean;
  isInWilderness: () => boolean;
  isInBarbarianVillage: () => boolean;
  isInGrandExchange: () => boolean;
}

// Initial game state
const initialGameState: GameState = {
  player: {
    id: '',
    name: 'Player',
    x: 0,
    y: 1,
    z: 0,
    health: 100,
    maxHealth: 100,
    inventory: [],
    skills: initializePlayerSkills(),
  },
  otherPlayers: [],
  isConnected: false,
  playerCount: 0,
  currentZone: 'Lumbridge',
};

// Create context
const GameContext = createContext<GameContextValue | undefined>(undefined);

// Context provider component
export const GameProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [gameState, setGameState] = useState<GameState>(initialGameState);

  // Update player skill
  const updatePlayerSkill = (skillType: string, level: number, experience: number) => {
    setGameState(prevState => {
      if (!prevState.player) return prevState;

      const updatedSkills = {
        ...(prevState.player.skills || {}),
        [skillType]: { level, experience }
      };

      return {
        ...prevState,
        player: {
          ...prevState.player,
          skills: updatedSkills
        }
      };
    });
  };

  // Add experience to a skill
  const addExperienceToSkill = (skillType: string, experienceToAdd: number) => {
    setGameState(prevState => {
      if (!prevState.player || !prevState.player.skills) return prevState;

      const currentSkill = prevState.player.skills[skillType] || { level: 1, experience: 0 };
      const newExperience = currentSkill.experience + experienceToAdd;
      
      // Simple level calculation: level = sqrt(experience / 100)
      const newLevel = Math.floor(Math.sqrt(newExperience / 100)) + 1;
      
      const updatedSkills = {
        ...prevState.player.skills,
        [skillType]: { 
          level: newLevel > currentSkill.level ? newLevel : currentSkill.level, 
          experience: newExperience 
        }
      };

      return {
        ...prevState,
        player: {
          ...prevState.player,
          skills: updatedSkills
        }
      };
    });
  };

  // Handle inventory updates
  const handleInventoryUpdate = (inventory: Item[]) => {
    setGameState(prevState => {
      if (!prevState.player) return prevState;

      return {
        ...prevState,
        player: {
          ...prevState.player,
          inventory
        }
      };
    });
  };

  // Handle player position updates
  const handlePlayerPositionUpdate = (x: number, y: number, z: number, rotation?: number) => {
    setGameState(prevState => {
      if (!prevState.player) return prevState;

      const updatedPlayer = {
        ...prevState.player,
        x, y, z,
        rotation: rotation !== undefined ? rotation : prevState.player.rotation
      };

      return {
        ...prevState,
        player: updatedPlayer
      };
    });
  };

  // Handle zone changes
  const handleZoneChange = (zoneName: string) => {
    setGameState(prevState => ({
      ...prevState,
      currentZone: zoneName
    }));
  };

  // Zone check helpers
  const isInLumbridge = () => {
    return gameState.currentZone === 'Lumbridge';
  };

  const isInWilderness = () => {
    return gameState.currentZone === 'Wilderness';
  };

  const isInBarbarianVillage = () => {
    return gameState.currentZone === 'Barbarian Village';
  };

  const isInGrandExchange = () => {
    return gameState.currentZone === 'Grand Exchange';
  };

  // Setup socket listeners and custom events
  useEffect(() => {
    const setupSocketListeners = async () => {
      const socket = await getSocket();
      if (!socket) return;

      socket.on('connect', () => {
        setGameState(prev => ({ ...prev, isConnected: true }));
      });

      socket.on('disconnect', () => {
        setGameState(prev => ({ ...prev, isConnected: false }));
      });

      socket.on('playerCount', (data: { count: number }) => {
        setGameState(prev => ({ ...prev, playerCount: data.count }));
      });

      socket.on('inventoryUpdate', (inventory: Item[]) => {
        handleInventoryUpdate(inventory);
      });

      socket.on('skillUpdate', (skillData: { skillType: string, level: number, experience: number }) => {
        updatePlayerSkill(skillData.skillType, skillData.level, skillData.experience);
      });

      // Handle experience gained events from server
      socket.on('experienceGained', (data: { 
        skill: string, 
        experience: number, 
        totalExperience: number, 
        level: number 
      }) => {
        console.log(`Experience gained: ${data.experience} in ${data.skill}`);
        updatePlayerSkill(data.skill, data.level, data.totalExperience);
      });

      // Handle level up events from server
      socket.on('levelUp', (data: { skill: string, level: number }) => {
        console.log(`Level up: ${data.skill} to level ${data.level}`);
        
        // Update the skill level
        setGameState(prevState => {
          if (!prevState.player || !prevState.player.skills) return prevState;

          const currentSkill = prevState.player.skills[data.skill] || { level: 1, experience: 0 };
          
          const updatedSkills = {
            ...prevState.player.skills,
            [data.skill]: { 
              level: data.level,
              experience: currentSkill.experience  // Keep the current experience value
            }
          };

          return {
            ...prevState,
            player: {
              ...prevState.player,
              skills: updatedSkills
            }
          };
        });
      });

      socket.on('playerData', (playerData: Player) => {
        setGameState(prev => ({
          ...prev,
          player: {
            ...playerData,
            skills: playerData.skills || initializePlayerSkills()
          }
        }));
      });
      
      // Listen for custom inventory-updated event (from smithing, etc.)
      const handleCustomInventoryUpdate = (e: CustomEvent) => {
        if (e.detail && e.detail.inventory) {
          handleInventoryUpdate(e.detail.inventory);
        }
      };
      
      document.addEventListener('inventory-updated', handleCustomInventoryUpdate as EventListener);

      // Clean up listeners
      return () => {
        if (socket) {
          socket.off('connect');
          socket.off('disconnect');
          socket.off('playerCount');
          socket.off('inventoryUpdate');
          socket.off('skillUpdate');
          socket.off('experienceGained');
          socket.off('levelUp');
          socket.off('playerData');
        }
        document.removeEventListener('inventory-updated', handleCustomInventoryUpdate as EventListener);
      };
    };

    setupSocketListeners();
  }, []);

  // Expose player inventory and skills to the window object for global access
  useEffect(() => {
    if (gameState.player) {
      window.playerInventory = gameState.player.inventory;
      window.playerSkills = gameState.player.skills;
    }
  }, [gameState.player?.inventory, gameState.player?.skills]);

  // Context value
  const contextValue: GameContextValue = {
    gameState,
    updatePlayerSkill,
    addExperienceToSkill,
    handleInventoryUpdate,
    handlePlayerPositionUpdate,
    handleZoneChange,
    isInLumbridge,
    isInWilderness,
    isInBarbarianVillage,
    isInGrandExchange,
  };

  return (
    <GameContext.Provider value={contextValue}>
      {children}
    </GameContext.Provider>
  );
};

// Context hook
export const useGame = () => {
  const context = useContext(GameContext);
  if (context === undefined) {
    throw new Error('useGame must be used within a GameProvider');
  }
  return context;
}; 