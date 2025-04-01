import * as THREE from 'three';
import { NPC, Landmark, createTutorialGuideNPC, createSignpost, createLumbridgeCastleMesh, createComingSoonSign, createBarbarianHut, createNPC } from './landmarks';
import { ZONES } from './zones';
import { SmithingSystem, SmithingMode, SMELTING_RECIPES, SMITHING_RECIPES } from '../systems/SmithingSystem';
import { SkillType } from '../../components/ui/SkillsPanel';
import { ItemType } from '../../types/player';
import { getSocket } from '../network/socket';
import soundManager from '../audio/soundManager';

// Add TypeScript declaration for the global window.openSmithingPanel function
declare global {
  interface Window {
    openSmithingPanel?: (mode: string) => void;
    playerInventory?: { type: ItemType, count: number }[];
    playerSkills?: { [key: string]: { level: number, experience: number } };
  }
}

// Update the NPC interface to include userData property
declare module './landmarks' {
  interface NPC {
    userData?: {
      selectedRecipe?: string;
      startTime?: number;
      smeltingInProgress?: boolean;
      cleanupSocketListeners?: () => void;
      [key: string]: any;
    };
  }
}

// Add combat-related interfaces
export interface CombatNPC extends NPC {
  level: number;
  health: number;
  maxHealth: number;
  isAttackable: boolean;
  combatState: 'idle' | 'engaged' | 'dead';
}

// Add NPC types
export enum NPCType {
  TUTORIAL_GUIDE = 'tutorial_guide',
  RAT = 'rat'
}

interface LandmarkManagerProps {
  scene: THREE.Scene;
}

class LandmarkManager {
  private scene: THREE.Scene;
  private npcs: (NPC | CombatNPC)[] = [];
  private landmarks: Landmark[] = [];
  private activeNPC: NPC | null = null;
  private onDialogOpen: ((npc: NPC) => void) | null = null;
  private onDialogClose: (() => void) | null = null;
  private smithingSystem: SmithingSystem | null = null;

  constructor(props: LandmarkManagerProps) {
    this.scene = props.scene;
    this.initialize();
  }

  private initialize() {
    // Add the tutorial guide NPC in Lumbridge
    this.addTutorialGuide();
    
    // Add signposts
    this.addSignposts();
    
    // Add Lumbridge castle
    this.addLumbridgeCastle();
    
    // Add Grand Exchange coming soon sign
    this.addGrandExchangeSign();
    
    // Add Barbarian Village huts and NPCs
    this.addBarbarianVillage();
    
    // Create combat NPCs
    this.createCombatNPCs();
  }

  private addTutorialGuide() {
    const tutorialGuide = createTutorialGuideNPC();
    // Position the guide in a more visible location in Lumbridge
    tutorialGuide.position = new THREE.Vector3(0, 0, 30); // Near the Lumbridge castle
    tutorialGuide.mesh.position.copy(tutorialGuide.position);
    
    // Add a distinctive indicator above the NPC's head
    const indicatorGeometry = new THREE.SphereGeometry(0.5, 8, 8);
    const indicatorMaterial = new THREE.MeshBasicMaterial({ color: 0xffff00 }); // Bright yellow
    const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
    indicator.position.y = 4.0; // Position above the NPC's head
    
    // Add subtle up-down animation to make it more noticeable
    indicator.userData.baseY = indicator.position.y;
    indicator.userData.animSpeed = 0.003;
    
    // Add update function to animate the indicator
    const updateIndicator = () => {
      indicator.position.y = indicator.userData.baseY + Math.sin(Date.now() * indicator.userData.animSpeed) * 0.5;
      requestAnimationFrame(updateIndicator);
    };
    updateIndicator();
    
    tutorialGuide.mesh.add(indicator);
    
    console.log("Tutorial guide added at position:", tutorialGuide.position);
    this.npcs.push(tutorialGuide);
    this.scene.add(tutorialGuide.mesh);
  }

  private addSignposts() {
    // Create signposts at strategic locations
    const signpostData = [
      {
        position: new THREE.Vector3(0, 0, 60),
        text: "Lumbridge\nSafe Zone"
      },
      {
        position: new THREE.Vector3(60, 0, 0),
        text: "To Barbarian\nVillage →"
      },
      {
        position: new THREE.Vector3(0, 0, -60),
        text: "To Grand\nExchange ↓"
      },
      {
        position: new THREE.Vector3(250, 0, 250),
        text: "WARNING!\nWilderness\nPvP Enabled"
      }
    ];
    
    signpostData.forEach(data => {
      const signpost = createSignpost(data.position, data.text);
      signpost.mesh.position.copy(signpost.position);
      
      this.landmarks.push(signpost);
      this.scene.add(signpost.mesh);
    });
  }

  private addLumbridgeCastle() {
    const castle = createLumbridgeCastleMesh();
    castle.position.set(0, 0, 30);
    castle.scale.set(1.5, 1.5, 1.5);
    
    // Add castle to the scene
    this.scene.add(castle);
    
    // Create castle landmark object
    const castleLandmark: Landmark = {
      id: 'lumbridge_castle',
      name: 'Lumbridge Castle',
      position: new THREE.Vector3(0, 0, 30),
      mesh: castle,
      interactable: false
    };
    
    this.landmarks.push(castleLandmark);
  }

  private addGrandExchangeSign() {
    const sign = createComingSoonSign();
    // Position at the Grand Exchange area
    sign.position.set(150, 0, -150);
    
    // Add to scene
    this.scene.add(sign);
    
    // Create landmark object
    const exchangeSign: Landmark = {
      id: 'grand_exchange_sign',
      name: 'Grand Exchange',
      position: new THREE.Vector3(150, 0, -150),
      mesh: sign,
      interactable: true,
      interactionRadius: 5,
      onInteract: () => {
        console.log('The Grand Exchange will be available soon!');
        // Could trigger a UI notification
      }
    };
    
    this.landmarks.push(exchangeSign);
  }

