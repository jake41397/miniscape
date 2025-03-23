import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

interface ChatBubble {
  object: CSS2DObject;
  expiry: number;
  message?: string;
}

interface ChatBubbleManagerProps {
  scene: THREE.Scene;
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  playersRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  mySocketId: string;
}

export interface ChatBubbleManagerInterface {
  createChatBubble: (playerId: string, message: string, mesh: THREE.Mesh) => CSS2DObject | null;
  updateBubbles: () => void;
}

const ChatBubbleManager: React.FC<ChatBubbleManagerProps & {
  onInit: (manager: ChatBubbleManagerInterface) => void;
}> = ({ scene, playerRef, playersRef, mySocketId, onInit }) => {
  // Track chat bubbles
  const chatBubblesRef = useRef<Map<string, ChatBubble>>(new Map());
  
  // Create chat bubble above player
  const createChatBubble = (playerId: string, message: string, mesh: THREE.Mesh) => {
    // Check if the mesh is valid
    if (!mesh || !mesh.isObject3D) {
      console.error('Cannot create chat bubble - invalid mesh provided', { playerId, meshType: mesh ? typeof mesh : 'null' });
      return null;
    }
    
    // Remove any existing chat bubble for this player
    if (chatBubblesRef.current.has(playerId)) {
      const existingBubble = chatBubblesRef.current.get(playerId);
      if (existingBubble && existingBubble.object) {
        // Remove from parent if it has one
        if (existingBubble.object.parent) {
          existingBubble.object.parent.remove(existingBubble.object);
        }
        // Also remove from scene directly to be sure
        scene.remove(existingBubble.object);
      }
      // Remove from tracking map
      chatBubblesRef.current.delete(playerId);
    }
    
    try {
      // Create bubble div
      const bubbleDiv = document.createElement('div');
      bubbleDiv.className = 'chat-bubble';
      bubbleDiv.textContent = message;
      
      // Improved styling for better visibility
      bubbleDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.8)';
      bubbleDiv.style.color = 'white';
      bubbleDiv.style.padding = '8px 12px';
      bubbleDiv.style.borderRadius = '12px';
      bubbleDiv.style.fontSize = '16px';
      bubbleDiv.style.fontWeight = 'bold';
      bubbleDiv.style.fontFamily = 'Arial, sans-serif';
      bubbleDiv.style.maxWidth = '250px';
      bubbleDiv.style.textAlign = 'center';
      bubbleDiv.style.wordWrap = 'break-word';
      bubbleDiv.style.userSelect = 'none';
      bubbleDiv.style.pointerEvents = 'none'; // Make sure bubbles don't interfere with clicks
      bubbleDiv.style.border = '2px solid rgba(255, 255, 255, 0.5)';
      bubbleDiv.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.5)';
      bubbleDiv.style.textShadow = '0 1px 2px rgba(0, 0, 0, 0.7)';
      bubbleDiv.style.transform = 'scale(1.1)'; // Make the bubble slightly larger
      
      // Create the bubble object
      const chatBubble = new CSS2DObject(bubbleDiv);
      chatBubble.position.set(0, 4.5, 0); // Position slightly higher above the player for better visibility
      chatBubble.userData.bubbleType = 'chatBubble';
      chatBubble.userData.forPlayer = playerId;
      chatBubble.userData.createdAt = Date.now(); // Track when created for debugging
      chatBubble.userData.message = message; // Store the message for debugging
      
      // Verify mesh still exists in the scene (could have been removed while we were processing)
      let targetMesh = mesh;
      if (!mesh.parent) {
        console.warn(`Player mesh for ${playerId} is not in the scene, cannot attach bubble`);
        
        // Double-check if the player is still in our tracking
        if (playersRef.current.has(playerId)) {
          const trackedMesh = playersRef.current.get(playerId);
          if (trackedMesh && trackedMesh !== mesh && trackedMesh.parent) {
            targetMesh = trackedMesh;
          } else {
            console.warn(`No valid alternative mesh found for ${playerId}`);
            return null;
          }
        } else if (playerId === mySocketId && playerRef.current && playerRef.current.parent) {
          // Special case for local player
          targetMesh = playerRef.current;
        } else {
          console.warn(`Player ${playerId} not found in tracking, cannot create bubble`);
          return null;
        }
      }
      
      // Add to mesh
      targetMesh.add(chatBubble);
      
      // Store in our ref with expiry time (10 seconds from now)
      const expiryTime = Date.now() + 10000; // 10 seconds
      chatBubblesRef.current.set(playerId, { 
        object: chatBubble, 
        expiry: expiryTime,
        message: message // Store the message for debugging
      });
      
      return chatBubble;
    } catch (error) {
      console.error('Error creating chat bubble element:', error);
      return null;
    }
  };
  
  // Update and clean up expired bubbles
  const updateBubbles = () => {
    chatBubblesRef.current.forEach((bubbleData, playerId) => {
      if (Date.now() > bubbleData.expiry) {
        // Remove expired bubbles
        if (bubbleData.object.parent) {
          bubbleData.object.parent.remove(bubbleData.object);
        }
        chatBubblesRef.current.delete(playerId);
      }
    });
  };
  
  // Initialize the manager
  useEffect(() => {
    onInit({
      createChatBubble,
      updateBubbles
    });
  }, []);
  
  return null; // This component doesn't render anything visible
};

export default ChatBubbleManager; 