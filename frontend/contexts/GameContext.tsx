import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { getSocket } from '../game/network/socket';
import { Player, Item } from '../types/player';
import { initializePlayerSkills, PlayerSkills } from '../game/state/SkillSystem';
import { SkillType } from '../components/ui/SkillsPanel';
import { gameAPI } from '../lib/api';
import { useAuth } from './AuthContext';

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
  saveGameState: () => Promise<void>;
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
  const { user } = useAuth();

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

    // Save the updated skills to the server
    if (user) {
      const playerSkills = gameState.player?.skills || {};
      gameAPI.saveSkills(playerSkills).catch(error => {
        console.error('Error saving skills:', error);
      });
    }
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

    // Save the updated inventory to the server
    if (user && inventory) {
      gameAPI.saveInventory(inventory).catch(error => {
        console.error('Error saving inventory:', error);
      });
    }
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

    // Save the updated position to the server
    if (user) {
      gameAPI.savePosition(x, y, z).catch(error => {
        console.error('Error saving position:', error);
      });
    }
  };

  // Handle zone changes
  const handleZoneChange = (zoneName: string) => {
    setGameState(prevState => ({
      ...prevState,
      currentZone: zoneName
    }));
  };

  // Save all game state to the server
  const saveGameState = async (): Promise<void> => {
    if (!user || !gameState.player) return;

    try {
      // Save position
      await gameAPI.savePosition(
        gameState.player.x,
        gameState.player.y,
        gameState.player.z
      );

      // Save inventory
      if (gameState.player.inventory) {
        await gameAPI.saveInventory(gameState.player.inventory);
      }

      // Save skills
      if (gameState.player.skills) {
        await gameAPI.saveSkills(gameState.player.skills);
      }

      console.log('Game state saved successfully');
    } catch (error) {
      console.error('Error saving game state:', error);
    }
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

  // Load player data from the server
  useEffect(() => {
    if (!user) return;

    const loadPlayerData = async () => {
      try {
        const data = await gameAPI.getPlayerData();
        
        if (data) {
          setGameState(prevState => ({
            ...prevState,
            player: {
              ...prevState.player!,
              id: user.id,
              name: data.profile?.username || 'Player',
              x: data.x || 0,
              y: data.y || 1,
              z: data.z || 0,
              inventory: data.inventory || [],
              skills: data.stats || initializePlayerSkills(),
            }
          }));
        }
      } catch (error) {
        console.error('Error loading player data:', error);
      }
    };

    loadPlayerData();
  }, [user]);

  // Setup socket listeners and custom events
  useEffect(() => {
    if (!user) return;

    const setupSocketListeners = async () => {
      const socket = await getSocket();
      if (!socket) return;

      socket.on('connect', () => {
        setGameState(prev => ({ ...prev, isConnected: true }));
        console.log('Socket connected with JWT authentication');
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
        console.log(`Level up! ${data.skill} is now level ${data.level}`);
      });

      // Handle other player events
      socket.on('playerJoined', (player: any) => {
        setGameState(prev => ({
          ...prev,
          otherPlayers: [...prev.otherPlayers.filter(p => p.id !== player.id), player as Player]
        }));
      });

      socket.on('playerLeft', (playerId: string) => {
        setGameState(prev => ({
          ...prev,
          otherPlayers: prev.otherPlayers.filter(p => p.id !== playerId)
        }));
      });

      socket.on('playerMoved', (data: { id: string, x: number, y: number, z: number, rotation?: number }) => {
        setGameState(prev => ({
          ...prev,
          otherPlayers: prev.otherPlayers.map(p => 
            p.id === data.id 
              ? { ...p, x: data.x, y: data.y, z: data.z, rotation: data.rotation } 
              : p
          )
        }));
      });

      // Periodically save game state
      const saveInterval = setInterval(() => {
        saveGameState().catch(console.error);
      }, 60000); // Save every minute

      return () => {
        clearInterval(saveInterval);
        
        // Cleanup socket listeners on unmount
        socket.off('connect');
        socket.off('disconnect');
        socket.off('playerCount');
        socket.off('inventoryUpdate');
        socket.off('skillUpdate');
        socket.off('experienceGained');
        socket.off('levelUp');
        socket.off('playerJoined');
        socket.off('playerLeft');
        socket.off('playerMoved');
      };
    };

    const cleanup = setupSocketListeners();
    
    return () => {
      if (cleanup instanceof Promise) {
        cleanup.then(cleanupFn => cleanupFn && cleanupFn());
      }
    };
  }, [user]);

  return (
    <GameContext.Provider
      value={{
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
        saveGameState
      }}
    >
      {children}
    </GameContext.Provider>
  );
};

// Custom hook to use the game context
export const useGame = () => {
  const context = useContext(GameContext);
  
  if (!context) {
    throw new Error('useGame must be used within a GameProvider');
  }
  
  return context;
}; 