  private addBarbarianVillage() {
    // Center of Barbarian Village at (-90, -60) to align with the village sign
    const centerX = -90;
    const centerZ = -60;
    
    // Create multiple huts in Barbarian Village with increased spacing
    
    // Positions for barbarian huts around the center with more spread
    const hutPositions = [
      new THREE.Vector3(centerX - 12, 0, centerZ - 12),  // Southwest hut
      new THREE.Vector3(centerX + 12, 0, centerZ - 12),  // Southeast hut
      new THREE.Vector3(centerX - 12, 0, centerZ + 12),  // Northwest hut
      new THREE.Vector3(centerX + 12, 0, centerZ + 12)   // Northeast hut
    ];
    
    // Create huts
    hutPositions.forEach((position, index) => {
      // Create hut mesh
      const hut = createBarbarianHut();
      hut.position.copy(position);
      hut.rotation.y = Math.random() * Math.PI * 2; // Random rotation
      this.scene.add(hut);
      
      // Add as a landmark
      this.landmarks.push({
        id: `barbarian_hut_${index}`,
        name: `Barbarian Hut ${index + 1}`,
        position: position.clone(),
        mesh: hut,
        interactable: true,
        interactionRadius: 3,
        onInteract: () => {
          console.log(`Interacted with Barbarian Hut ${index + 1}`);
        }
      });
    });
    
    // Add smithing facilities - furnace and anvil
    
    // Create furnace - positioned in the southern part of the village
    const furnacePosition = new THREE.Vector3(centerX, 0, centerZ - 16);
    const furnaceMesh = SmithingSystem.createFurnaceMesh();
    furnaceMesh.position.copy(furnacePosition);
    this.scene.add(furnaceMesh);
    
    // Add furnace as an interactable landmark
    this.landmarks.push({
      id: 'barbarian_furnace',
      name: 'Barbarian Furnace',
      position: furnacePosition.clone(),
      mesh: furnaceMesh,
      interactable: true,
      interactionRadius: 3,
      metadata: { isFurnace: true },
      onInteract: () => {
        console.log('Interacted with Barbarian Furnace');
        // Create a "virtual NPC" for the furnace
        const furnaceNPC = {
          id: 'furnace_dialog',
          name: 'Furnace',
          position: furnacePosition.clone(),
          interactionRadius: 3,
          isInteracting: true,
          mesh: furnaceMesh,
          currentDialogueId: 'default',
          dialogues: [
            {
              id: 'default',
              text: 'The furnace is hot and ready to smelt ores into metal bars. You can create bronze bars from copper and tin, iron bars from iron ore, steel bars from iron and coal, gold bars from gold ore, and mithril bars from mithril ore and coal.',
              responses: [
                {
                  text: 'Smelt metals',
                  nextDialogueId: 'smelting_options',
                },
                {
                  text: 'Go back',
                  nextDialogueId: 'default'
                }
              ]
            },
            {
              id: 'smelting_options',
              text: 'What would you like to smelt?',
              responses: Object.entries(SMELTING_RECIPES).map(([key, recipe]) => {
                // Format recipe name for display
                const recipeName = key.replace(/_/g, ' ').toLowerCase()
                  .split(' ')
                  .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ');
                
                // Create formatted ingredients description
                const ingredientsDesc = recipe.ingredients.map(ingredient => {
                  const ingredientName = ingredient.type.replace(/_/g, ' ').toLowerCase()
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                  return `${ingredientName} (${ingredient.count})`;
                }).join(', ');
                
                return {
                  text: `${recipeName} - Requires: ${ingredientsDesc} - Level: ${recipe.requiredLevel}`,
                  nextDialogueId: 'smelting_confirmation',
                  action: () => {
                    // Save the selected recipe to NPC temporary data
                    if ((furnaceNPC as any).userData) {
                      (furnaceNPC as any).userData.selectedRecipe = key;
                    } else {
                      (furnaceNPC as any).userData = { selectedRecipe: key };
                    }
                  }
                };
              }).concat([
                {
                  text: 'Go back',
                  nextDialogueId: 'default',
                  action: () => {} // Empty action to satisfy TypeScript
                }
              ])
            },
            {
              id: 'smelting_confirmation',
              text: 'Are you sure you want to smelt this item?',
              responses: [
                {
                  text: 'Yes, begin smelting',
                  nextDialogueId: 'smelting_progress',
                  action: () => {
                    // Get the selected recipe key from NPC userData
                    const selectedRecipe = (furnaceNPC as any).userData?.selectedRecipe;
                    console.log(`%c 🔥 BEGIN SMELTING ACTION: Selected recipe=${selectedRecipe}`, "background: #ff6600; color: white; font-size: 16px;");
                    if (!selectedRecipe) {
                      console.error('No recipe selected');
                      return;
                    }
                    
                    // Check if player has required level
                    const inventory = window.playerInventory || [];
                    const skills = window.playerSkills || {};
                    const smithingLevel = skills[SkillType.SMITHING]?.level || 1;
                    const recipe = SMELTING_RECIPES[selectedRecipe];
                    
                    console.log(`%c 🔥 Player smithing level: ${smithingLevel}, Required: ${recipe.requiredLevel}`, "color: #ff6600;");
                    
                    // Check if player meets level requirement
                    if (smithingLevel < recipe.requiredLevel) {
                      const chatEvent = new CustomEvent('chat-message', {
                        detail: { 
                          content: `You need smithing level ${recipe.requiredLevel} to smelt this.`, 
                          type: 'error',
                          timestamp: Date.now()
                        },
                        bubbles: true
                      });
                      document.dispatchEvent(chatEvent);
                      this.endDialogue();
                      return;
                    }
                    
                    // Start smelting process immediately without checking for ingredients
                    console.log('%c 🔥 Starting bronze bar smelting', "background: red; color: white; font-size: 16px;");
                    
                    // Play initial sound effect
                    try {
                      soundManager.play('mining_hit');
                    } catch (e) {
                      console.error('%c 🔥 Sound error:', "color: red;", e);
                    }
                    
                    // Emit smeltBronzeBar event
                    getSocket().then(socket => {
                      if (!socket) {
                        console.error('%c 🔥 Socket not available for smelting', "background: red; color: white;");
                        return;
                      }
                      
                      console.log('%c 🔥 Sending smeltBronzeBar event to server', "background: green; color: white;");
                      socket.emit('smeltBronzeBar', {
                        inventory: window.playerInventory || [],
                        skills: window.playerSkills || {},
                        recipe: selectedRecipe
                      }, (response: { success: boolean, error?: string, updatedInventory?: any[] }) => {
                        console.log('%c 🔥 smeltBronzeBar response:', "color: orange;", response);
                        
                        if (response.success) {
                          // Play success sound
                          soundManager.play('mining_hit');
                          
                          // Update inventory in window global
                          if (window.playerInventory && response.updatedInventory) {
                            window.playerInventory = response.updatedInventory;
                          }
                          
                          // Dispatch inventory update event
                          const inventoryUpdateEvent = new CustomEvent('inventory-updated', {
                            detail: { inventory: response.updatedInventory },
                            bubbles: true
                          });
                          document.dispatchEvent(inventoryUpdateEvent);
                          
                          // Show success notification
                          const chatEvent = new CustomEvent('chat-message', {
                            detail: { 
                              content: `Successfully smelted a ${selectedRecipe.replace(/_/g, ' ').toLowerCase()}!`,
                              type: 'success',
                              timestamp: Date.now()
                            },
                            bubbles: true
                          });
                          document.dispatchEvent(chatEvent);
                          
                          // Update dialog to smelting_complete
                          if (this.activeNPC) {
                            this.activeNPC.currentDialogueId = 'smelting_complete';
                            
                            // Update the completion text with specific recipe
                            const completeDialogue = this.activeNPC.dialogues.find(d => d.id === 'smelting_complete');
                            if (completeDialogue) {
                              const formattedRecipeName = selectedRecipe.replace(/_/g, ' ').toLowerCase()
                                .split(' ')
                                .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                                .join(' ');
                              
                              completeDialogue.text = `You have successfully smelted a ${formattedRecipeName}!`;
                            }
                            
                            if (this.onDialogOpen) {
                              this.onDialogOpen({...this.activeNPC});
                            }
                          }
                        } else if (response.error) {
                          // Show error notification
                          const chatEvent = new CustomEvent('chat-message', {
                            detail: { 
                              content: response.error,
                              type: 'error',
                              timestamp: Date.now()
                            },
                            bubbles: true
                          });
                          document.dispatchEvent(chatEvent);
                          
                          // Return to dialog options
                          if (this.activeNPC) {
                            this.activeNPC.currentDialogueId = 'smelting_options';
                            if (this.onDialogOpen) {
                              this.onDialogOpen({...this.activeNPC});
                            }
                          }
                        }
                      });
                    }).catch(err => {
                      console.error('%c 🔥 Socket retrieval error:', "background: red; color: white;", err);
                    });
                    
                    // Update the dialog to show progress initially
                    if (this.activeNPC) {
                      this.activeNPC.currentDialogueId = 'smelting_progress';
                      if (this.onDialogOpen) {
                        this.onDialogOpen({...this.activeNPC});
                      }
                    }
                  }
                },
                {
                  text: 'No, let me choose again',
                  nextDialogueId: 'smelting_options'
                }
              ]
            },
            {
              id: 'smelting_progress',
              text: 'Smelting in progress...',
              responses: [
                {
                  text: 'Cancel',
                  nextDialogueId: 'smelting_options',
                  action: () => {
                    // Show cancellation message
                    const chatEvent = new CustomEvent('chat-message', {
                      detail: { 
                        content: 'Smelting operation canceled',
                        type: 'info',
                        timestamp: Date.now()
                      },
                      bubbles: true
                    });
                    document.dispatchEvent(chatEvent);
                  }
                }
              ]
            },
            {
              id: 'smelting_complete',
              text: 'You have successfully smelted the metal!',
              responses: [
                {
                  text: 'Smelt something else',
                  nextDialogueId: 'smelting_options'
                },
                {
                  text: 'Go back',
                  nextDialogueId: 'default'
                }
              ]
            }
          ]
        };
        
        // Add socket listener for smelting progress updates
        const socket = getSocket();
        if (socket) {
          socket.then(socket => {
            if (socket) {
              // Set up smelting progress listener
              const onSmithingProgress = (data: any) => {
                console.log('Smithing progress:', data.progress);
                
                // Check if the dialogue is still open and we're in the progress dialogue
                if (this.activeNPC?.id === 'furnace_dialog' && 
                    this.activeNPC.currentDialogueId === 'smelting_progress') {
                  
                  // Update dialogue text to show progress
                  const progress = Math.round(data.progress * 100);
                  const progressDialogue = this.activeNPC.dialogues.find(d => d.id === 'smelting_progress');
                  if (progressDialogue) {
                    progressDialogue.text = `Smelting in progress: ${progress}% complete...`;
                    
                    // Force a UI update by calling onDialogOpen
                    if (this.onDialogOpen) {
                      this.onDialogOpen({...this.activeNPC});
                    }
                  }
                  
                  // If progress is complete, move to completion dialogue
                  if (data.progress >= 1) {
                    if (this.activeNPC) {
                      this.activeNPC.currentDialogueId = 'smelting_complete';
                      if (this.onDialogOpen) {
                        this.onDialogOpen({...this.activeNPC});
                      }
                    }
                  }
                }
              };
              
              // Set up smelting complete listener
              const onSmithingComplete = (data: any) => {
                console.log('Smithing complete:', data);
                
                // Check if the dialogue is still open
                if (this.activeNPC?.id === 'furnace_dialog') {
                  // Update completion text if multiple bars were created
                  if (data && data.barsCreated > 1) {
                    const completeDialogue = this.activeNPC.dialogues.find(d => d.id === 'smelting_complete');
                    if (completeDialogue) {
                      completeDialogue.text = `You have successfully smelted ${data.barsCreated} bars!`;
                    }
                  }
                  
                  // Move to completion dialogue
                  if (this.activeNPC) {
                    this.activeNPC.currentDialogueId = 'smelting_complete';
                    if (this.onDialogOpen) {
                      this.onDialogOpen({...this.activeNPC});
                    }
                  }
                }
              };
              
              // Set up smelting error listener
              const onSmithingError = (data: any) => {
                console.error('Smithing error:', data);
                
                // Check if the dialogue is still open
                if (this.activeNPC?.id === 'furnace_dialog') {
                  // Display error message in dialogue
                  if (data.message) {
                    const errorDialogue = this.activeNPC.dialogues.find(d => d.id === 'smelting_progress');
                    if (errorDialogue) {
                      errorDialogue.text = `Error: ${data.message}`;
                      
                      // Force a UI update by calling onDialogOpen
                      if (this.onDialogOpen) {
                        this.onDialogOpen({...this.activeNPC});
                      }
                    }
                  }
                  
                  // Show notification
                  const chatEvent = new CustomEvent('chat-message', {
                    detail: { 
                      content: data.message || 'Error during smelting',
                      type: 'error',
                      timestamp: Date.now()
                    },
                    bubbles: true
                  });
                  document.dispatchEvent(chatEvent);
                  
                  // Reset the dialogue to default
                  setTimeout(() => {
                    if (this.activeNPC?.id === 'furnace_dialog') {
                      this.activeNPC.currentDialogueId = 'default';
                      if (this.onDialogOpen) {
                        this.onDialogOpen({...this.activeNPC});
                      }
                    }
                  }, 3000);
                }
              };
              
              // Add listeners
              socket.on('smithingProgress', onSmithingProgress);
              socket.on('smithingComplete', onSmithingComplete);
              socket.on('smithingError', onSmithingError);
              
              // Store cleanup function in userData
              if (!(furnaceNPC as any).userData) {
                (furnaceNPC as any).userData = {};
              }
              (furnaceNPC as any).userData.cleanupSocketListeners = () => {
                socket.off('smithingProgress');
                socket.off('smithingComplete');
                socket.off('smithingError');
              };
            }
          });
        }
        
        // Treat the furnace interaction like an NPC dialogue
        this.activeNPC = furnaceNPC;
        
        if (this.onDialogOpen) {
          this.onDialogOpen(furnaceNPC);
        }
      }
    });
    
    // Create anvil - positioned in the northern part of the village
    const anvilPosition = new THREE.Vector3(centerX, 0, centerZ + 8);
    const anvilMesh = SmithingSystem.createAnvilMesh();
    anvilMesh.position.copy(anvilPosition);
    this.scene.add(anvilMesh);
    
    // Add anvil as an interactable landmark
    this.landmarks.push({
      id: 'barbarian_anvil',
      name: 'Barbarian Anvil',
      position: anvilPosition.clone(),
      mesh: anvilMesh,
      interactable: true,
      interactionRadius: 2,
      metadata: { isAnvil: true },
      onInteract: () => {
        console.log('Interacted with Barbarian Anvil');
        // Create a "virtual NPC" for the anvil
        const anvilNPC = {
          id: 'anvil_dialog',
          name: 'Anvil',
          position: anvilPosition.clone(),
          interactionRadius: 3,
          isInteracting: true,
          mesh: anvilMesh,
          currentDialogueId: 'default',
          dialogues: [
            {
              id: 'default',
              text: 'The anvil is used to smith metal bars into tools, weapons, and armor. You need smithing levels and metal bars to craft items.',
              responses: [
                {
                  text: 'Smith items',
                  nextDialogueId: 'smithing_options',
                },
                {
                  text: 'Go back',
                  nextDialogueId: 'default',
                  action: () => {
                    // End the dialogue when going back
                    this.endDialogue();
                  }
                }
              ]
            },
            {
              id: 'smithing_options',
              text: 'What would you like to smith?',
              responses: Object.entries(SMITHING_RECIPES).map(([key, recipe]) => {
                // Format recipe name for display
                const recipeName = key.replace(/_/g, ' ').toLowerCase()
                  .split(' ')
                  .map((word: string) => word.charAt(0).toUpperCase() + word.slice(1))
                  .join(' ');
                
                // Create formatted ingredients description
                const ingredientsDesc = recipe.ingredients.map(ingredient => {
                  const ingredientName = ingredient.type.replace(/_/g, ' ').toLowerCase()
                    .split(' ')
                    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
                    .join(' ');
                  return `${ingredientName} (${ingredient.count})`;
                }).join(', ');
                
                return {
                  text: `${recipeName} - Requires: ${ingredientsDesc} - Level: ${recipe.requiredLevel}`,
                  nextDialogueId: 'smithing_confirmation',
                  action: () => {
                    // Save the selected recipe to NPC temporary data
                    if ((anvilNPC as any).userData) {
                      (anvilNPC as any).userData.selectedRecipe = key;
                    } else {
                      (anvilNPC as any).userData = { selectedRecipe: key };
                    }
                  }
                };
              }).concat([
                {
                  text: 'Go back',
                  nextDialogueId: 'default',
                  action: () => {} // Empty action to satisfy TypeScript
                }
              ])
            },
            {
              id: 'smithing_confirmation',
              text: 'Are you sure you want to smith this item?',
              responses: [
                {
                  text: 'Yes, begin smithing',
                  nextDialogueId: 'smithing_progress',
                  action: () => {
                    // Get the selected recipe key from NPC userData
                    const selectedRecipe = (anvilNPC as any).userData?.selectedRecipe;
                    if (!selectedRecipe) {
                      console.error('No recipe selected');
                      return;
                    }
                    
                    // Check if player has required level and items
                    const inventory = window.playerInventory || [];
                    const skills = window.playerSkills || {};
                    const smithingLevel = skills[SkillType.SMITHING]?.level || 1;
                    const recipe = SMITHING_RECIPES[selectedRecipe];
                    
                    // Check if player meets level requirement
                    if (smithingLevel < recipe.requiredLevel) {
                      const chatEvent = new CustomEvent('chat-message', {
                        detail: { 
                          content: `You need smithing level ${recipe.requiredLevel} to smith this.`, 
                          type: 'error',
                          timestamp: Date.now()
                        },
                        bubbles: true
                      });
                      document.dispatchEvent(chatEvent);
                      this.endDialogue();
                      return;
                    }
                    
                    // Check if player has all ingredients
                    const hasAllIngredients = recipe.ingredients.every(ingredient => {
                      const playerItem = inventory.find(item => item.type === ingredient.type);
                      return playerItem && playerItem.count >= ingredient.count;
                    });
                    
                    if (!hasAllIngredients) {
                      const chatEvent = new CustomEvent('chat-message', {
                        detail: { 
                          content: 'You don\'t have the required materials.', 
                          type: 'error',
                          timestamp: Date.now()
                        },
                        bubbles: true
                      });
                      document.dispatchEvent(chatEvent);
                      this.endDialogue();
                      return;
                    }
                    
                    // Start smithing process by emitting socket event
                    const socket = getSocket();
                    if (socket) {
                      socket.then(socket => {
                        if (socket) {
                          socket.emit('startSmithing', {
                            itemType: selectedRecipe,
                            mode: SmithingMode.SMITHING,
                            inventory: window.playerInventory || [],
                            skills: window.playerSkills || {}
                          });
                          
                          // Save start time for progress calculation
                          if (!(anvilNPC as any).userData) {
                            (anvilNPC as any).userData = {};
                          }
                          (anvilNPC as any).userData.startTime = Date.now();
                          (anvilNPC as any).userData.smithingInProgress = true;
                          
                          // Play sound
                          if (typeof soundManager !== 'undefined') {
                            soundManager.play('mining_hit');
                          }
                        }
                      });
                    }
                  }
                },
                {
                  text: 'No, let me choose again',
                  nextDialogueId: 'smithing_options'
                }
              ]
            },
            {
              id: 'smithing_progress',
              text: 'Smithing in progress... Please wait.',
              responses: [
                {
                  text: 'Cancel smithing',
                  nextDialogueId: 'default',
                  action: () => {
                    // Cancel smithing process
                    const socket = getSocket();
                    if (socket) {
                      socket.then(socket => {
                        if (socket) {
                          socket.emit('cancelSmithing');
                        }
                      });
                    }
                    
                    // Clear smithing flags
                    if ((anvilNPC as any).userData) {
                      (anvilNPC as any).userData.smithingInProgress = false;
                    }
                  }
                }
              ]
            },
            {
              id: 'smithing_complete',
              text: 'You have successfully smithed the item!',
              responses: [
                {
                  text: 'Smith something else',
                  nextDialogueId: 'smithing_options'
                },
                {
                  text: 'Go back',
                  nextDialogueId: 'default'
                }
              ]
            }
          ]
        };
        
        // Add socket listener for smithing progress updates
        const socket = getSocket();
        if (socket) {
          socket.then(socket => {
            if (socket) {
              // Set up smithing progress listener
              const onSmithingProgress = (data: any) => {
                console.log('Smithing progress:', data.progress);
                
                // Check if the dialogue is still open and we're in the progress dialogue
                if (this.activeNPC?.id === 'anvil_dialog' && 
                    this.activeNPC.currentDialogueId === 'smithing_progress') {
                  
                  // Update dialogue text to show progress
                  const progress = Math.round(data.progress * 100);
                  const progressDialogue = this.activeNPC.dialogues.find(d => d.id === 'smithing_progress');
                  if (progressDialogue) {
                    progressDialogue.text = `Smithing in progress: ${progress}% complete...`;
                    
                    // Force a UI update by calling onDialogOpen
                    if (this.onDialogOpen) {
                      this.onDialogOpen({...this.activeNPC});
                    }
                  }
                  
                  // If progress is complete, move to completion dialogue
                  if (data.progress >= 1) {
                    if (this.activeNPC) {
                      this.activeNPC.currentDialogueId = 'smithing_complete';
                      if (this.onDialogOpen) {
                        this.onDialogOpen({...this.activeNPC});
                      }
                    }
                  }
                }
              };
              
              // Set up smithing complete listener
              const onSmithingComplete = (data: any) => {
                console.log('Smithing complete:', data);
                
                // Check if the dialogue is still open
                if (this.activeNPC?.id === 'anvil_dialog') {
                  // Move to completion dialogue
                  if (this.activeNPC) {
                    this.activeNPC.currentDialogueId = 'smithing_complete';
                    if (this.onDialogOpen) {
                      this.onDialogOpen({...this.activeNPC});
                    }
                  }
                }
              };
              
              // Set up smithing error listener
              const onSmithingError = (data: any) => {
                console.error('Smithing error:', data);
                
                // Check if the dialogue is still open
                if (this.activeNPC?.id === 'anvil_dialog') {
                  // Display error message in dialogue
                  if (data.message) {
                    const errorDialogue = this.activeNPC.dialogues.find(d => d.id === 'smithing_progress');
                    if (errorDialogue) {
                      errorDialogue.text = `Error: ${data.message}`;
                      
                      // Force a UI update by calling onDialogOpen
                      if (this.onDialogOpen) {
                        this.onDialogOpen({...this.activeNPC});
                      }
                    }
                  }
                  
                  // Show notification
                  const chatEvent = new CustomEvent('chat-message', {
                    detail: { 
                      content: data.message || 'Error during smithing',
                      type: 'error',
                      timestamp: Date.now()
                    },
                    bubbles: true
                  });
                  document.dispatchEvent(chatEvent);
                  
                  // Reset the dialogue to default
                  setTimeout(() => {
                    if (this.activeNPC?.id === 'anvil_dialog') {
                      this.activeNPC.currentDialogueId = 'default';
                      if (this.onDialogOpen) {
                        this.onDialogOpen({...this.activeNPC});
                      }
                    }
                  }, 3000);
                }
              };
              
              // Add listeners
              socket.on('smithingProgress', onSmithingProgress);
              socket.on('smithingComplete', onSmithingComplete);
              socket.on('smithingError', onSmithingError);
              
              // Store cleanup function in userData
              if (!(anvilNPC as any).userData) {
                (anvilNPC as any).userData = {};
              }
              (anvilNPC as any).userData.cleanupSocketListeners = () => {
                socket.off('smithingProgress');
                socket.off('smithingComplete');
                socket.off('smithingError');
              };
            }
          });
        }
        
        // Treat the anvil interaction like an NPC dialogue
        this.activeNPC = anvilNPC;
        
        if (this.onDialogOpen) {
          this.onDialogOpen(anvilNPC);
        }
      }
    });
    
    // Add NPCs to the village with better positioning
    const npcPositions = [
      { name: 'Bjorn the Blacksmith', position: new THREE.Vector3(centerX + 4, 0, centerZ + 8) }, // Near the anvil
      { name: 'Sigurd the Warrior', position: new THREE.Vector3(centerX, 0, centerZ) },           // Center of village
      { name: 'Astrid the Miner', position: new THREE.Vector3(centerX - 6, 0, centerZ - 16) }     // Near the furnace/mining area
    ];
    
    npcPositions.forEach(npcData => {
      const npc = createNPC(npcData.name, npcData.position, 0x8D6E63);
      npc.mesh.position.copy(npc.position);
      
      // Add custom dialogue for barbarians
      npc.dialogues = [
        {
          id: 'default',
          text: `I am ${npcData.name}, warrior of the Barbarian Village. We value strength and mining here.`,
          responses: [
            {
              text: 'Tell me about mining.',
              nextDialogueId: 'mining'
            },
            {
              text: 'Tell me about smithing.',
              nextDialogueId: 'smithing'
            },
            {
              text: 'Goodbye.',
              nextDialogueId: 'default'
            }
          ]
        },
        {
          id: 'mining',
          text: 'The rocks here contain valuable ores. Get a pickaxe and try mining them. Higher mining levels let you mine better ores.',
          responses: [
            {
              text: 'Thanks for the information.',
              nextDialogueId: 'default'
            }
          ]
        },
        {
          id: 'smithing',
          text: 'We have a furnace for smelting ore into bars, and an anvil for crafting weapons and tools. Use the furnace to smelt your ores, then use the anvil to smith the bars into useful items.',
          responses: [
            {
              text: 'Tell me more about the process.',
              nextDialogueId: 'smithing_detail'
            },
            {
              text: 'Thanks for the information.',
              nextDialogueId: 'default'
            }
          ]
        },
        {
          id: 'smithing_detail',
          text: 'First, gather ores through mining. Then use our furnace to turn them into metal bars. Bronze bars need copper and tin. Iron bars just need iron ore. Once you have bars, use the anvil to craft tools and weapons. A higher smithing level lets you work with better metals.',
          responses: [
            {
              text: 'Thanks for explaining.',
              nextDialogueId: 'default'
            }
          ]
        }
      ];
      
      this.npcs.push(npc);
      this.scene.add(npc.mesh);
    });
  }

