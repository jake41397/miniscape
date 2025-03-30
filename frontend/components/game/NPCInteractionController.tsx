import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { NPC, Landmark } from '../../game/world/landmarks';
import DialogueBox from './DialogueBox';

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
  const notificationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
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
  
  useEffect(() => {
    // Set up right-click interaction
    const handleRightClick = (event: MouseEvent) => {
      if (event.button === 2) { // Right click
        console.log("Right-click detected, checking for NPC interactions");
        
        const landmarkManager = worldManager?.getLandmarkManager();
        const player = playerRef.current;
        
        if (!landmarkManager) {
          console.log("No landmark manager available");
          return;
        }
        
        if (!player) {
          console.log("No player reference available");
          return;
        }
        
        console.log("Checking for interactions at player position:", player.position);
        
        // Check if player is near any interactable NPC or landmark
        landmarkManager.checkInteractions(player.position, (target: NPC | Landmark) => {
          console.log("Interaction target found:", target);
          
          if ('dialogues' in target) {
            // It's an NPC
            console.log(`Starting dialogue with NPC: ${target.name}`);
            setActiveNPC(target);
            landmarkManager.startDialogue(target.id);
          } else if (target.interactable) {
            // It's an interactable landmark
            console.log(`Interacting with landmark: ${target.name}`);
            showNotification(`${target.name}: ${target.onInteract ? 'Interacting...' : 'Nothing to interact with.'}`);
          }
        });
      }
    };
    
    window.addEventListener('mousedown', handleRightClick);
    
    return () => {
      window.removeEventListener('mousedown', handleRightClick);
      if (notificationTimeoutRef.current) {
        clearTimeout(notificationTimeoutRef.current);
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
    </>
  );
};

export default NPCInteractionController; 