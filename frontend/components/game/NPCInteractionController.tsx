import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { NPC, Landmark } from '../../game/world/landmarks';
import { CombatNPC } from '../../game/world/LandmarkManager';
import DialogueBox from './DialogueBox';
import { getSocket } from '../../game/network/socket';

interface NPCInteractionControllerProps {
  worldManager: any; // Ideally this would be properly typed
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
}

const NPCInteractionController: React.FC<NPCInteractionControllerProps> = ({
  worldManager,
  playerRef
}) => {
  const [activeNPC, setActiveNPC] = useState<NPC | null>(null);
  const [interactionNotification, setInteractionNotification] = useState<string | null>(null);
  const [combatTarget, setCombatTarget] = useState<CombatNPC | null>(null);
  const [playerHealth, setPlayerHealth] = useState<number>(100);
  const [playerMaxHealth, setPlayerMaxHealth] = useState<number>(100);
  const [showHealthBars, setShowHealthBars] = useState<boolean>(false);
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const attackIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const damageAmount = useRef<number>(1); // Default damage
  
  // Add ref to track nearby NPCs for debugging
  const nearbyNPCsRef = useRef<NPC[]>([]);
  
  // Periodically check for nearby NPCs even without right-click
  useEffect(() => {
    const checkNearbyNPCs = () => {
      if (!worldManager || !playerRef.current) return;
      
      const landmarkManager = worldManager.getLandmarkManager();
      if (!landmarkManager) {
        console.log("No landmark manager available");
        return;
      }
      
      // Get all NPCs from the landmark manager
      const npcs = landmarkManager.getNPCs ? landmarkManager.getNPCs() : [];
      
      // Log if there are no NPCs
      if (!npcs || npcs.length === 0) {
        console.log("No NPCs found in the game world");
        return;
      }
      
      // Check which NPCs are nearby
      const playerPosition = playerRef.current.position;
      const nearby = npcs.filter((npc: NPC) => {
        const distance = npc.position.distanceTo(playerPosition);
        return distance < npc.interactionRadius * 1.5; // Use slightly larger radius for detection
      });
      
      // Only log if the nearby NPCs changed
      if (nearby.length !== nearbyNPCsRef.current.length || 
          JSON.stringify(nearby.map((n: NPC) => n.id)) !== JSON.stringify(nearbyNPCsRef.current.map((n: NPC) => n.id))) {
        console.log("Nearby NPCs:", nearby.map((npc: NPC) => ({ name: npc.name, distance: npc.position.distanceTo(playerPosition).toFixed(2) })));
        nearbyNPCsRef.current = nearby;
      }
    };
    
    // Check every second
    const intervalId = setInterval(checkNearbyNPCs, 1000);
    
    return () => clearInterval(intervalId);
  }, [worldManager, playerRef]);
  
  // Register dialogue handlers with the LandmarkManager
  useEffect(() => {
    if (!worldManager) return;
    
    const landmarkManager = worldManager.getLandmarkManager();
    if (!landmarkManager) {
      console.log("Cannot register dialogue handlers: No landmark manager available");
      return;
    }
    
    console.log("Registering dialogue handlers with LandmarkManager");
    
    // Set up handlers for dialogue open and close events
    landmarkManager.setDialogHandlers(
      // onDialogOpen handler - called when dialogue is started or continued
      (npc: NPC) => {
        console.log(`Dialog update: ${npc.name}, dialogue ID: ${npc.currentDialogueId}`);
        setActiveNPC({...npc}); // Use a new object to ensure React detects the change
      },
      // onDialogClose handler
      () => {
        console.log("Dialog closed");
        setActiveNPC(null);
      }
    );
    
    return () => {
      // Clean up by removing handlers when component unmounts
      if (landmarkManager) {
        landmarkManager.setDialogHandlers(null, null);
      }
    };
  }, [worldManager]);
  
  // Register combat handlers with socket
  useEffect(() => {
    const socket = getSocket();
    if (!socket) return;
    
    console.log("Setting up health and combat event listeners...");
    
    socket.then(socket => {
      if (socket) {
        // Listen for player health updates
        socket.on('updatePlayerHealth', (data: { current: number, max: number }) => {
          console.log('[COMBAT CLIENT] Health update received:', data);
          setPlayerHealth(data.current);
          setPlayerMaxHealth(data.max);
          
          // Show health bars when we receive health updates
          setShowHealthBars(true);
          
          // Add damage flash effect for the player health bar
          const healthBar = document.querySelector('.health-bar-fill');
          if (healthBar) {
            healthBar.classList.add('damage-flash');
            setTimeout(() => {
              healthBar.classList.remove('damage-flash');
            }, 500);
          }
          
          // If health is full and we're not in combat, hide health bars after a delay
          if (data.current === data.max && !combatTarget) {
            setTimeout(() => {
              setShowHealthBars(false);
            }, 3000);
          }
        });
        
        // Also listen for the updateHealth event directly
        socket.on('updateHealth', (data: { amount: number }) => {
          console.log('[COMBAT CLIENT] updateHealth event received:', data);
          // Add chat message when player takes damage
          if (data.amount < 0) {
            sendChatMessage(`You take ${Math.abs(data.amount)} damage!`, 'combat');
          } else if (data.amount > 0) {
            sendChatMessage(`You heal for ${data.amount} health.`, 'system');
          }
        });
        
        // Listen for NPC state updates to auto-detect combat
        socket.on('npcStateUpdate', (data) => {
          console.log('[COMBAT CLIENT] NPC state update received:', data);
          
          // If NPC is engaged in combat with this player, set it as combat target
          if (data.combatState === 'engaged' && data.attacker === socket.id) {
            console.log('[COMBAT CLIENT] Auto-detecting combat with NPC:', data.id);
            
            // Find the NPC in the world manager
            const landmarkManager = worldManager?.getLandmarkManager();
            if (landmarkManager) {
              const npc = landmarkManager.getNPCs().find((npc: any) => npc.id === data.id);
              if (npc && !combatTarget) {
                console.log('[COMBAT CLIENT] Auto-setting combat target:', npc);
                setCombatTarget(npc);
                setShowHealthBars(true);
                showNotification(`${npc.name} is attacking you!`);
                
                // Start auto-attacking the rat in response
                if (socket && npc.type === 'rat') {
                  console.log('[COMBAT CLIENT] Auto-attacking rat in response');
                  socket.emit('attackNPC', { npcId: npc.id });
                }
              } else if (combatTarget && combatTarget.id === data.id) {
                // Update current combat target's health if it's the same NPC
                console.log('[COMBAT CLIENT] Updating combat target health:', data.health);
                setCombatTarget(prevTarget => {
                  if (!prevTarget) return prevTarget;
                  return {
                    ...prevTarget,
                    health: data.health !== undefined ? data.health : prevTarget.health,
                    maxHealth: data.maxHealth !== undefined ? data.maxHealth : prevTarget.maxHealth,
                    combatState: data.combatState || prevTarget.combatState
                  };
                });
              }
            }
          }
          
          // Even if we're not the attacker, update health if this is our target
          if (combatTarget && data.id === combatTarget.id && (data.health !== undefined || data.combatState !== undefined)) {
            console.log('[COMBAT CLIENT] Updating existing combat target:', data);
            
            // Check if health decreased to show damage dealt
            if (data.health !== undefined && data.health < combatTarget.health) {
              const damageDone = combatTarget.health - data.health;
              sendChatMessage(`You hit ${combatTarget.name} for ${damageDone} damage!`, 'combat');
            }
            
            setCombatTarget(prevTarget => {
              if (!prevTarget) return prevTarget;
              return {
                ...prevTarget,
                health: data.health !== undefined ? data.health : prevTarget.health,
                maxHealth: data.maxHealth !== undefined ? data.maxHealth : prevTarget.maxHealth,
                combatState: data.combatState || prevTarget.combatState
              };
            });
            
            // Keep health bars visible during combat
            setShowHealthBars(true);
            
            // If the NPC died, hide combat UI after a delay
            if (data.combatState === 'dead') {
              sendChatMessage(`You have defeated ${combatTarget.name}!`, 'success');
              sendChatMessage(`You gained combat experience!`, 'experience');
              setTimeout(() => {
                if (combatTarget && combatTarget.id === data.id) {
                  setCombatTarget(null);
                  setShowHealthBars(false);
                }
              }, 3000);
            }
          }
        });
        
        // Listen for combat messages
        socket.on('chatMessage', (msg: any) => {
          // Check if it's a combat message and we should display health bars
          if (msg.type === 'combat') {
            console.log('[COMBAT CLIENT] Combat message received:', msg);
            setShowHealthBars(true);
          }
        });

        // Add experience-related event listeners
        socket.on('experienceGained', (data: { skill: string, experience: number, totalExperience: number, level: number }) => {
          console.log('[EXPERIENCE] Gained XP:', data);
          sendChatMessage(`You gained ${data.experience} ${data.skill} experience! (Level ${data.level})`, 'success');
        });

        socket.on('levelUp', (data: { skill: string, level: number }) => {
          console.log('[EXPERIENCE] Level up:', data);
          sendChatMessage(`Congratulations! Your ${data.skill} level is now ${data.level}!`, 'experience');
        });
      }
    });
    
    return () => {
      // Clean up listeners
      socket.then(socket => {
        if (socket) {
          socket.off('updatePlayerHealth');
          socket.off('updateHealth');
          socket.off('npcStateUpdate');
          socket.off('chatMessage');
          socket.off('experienceGained');
          socket.off('levelUp');
        }
      });
    };
  }, [worldManager, combatTarget]);
  
  // Handle combat logic - periodically deal damage to the target
  useEffect(() => {
    if (combatTarget && combatTarget.combatState === 'engaged') {
      // Start auto-attack
      if (attackIntervalRef.current) {
        clearInterval(attackIntervalRef.current);
      }
      
      // Attack every 2 seconds with higher damage
      attackIntervalRef.current = setInterval(() => {
        const socket = getSocket();
        socket.then(socket => {
          if (socket) {
            // Increase damage for better visibility of health changes (3-5 damage)
            const damage = Math.floor(Math.random() * 3) + 3;
            
            console.log(`Sending damageNPC event with ${damage} damage to ${combatTarget.id}`);
            
            // Send damage to server
            socket.emit('damageNPC', {
              npcId: combatTarget.id,
              damage: damage
            });
          }
        });
      }, 2000);
      
      return () => {
        if (attackIntervalRef.current) {
          clearInterval(attackIntervalRef.current);
          attackIntervalRef.current = null;
        }
      };
    }
  }, [combatTarget]);
  
  // Add an effect to ensure health bars remain visible during combat
  useEffect(() => {
    // When combat target changes, ensure health bars are shown
    if (combatTarget) {
      setShowHealthBars(true);
      console.log('[COMBAT] Combat target set, showing health bars:', combatTarget.name);
    }
  }, [combatTarget]);
  
  useEffect(() => {
    // Set up right-click interaction using the 'contextmenu' event
    const handleContextMenu = (event: MouseEvent) => {
      // Check if the event target is part of the game canvas/world, not UI elements
      const targetElement = event.target as HTMLElement;
      // Ensure this selector accurately targets your canvas or its container
      if (!targetElement.closest('canvas')) { // Adjust selector if needed
        console.log("ContextMenu event target is not canvas, ignoring.");
        return; // Ignore if the click is on UI, not the game world
      }

      console.log("ContextMenu event detected on game world, checking interactions.");
      
      const landmarkManager = worldManager?.getLandmarkManager();
      const player = playerRef.current;
      
      if (!landmarkManager || !player) {
        console.log("ContextMenu: LandmarkManager or PlayerRef missing.");
        // Don't prevent default if we can't check - allow normal browser context menu
        return;
      }
      
      console.log("ContextMenu: Checking interactions at", player.position);
      
      // Check if player is near any interactable NPC or landmark
      const interactionFound = landmarkManager.checkInteractions(player.position, (target: NPC | Landmark) => {
        console.log("ContextMenu: Interaction target found:", target);
        
        // Check if it's an attackable NPC (combat NPC)
        if ('health' in target) {
          const combatNPC = target as CombatNPC;
          if (combatNPC.isAttackable) {
            console.log(`ContextMenu: Found attackable NPC: ${target.name}`);
            
            // Show attack dialog - use proper type assertion
            setActiveNPC(combatNPC as unknown as NPC);
            
            // Prevent default context menu
            event.preventDefault();
            event.stopPropagation();
            return;
          }
        }
        
        if ('dialogues' in target) { // It's an NPC
          console.log(`ContextMenu: Starting dialogue with NPC: ${target.name}`);
          setActiveNPC(target);
          landmarkManager.startDialogue(target.id);
          
          // Prevent the default browser context menu for NPC interaction
          event.preventDefault();
          // Stop propagation might still be useful if other listeners exist
          event.stopPropagation();
          
        } else if (target.interactable) { // It's an interactable landmark
          console.log(`ContextMenu: Interacting with landmark: ${target.name}`);
          
          // Specifically handle the furnace and anvil
          if (target.metadata?.isFurnace || target.metadata?.isAnvil || target.id === 'barbarian_furnace' || target.id === 'barbarian_anvil') {
            console.log('ContextMenu: Furnace/Anvil interaction detected. This will open a dialog interface and then smithing panel if selected.');
            // The onInteract will handle showing the dialog interface
            
            // Prevent the browser's default context menu
            event.preventDefault();
            event.stopPropagation();
            
            // Mark the event as handled to prevent WorldContextMenu from processing it
            (event as any).handled = true;
            return; // Callback handled
          }
          
          // Handle other landmarks
          showNotification(`${target.name}: ${target.onInteract ? 'Interacting...' : 'Nothing to interact with.'}`);
          // Also prevent default for other landmarks
          event.preventDefault();
          event.stopPropagation();
        }
      });
      
      // If checkInteractions found something and called the callback,
      // preventDefault/stopPropagation was likely already called inside.
      // If *no* interaction was found, we don't call preventDefault here,
      // allowing the normal browser context menu to appear if desired for the background.
      if (interactionFound) {
        console.log("ContextMenu: Interaction found and handled within callback.");
      } else {
        console.log("ContextMenu: No interactable target found at player location.");
        // Explicitly DO NOT call preventDefault/stopPropagation here
      }
    };
    
    // Add the contextmenu listener
    window.addEventListener('contextmenu', handleContextMenu);
    console.log("NPCInteractionController: Added contextmenu listener.");
    
    // Cleanup
    return () => {
      window.removeEventListener('contextmenu', handleContextMenu);
      console.log("NPCInteractionController: Removed contextmenu listener.");
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
      }
      if (attackIntervalRef.current) {
        clearInterval(attackIntervalRef.current);
      }
    };
  }, [worldManager, playerRef]);
  
  const showNotification = (message: string) => {
    setInteractionNotification(message);
    
    if (notificationTimeoutRef.current) {
      clearTimeout(notificationTimeoutRef.current);
    }
    
    notificationTimeoutRef.current = setTimeout(() => {
      setInteractionNotification(null);
    }, 3000);
  };
  
  const handleDialogueResponse = (responseIndex: number) => {
    // Check if this is an attack dialogue
    if (activeNPC && 'health' in activeNPC) {
      const combatNPC = activeNPC as CombatNPC;
      if (combatNPC.isAttackable && responseIndex === 0) {
        // Attack option was selected
        handleAttackNPC(combatNPC);
        
        // Close dialogue
        handleDialogueClose();
        return;
      }
    }
    
    // Standard dialogue handling
    const landmarkManager = worldManager?.getLandmarkManager();
    if (landmarkManager) {
      landmarkManager.continueDialogue(responseIndex);
    }
  };
  
  const handleDialogueClose = () => {
    const landmarkManager = worldManager?.getLandmarkManager();
    if (landmarkManager) {
      landmarkManager.endDialogue();
      setActiveNPC(null);
    }
  };
  
  // Update sendChatMessage function for better type safety
  const sendChatMessage = (content: string, type: 'combat' | 'system' | 'experience' | 'success' | 'error' | 'warning' = 'combat') => {
    const chatEvent = new CustomEvent('chat-message', {
      detail: {
        content,
        type,
        timestamp: Date.now()
      }
    });
    document.dispatchEvent(chatEvent);
  };
  
  // Handle attacking an NPC
  const handleAttackNPC = (npc: CombatNPC) => {
    console.log(`Attacking NPC: ${npc.name}`);
    
    // Set as combat target for auto-attacks
    setCombatTarget(npc);
    
    // Show health bars
    setShowHealthBars(true);
    
    // Add chat message when starting combat
    sendChatMessage(`You begin attacking ${npc.name}!`, 'combat');
    
    // Get socket and emit attackNPC event
    const socket = getSocket();
    socket.then(socket => {
      if (socket) {
        socket.emit('attackNPC', { npcId: npc.id });
        
        // Show notification
        showNotification(`Attacking ${npc.name}`);
      }
    });
  };
  
  return (
    <>
      {activeNPC && (
        <DialogueBox 
          npc={activeNPC}
          onResponse={handleDialogueResponse}
          onClose={handleDialogueClose}
        />
      )}
      
      {interactionNotification && (
        <div className="notification">
          {interactionNotification}
          
          <style jsx>{`
            .notification {
              position: fixed;
              top: 20px;
              left: 50%;
              transform: translateX(-50%);
              background-color: rgba(0, 0, 0, 0.7);
              color: white;
              padding: 10px 15px;
              border-radius: 5px;
              z-index: 1000;
              font-size: 16px;
              border: 1px solid #FFD700;
            }
          `}</style>
        </div>
      )}
      
      {showHealthBars && (
        <div className="health-bar-container">
          <div className="health-bar-label">Player Health: {playerHealth}/{playerMaxHealth}</div>
          <div className="health-bar-background">
            <div 
              className="health-bar-fill" 
              style={{ width: `${(playerHealth / playerMaxHealth) * 100}%` }}
            />
          </div>
          
          {combatTarget && (
            <>
              <div className="health-bar-label enemy">{combatTarget.name} (Level {combatTarget.level}): {combatTarget.health}/{combatTarget.maxHealth}</div>
              <div className="health-bar-background enemy">
                <div 
                  className="health-bar-fill enemy" 
                  style={{ width: `${(combatTarget.health / combatTarget.maxHealth) * 100}%` }}
                />
              </div>
            </>
          )}
          
          <style jsx>{`
            .health-bar-container {
              position: fixed;
              top: 60px;
              left: 50%;
              transform: translateX(-50%);
              background-color: rgba(0, 0, 0, 0.7);
              padding: 10px;
              border-radius: 5px;
              z-index: 1000;
              border: 1px solid #FFD700;
              width: 300px;
            }
            
            .health-bar-label {
              color: white;
              font-size: 14px;
              margin-bottom: 5px;
            }
            
            .health-bar-label.enemy {
              color: #FF6666;
              margin-top: 10px;
            }
            
            .health-bar-background {
              background-color: #333;
              height: 20px;
              border-radius: 3px;
              overflow: hidden;
            }
            
            .health-bar-background.enemy {
              background-color: #331111;
            }
            
            .health-bar-fill {
              background-color: #2ECC71;
              height: 100%;
              transition: width 0.3s ease;
            }
            
            .health-bar-fill.enemy {
              background-color: #E74C3C;
            }
            
            .health-bar-fill.damage-flash {
              background-color: #FF0000;
            }
            
            @keyframes damagePulse {
              0% { background-color: #2ECC71; }
              50% { background-color: #FF0000; }
              100% { background-color: #2ECC71; }
            }
            
            .damage-flash {
              animation: damagePulse 0.5s;
            }
          `}</style>
        </div>
      )}
    </>
  );
};

export default NPCInteractionController; 