  // Get all NPCs
  public getNPCs(): NPC[] {
    return this.npcs as NPC[];
  }
  
  // Get a specific NPC by ID
  public getNPC(npcId: string): NPC | undefined {
    return this.npcs.find(npc => npc.id === npcId) as NPC | undefined;
  }

  // Check for interactions with NPCs or landmarks at a given position
  public checkInteractions(position: THREE.Vector3, onInteract: (target: NPC | Landmark) => void) {
    // First check NPC interactions
    for (const npc of this.npcs) {
      const distance = position.distanceTo(npc.position);
      if (distance <= npc.interactionRadius) {
        onInteract(npc);
        return true;
      }
    }
    
    // Then check landmark interactions
    for (const landmark of this.landmarks) {
      if (landmark.interactable && landmark.interactionRadius) {
        const distance = position.distanceTo(landmark.position);
        if (distance <= landmark.interactionRadius) {
          onInteract(landmark);
          if (landmark.onInteract) {
            landmark.onInteract();
          }
          return true;
        }
      }
    }
    
    return false;
  }

  // For handling NPC dialogue interactions
  public setDialogHandlers(
    onDialogOpen: ((npc: NPC) => void) | null,
    onDialogClose: (() => void) | null
  ) {
    console.log("Dialog handlers set:", !!onDialogOpen, !!onDialogClose);
    this.onDialogOpen = onDialogOpen;
    this.onDialogClose = onDialogClose;
  }

