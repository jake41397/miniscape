import * as THREE from 'three';
import { NPC, Landmark, createTutorialGuideNPC, createSignpost, createLumbridgeCastleMesh, createComingSoonSign, createBarbarianHut, createNPC } from './landmarks';
import { ZONES } from './zones';
import { SmithingSystem, SmithingMode } from '../systems/SmithingSystem';

interface LandmarkManagerProps {
  scene: THREE.Scene;
}

class LandmarkManager {
  private scene: THREE.Scene;
  private npcs: NPC[] = [];
  private landmarks: Landmark[] = [];
  private activeNPC: NPC | null = null;
  private onDialogOpen: ((npc: NPC) => void) | null = null;
  private onDialogClose: (() => void) | null = null;

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
      onInteract: () => {
        console.log('Interacted with Barbarian Furnace');
        // Emit an event to open the smelting interface
        document.dispatchEvent(new CustomEvent('open-smithing', { 
          detail: { mode: SmithingMode.SMELTING } 
        }));
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
      onInteract: () => {
        console.log('Interacted with Barbarian Anvil');
        // Emit an event to open the smithing interface
        document.dispatchEvent(new CustomEvent('open-smithing', { 
          detail: { mode: SmithingMode.SMITHING } 
        }));
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
    return this.npcs;
  }
  
  // Get a specific NPC by ID
  public getNPC(npcId: string): NPC | undefined {
    return this.npcs.find(npc => npc.id === npcId);
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
    
    const npc = this.npcs.find(n => n.id === npcId);
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
    if (this.activeNPC) {
      console.log(`Ending dialogue with ${this.activeNPC.name}`);
      
      // Reset the dialogue ID to the initial page ('welcome' for tutorial guide, 'default' for others)
      // Find initial dialogue ID - use the first one in the dialogues array or 'default'/'welcome'
      const initialDialogues = ['welcome', 'default'];
      let initialDialogueId = 'default';
      
      if (this.activeNPC.dialogues && this.activeNPC.dialogues.length > 0) {
        // Check if the NPC has any of the standard initial dialogues
        for (const id of initialDialogues) {
          if (this.activeNPC.dialogues.some(d => d.id === id)) {
            initialDialogueId = id;
            break;
          }
        }
        
        // If no standard initial dialogue found, use the first one
        if (!initialDialogueId) {
          initialDialogueId = this.activeNPC.dialogues[0].id;
        }
      }
      
      console.log(`Resetting ${this.activeNPC.name}'s dialogue to: ${initialDialogueId}`);
      this.activeNPC.currentDialogueId = initialDialogueId;
      this.activeNPC.isInteracting = false;
      
      // Store a reference before clearing activeNPC
      const npc = this.activeNPC;
      this.activeNPC = null;
      
      if (this.onDialogClose) {
        this.onDialogClose();
      }
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
}

export default LandmarkManager; 