  // Start a dialogue with an NPC
  public startDialogue(npcId: string) {
    console.log(`Starting dialogue with NPC ID: ${npcId}`);
    
    const npc = this.npcs.find(n => n.id === npcId) as NPC | undefined;
    if (!npc) {
      console.warn(`Cannot start dialogue: NPC with id ${npcId} not found`);
      return;
    }
    
    console.log(`Found NPC: ${npc.name}, starting dialogue with ID: ${npc.currentDialogueId}`);
    npc.isInteracting = true;
    this.activeNPC = npc;
    
    if (this.onDialogOpen) {
      console.log(`Calling onDialogOpen for ${npc.name}`);
      this.onDialogOpen(npc);
    } else {
      console.warn("No onDialogOpen handler registered");
    }
  }

  // Continue a dialogue with a response
  public continueDialogue(responseIndex: number) {
    if (!this.activeNPC) {
      console.warn("Cannot continue dialogue: No active NPC");
      return;
    }
    
    const npc = this.activeNPC;
    console.log(`Continuing dialogue for ${npc.name}, current dialogueId: ${npc.currentDialogueId}, response: ${responseIndex}`);
    
    const currentDialogue = npc.dialogues.find(d => d.id === npc.currentDialogueId);
    
    if (!currentDialogue) {
      console.warn(`No dialogue found with id ${npc.currentDialogueId}`);
      return;
    }
    
    if (!currentDialogue.responses || !currentDialogue.responses[responseIndex]) {
      console.warn(`No response found at index ${responseIndex} for dialogue ${npc.currentDialogueId}`);
      return;
    }
    
    const response = currentDialogue.responses[responseIndex];
    console.log(`Selected response: "${response.text}", next dialogue: ${response.nextDialogueId}`);
    
    // Execute any action associated with the response
    if (response.action) {
      response.action();
    }
    
    // Check if this is a goodbye response
    const farewellPhrases = ['goodbye', 'farewell', 'bye', 'thanks for the information'];
    const isGoodbye = farewellPhrases.some(phrase => 
      response.text.toLowerCase().includes(phrase.toLowerCase())
    );
    
    if (isGoodbye) {
      console.log("Goodbye response detected, ending dialogue");
      this.endDialogue();
      return;
    }
    
    // Update to the next dialogue if specified
    if (response.nextDialogueId) {
      npc.currentDialogueId = response.nextDialogueId;
      console.log(`Updated dialogueId to ${npc.currentDialogueId}`);
      
      // Notify dialog system to update
      if (this.onDialogOpen) {
        console.log(`Notifying dialog system of update for ${npc.name}`);
        this.onDialogOpen(npc);
      } else {
        console.warn("No onDialogOpen handler registered");
      }
    } else {
      // End dialogue if no next dialogue is specified
      console.log("No next dialogue specified, ending dialogue");
      this.endDialogue();
    }
  }

  // End the current dialogue
  public endDialogue() {
    console.log('Ending dialogue');
    
    if (this.activeNPC) {
      // Run cleanup if available
      if (this.activeNPC.userData?.cleanupSocketListeners) {
        this.activeNPC.userData.cleanupSocketListeners();
      }
      
      // Clear any ongoing smelting interval
      if (this.activeNPC.userData?.smeltingInterval) {
        clearInterval(this.activeNPC.userData.smeltingInterval);
        this.activeNPC.userData.smeltingInterval = null;
        console.log('Cleared smelting interval');
      }
      
      // Reset dialogue to initial state
      // Tutorial Guide starts with 'welcome', others start with 'default'
      this.activeNPC.currentDialogueId = this.activeNPC.id === 'tutorial_guide' ? 'welcome' : 'default';
      
      // Mark NPC as no longer interacting
      this.activeNPC.isInteracting = false;
      
      // Trigger the dialog close event
      if (this.onDialogClose) {
        this.onDialogClose();
      }
      
      // Clear the active NPC
      this.activeNPC = null;
    }
  }

  // Update method to animate NPCs and landmarks if needed
  public update(delta: number) {
    // Animate NPCs (idle animations, movement, etc.)
    this.npcs.forEach(npc => {
      // Simple idle animation - slight bobbing up and down
      if (!npc.isInteracting && npc.mesh) {
        npc.mesh.position.y = npc.position.y + Math.sin(Date.now() * 0.002) * 0.05;
      }
    });
  }

  // Cleanup resources when no longer needed
  public cleanup() {
    // Remove all meshes from scene
    this.npcs.forEach(npc => {
      this.scene.remove(npc.mesh);
      this.disposeObject(npc.mesh);
    });
    
    this.landmarks.forEach(landmark => {
      if (landmark.mesh) {
        this.scene.remove(landmark.mesh);
        this.disposeObject(landmark.mesh);
      }
    });
    
    // Clear arrays
    this.npcs = [];
    this.landmarks = [];
    this.activeNPC = null;
  }

  // Helper to dispose of Three.js objects properly
  private disposeObject(obj: THREE.Object3D) {
    if (!obj) return;
    
    // Dispose of geometries and materials
    if (obj instanceof THREE.Mesh) {
      if (obj.geometry) {
        obj.geometry.dispose();
      }
      
      if (obj.material) {
        // Handle arrays of materials
        if (Array.isArray(obj.material)) {
          obj.material.forEach(material => material.dispose());
        } else {
          obj.material.dispose();
        }
      }
    }
    
    // Recursively process children
    if (obj.children.length > 0) {
      for (let i = obj.children.length - 1; i >= 0; i--) {
        this.disposeObject(obj.children[i]);
      }
    }
  }

  // Create combat NPCs like rats
  private createCombatNPCs() {
    console.log('Creating combat NPCs (rats)...');
    
    // Socket initialization handling with retry mechanism
    const setupSocketListeners = (socket: any) => {
      // Remove any existing listeners to prevent duplicates
      socket.off('updateNPCs');
      socket.off('npcStateUpdate');
      
      // Handle initial NPC data
      socket.on('updateNPCs', (npcs: any[]) => {
        console.log('Received NPC data from server:', npcs);
        this.handleNPCsFromServer(npcs);
      });
      
      // Handle NPC state updates (combat, health, etc.)
      socket.on('npcStateUpdate', (data: {
        id: string;
        health?: number;
        maxHealth?: number;
        combatState?: 'idle' | 'engaged' | 'dead';
        attacker?: string;
      }) => {
        this.updateNPCState(data);
      });
      
      // Request NPCs from server to ensure we get the data
      console.log('Requesting NPC data from server...');
      socket.emit('requestNPCs');
    };
    
    // Try to get socket with retry mechanism
    const initSocket = async () => {
      try {
        const socket = await getSocket();
        if (socket && socket.connected) {
          console.log('Socket connected, setting up NPC listeners');
          setupSocketListeners(socket);
        } else {
          console.log('Socket not connected yet, retrying in 1 second...');
          setTimeout(initSocket, 1000); // Retry after 1 second
        }
      } catch (error) {
        console.error('Error getting socket for NPCs:', error);
        setTimeout(initSocket, 2000); // Retry after 2 seconds on error
      }
    };
    
    // Start initialization process
    initSocket();
  }
  
  // Create NPCs from server data
  private handleNPCsFromServer(npcData: any[]) {
    console.log(`Processing ${npcData.length} NPCs from server`);
    
    npcData.forEach((data: {
      id: string;
      type: string;
      name: string;
      x: number;
      y: number;
      z: number;
      level: number;
      health: number;
      maxHealth: number;
      isAttackable: boolean;
      isAggressive: boolean;
      combatState?: 'idle' | 'engaged' | 'dead';
    }) => {
      // Check if NPC already exists
      const existingNpc = this.npcs.find(npc => npc.id === data.id);
      if (existingNpc) {
        console.log(`NPC already exists: ${data.id}`);
        return;
      }
      
      // Create different types of NPCs
      switch (data.type) {
        case 'rat':
          this.createRatNPC(data);
          break;
        default:
          console.log(`Unknown NPC type: ${data.type}`);
      }
    });
  }
  
  // Create a rat NPC with combat capabilities
  private createRatNPC(data: any) {
    console.log(`Creating rat NPC: ${data.name} at position ${data.x}, ${data.y}, ${data.z}`);
    
    // Create a group to hold the rat and its health bar
    const group = new THREE.Group();
    group.position.set(data.x, data.y, data.z);
    
    // Rat body - a small brown capsule
    const ratGeometry = new THREE.CapsuleGeometry(0.2, 0.4, 4, 8);
    const ratMaterial = new THREE.MeshStandardMaterial({ color: 0x795548 });
    const ratMesh = new THREE.Mesh(ratGeometry, ratMaterial);
    ratMesh.position.y = 0.3; // Lower to the ground
    group.add(ratMesh);
    
    // Create level indicator above the rat
    const levelCanvas = document.createElement('canvas');
    levelCanvas.width = 128;
    levelCanvas.height = 64;
    const levelContext = levelCanvas.getContext('2d');
    
    if (levelContext) {
      levelContext.fillStyle = 'rgba(0, 0, 0, 0.7)';
      levelContext.fillRect(0, 0, 128, 64);
      levelContext.font = 'Bold 20px Arial';
      levelContext.fillStyle = '#FFFFFF';
      levelContext.textAlign = 'center';
      levelContext.textBaseline = 'middle';
      levelContext.fillText(`Level ${data.level}`, 64, 32);
    }
    
    const levelTexture = new THREE.CanvasTexture(levelCanvas);
    const levelMaterial = new THREE.SpriteMaterial({ map: levelTexture, transparent: true });
    const levelSprite = new THREE.Sprite(levelMaterial);
    levelSprite.position.set(0, 1.0, 0);
    levelSprite.scale.set(1, 0.5, 1);
    group.add(levelSprite);
    
    // Create health bar (initially hidden)
    const healthBarWidth = 0.6;
    const healthBarGeometry = new THREE.PlaneGeometry(healthBarWidth, 0.1);
    const healthBarMaterial = new THREE.MeshBasicMaterial({
      color: 0xFF0000,
      side: THREE.DoubleSide
    });
    const healthBar = new THREE.Mesh(healthBarGeometry, healthBarMaterial);
    healthBar.position.set(0, 0.8, 0);
    healthBar.rotation.x = -Math.PI / 2; // Face the health bar toward the camera
    healthBar.rotation.z = Math.PI; // Flip it correctly
    healthBar.visible = false; // Initially hidden
    healthBar.userData.isHealthBar = true;
    group.add(healthBar);
    
    // Create name tag
    const nameCanvas = document.createElement('canvas');
    nameCanvas.width = 128;
    nameCanvas.height = 32;
    const nameContext = nameCanvas.getContext('2d');
    
    if (nameContext) {
      nameContext.fillStyle = 'rgba(0, 0, 0, 0.5)';
      nameContext.fillRect(0, 0, 128, 32);
      nameContext.font = '16px Arial';
      nameContext.fillStyle = '#FFFFFF';
      nameContext.textAlign = 'center';
      nameContext.textBaseline = 'middle';
      nameContext.fillText(data.name, 64, 16);
    }
    
    const nameTexture = new THREE.CanvasTexture(nameCanvas);
    const nameMaterial = new THREE.SpriteMaterial({ map: nameTexture, transparent: true });
    const nameSprite = new THREE.Sprite(nameMaterial);
    nameSprite.position.set(0, 0.6, 0);
    nameSprite.scale.set(1, 0.25, 1);
    group.add(nameSprite);
    
    // Mark mesh as NPC and attackable
    group.userData.isNPC = true;
    group.userData.isAttackable = data.isAttackable;
    group.userData.npcId = data.id;
    group.userData.npcType = data.type;
    group.userData.level = data.level;
    
    // Add to scene
    this.scene.add(group);
    
    // Create NPC object
    const npc: CombatNPC = {
      id: data.id,
      name: data.name,
      position: new THREE.Vector3(data.x, data.y, data.z),
      mesh: group,
      interactionRadius: 2,
      dialogues: [
        {
          id: 'attack',
          text: `Attack ${data.name}`,
          responses: [
            {
              text: 'Attack',
              action: () => this.attackNPC(data.id)
            },
            {
              text: 'Cancel'
            }
          ]
        }
      ],
      currentDialogueId: 'attack',
      isInteracting: false,
      level: data.level,
      health: data.health,
      maxHealth: data.maxHealth,
      isAttackable: data.isAttackable,
      combatState: data.combatState || 'idle'
    };
    
    // Add to NPCs array
    this.npcs.push(npc);
    
    console.log(`Created rat NPC: ${npc.name} with ID ${npc.id}`);
    return npc;
  }
  
  // Attack an NPC
  private attackNPC(npcId: string) {
    console.log(`Attacking NPC: ${npcId}`);
    
    const socket = getSocket();
    socket.then(socket => {
      if (socket) {
        socket.emit('attackNPC', { npcId });
      }
    });
  }
  
  // Update NPC state (health, combat state, etc.)
  public updateNPCState(data: {
    id: string;
    health?: number;
    maxHealth?: number;
    combatState?: 'idle' | 'engaged' | 'dead';
    attacker?: string;
  }) {
    const npc = this.npcs.find(npc => npc.id === data.id) as CombatNPC | undefined;
    if (!npc) {
      console.warn(`NPC not found for state update: ${data.id}`);
      return;
    }
    
    console.log(`Updating NPC state for ${npc.name}:`, data);
    
    // Update combat state if provided
    if (data.combatState !== undefined) {
      const oldState = npc.combatState;
      npc.combatState = data.combatState;
      console.log(`NPC ${npc.name} combat state changed: ${oldState} -> ${data.combatState}`);
      
      // Handle specific state transitions
      if (data.combatState === 'engaged') {
        // Show health bar when engaged in combat
        this.showNPCHealthBar(npc);
        console.log(`Showing health bar for NPC ${npc.name}`);
        
        // Update visual state to show engaged combat stance
        const npcMesh = npc.mesh.children[0] as THREE.Mesh;
        if (npcMesh && npcMesh.material) {
          const material = npcMesh.material as THREE.MeshStandardMaterial;
          material.emissive.set(0xff0000);
          material.emissiveIntensity = 0.2;
          
          // Add a slight scale pulse animation
          const originalScale = npcMesh.scale.clone();
          const pulse = () => {
            const s = 1.0 + Math.sin(Date.now() * 0.01) * 0.1;
            npcMesh.scale.set(originalScale.x * s, originalScale.y * s, originalScale.z * s);
            if (npc.combatState === 'engaged') {
              requestAnimationFrame(pulse);
            } else {
              npcMesh.scale.copy(originalScale);
            }
          };
          pulse();
        }
      } else if (data.combatState === 'dead') {
        // Handle death state
        console.log(`NPC ${npc.name} died!`);
        npc.health = 0;
        this.updateNPCHealthBar(npc);
        this.hideNPCMesh(npc);
      } else if (data.combatState === 'idle' && npc.health > 0) {
        // Reset to idle state (typically after respawn)
        console.log(`NPC ${npc.name} returned to idle state`);
        this.hideNPCHealthBar(npc);
        this.showNPCMesh(npc);
        
        // Reset emissive properties to normal
        const npcMesh = npc.mesh.children[0] as THREE.Mesh;
        if (npcMesh && npcMesh.material) {
          const material = npcMesh.material as THREE.MeshStandardMaterial;
          material.emissive.set(0x000000);
          material.emissiveIntensity = 0;
        }
      }
    }
    
    // Update health if provided
    if (data.health !== undefined) {
      // Save old health for damage animation
      const oldHealth = npc.health;
      npc.health = data.health;
      console.log(`NPC ${npc.name} health changed: ${oldHealth} -> ${data.health}`);
      
      // If in combat, ensure health bar is visible
      if (npc.combatState === 'engaged') {
        this.showNPCHealthBar(npc);
        
        // Add damage flash effect if health decreased
        if (data.health < oldHealth) {
          console.log(`NPC ${npc.name} took damage!`);
          const healthBar = this.findHealthBar(npc.mesh);
          if (healthBar) {
            const material = healthBar.material as THREE.MeshBasicMaterial;
            // Save original color
            const originalColor = material.color.clone();
            
            // Flash red
            material.color.set(0xff0000);
            
            // Restore original color
            setTimeout(() => {
              material.color.copy(originalColor);
            }, 300);
          }
          
          // Also make the NPC mesh flash
          const npcMesh = npc.mesh.children[0] as THREE.Mesh;
          if (npcMesh && npcMesh.material) {
            const material = npcMesh.material as THREE.MeshStandardMaterial;
            const originalColor = material.color.clone();
            const originalEmissive = material.emissive.clone();
            const originalIntensity = material.emissiveIntensity;
            
            // Flash white
            material.emissive.set(0xffffff);
            material.emissiveIntensity = 0.5;
            
            // Restore original colors
            setTimeout(() => {
              material.emissive.copy(originalEmissive);
              material.emissiveIntensity = originalIntensity;
            }, 200);
          }
        }
      }
      
      // Update health bar
      this.updateNPCHealthBar(npc);
    }
    
    // Update max health if provided
    if (data.maxHealth !== undefined) {
      npc.maxHealth = data.maxHealth;
      this.updateNPCHealthBar(npc);
      console.log(`NPC ${npc.name} max health updated to ${data.maxHealth}`);
    }
  }
  
  // Show NPC health bar
  private showNPCHealthBar(npc: CombatNPC) {
    const healthBar = this.findHealthBar(npc.mesh);
    if (healthBar) {
      healthBar.visible = true;
    }
  }
  
  // Hide NPC health bar
  private hideNPCHealthBar(npc: CombatNPC) {
    const healthBar = this.findHealthBar(npc.mesh);
    if (healthBar) {
      healthBar.visible = false;
    }
  }
  
  // Update NPC health bar based on current health
  private updateNPCHealthBar(npc: CombatNPC) {
    const healthBar = this.findHealthBar(npc.mesh);
    if (!healthBar) return;
    
    // Calculate health percentage
    const healthPercent = npc.health / npc.maxHealth;
    
    // Update health bar scale
    const originalWidth = 0.6; // Same as when created
    healthBar.scale.x = healthPercent;
    
    // Center the bar based on scale change
    const offset = (originalWidth - (originalWidth * healthPercent)) / 2;
    healthBar.position.x = offset;
    
    // Update color based on health percentage
    const material = healthBar.material as THREE.MeshBasicMaterial;
    if (healthPercent > 0.6) {
      material.color.set(0x00FF00); // Green
    } else if (healthPercent > 0.3) {
      material.color.set(0xFFFF00); // Yellow
    } else {
      material.color.set(0xFF0000); // Red
    }
  }
  
  // Hide NPC mesh when dead
  private hideNPCMesh(npc: CombatNPC) {
    if (npc.mesh instanceof THREE.Group) {
      // Hide the body mesh (first child) but keep the level indicator visible
      const body = npc.mesh.children.find(child => 
        child instanceof THREE.Mesh && 
        !(child.userData.isHealthBar)
      );
      if (body) {
        body.visible = false;
      }
    }
  }
  
  // Show NPC mesh when respawned
  private showNPCMesh(npc: CombatNPC) {
    if (npc.mesh instanceof THREE.Group) {
      // Show all meshes
      npc.mesh.children.forEach(child => {
        child.visible = true;
      });
    }
  }
  
  // Helper to find the health bar mesh in an NPC group
  private findHealthBar(mesh: THREE.Object3D): THREE.Mesh | null {
    if (mesh instanceof THREE.Group) {
      for (const child of mesh.children) {
        if (child instanceof THREE.Mesh && child.userData.isHealthBar) {
          return child;
        }
      }
    }
    return null;
  }
  
  // Get all combat NPCs
  public getCombatNPCs(): CombatNPC[] {
    return this.npcs.filter(npc => 'health' in npc) as CombatNPC[];
  }
}

export default LandmarkManager; 