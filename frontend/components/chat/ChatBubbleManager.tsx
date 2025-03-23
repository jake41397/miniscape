import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { getSocket } from '../../game/network/socket';

interface ChatBubbleManagerProps {
  scene: THREE.Scene;
  playerRef: React.RefObject<THREE.Mesh | null>;
  playersRef: React.RefObject<Map<string, THREE.Mesh>>;
}

// Changed to a factory function instead of a custom hook
const createChatBubbleManager = ({ 
  scene,
  playerRef,
  playersRef
}: ChatBubbleManagerProps) => {
  // Track chat bubbles with expiry time
  const chatBubbles = new Map<string, { object: CSS2DObject, expiry: number }>();
  // Variable to store the cleanup function
  let cleanupListener: (() => void) | null = null;

  // Create chat bubble above player
  const createChatBubble = (playerId: string, message: string, mesh: THREE.Mesh) => {
    // Remove any existing chat bubble for this player
    if (chatBubbles.has(playerId)) {
      const existingBubble = chatBubbles.get(playerId);
      if (existingBubble && existingBubble.object) {
        // Remove from parent if it has one
        if (existingBubble.object.parent) {
          existingBubble.object.parent.remove(existingBubble.object);
        }
        // Also remove from scene directly to be sure
        scene.remove(existingBubble.object);
      }
      // Remove from tracking map
      chatBubbles.delete(playerId);
    }
    
    // Create bubble div
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'chat-bubble';
    bubbleDiv.textContent = message;
    bubbleDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    bubbleDiv.style.color = 'white';
    bubbleDiv.style.padding = '5px 10px';
    bubbleDiv.style.borderRadius = '10px';
    bubbleDiv.style.fontSize = '12px';
    bubbleDiv.style.fontFamily = 'Arial, sans-serif';
    bubbleDiv.style.maxWidth = '150px';
    bubbleDiv.style.textAlign = 'center';
    bubbleDiv.style.wordWrap = 'break-word';
    bubbleDiv.style.userSelect = 'none';
    bubbleDiv.style.pointerEvents = 'none'; // Make sure bubbles don't interfere with clicks
    
    // Create the bubble object
    const chatBubble = new CSS2DObject(bubbleDiv);
    chatBubble.position.set(0, 3.2, 0); // Position above the player name
    chatBubble.userData.bubbleType = 'chatBubble';
    chatBubble.userData.forPlayer = playerId;
    
    // Add to mesh
    mesh.add(chatBubble);
    
    // Store in our map with expiry time (10 seconds from now)
    const expiryTime = Date.now() + 10000; // 10 seconds
    chatBubbles.set(playerId, { 
      object: chatBubble, 
      expiry: expiryTime 
    });
    
    return chatBubble;
  };

  // Function to update and clean up expired chat bubbles
  const updateChatBubbles = () => {
    const now = Date.now();
    const expiredBubbles: string[] = [];
    
    chatBubbles.forEach((bubble, playerId) => {
      if (now > bubble.expiry) {
        expiredBubbles.push(playerId);
      }
    });
    
    // Remove expired bubbles
    expiredBubbles.forEach(playerId => {
      const bubble = chatBubbles.get(playerId);
      if (bubble && bubble.object) {
        if (bubble.object.parent) {
          bubble.object.parent.remove(bubble.object);
        }
        scene.remove(bubble.object);
      }
      chatBubbles.delete(playerId);
    });
  };

  // Setup chat listeners
  const setupChatListeners = async () => {
    const socket = await getSocket();
    if (!socket) return null;

    // Chat message handler
    const handleChatMessage = (message: { 
      name: string; 
      text: string; 
      playerId: string; 
      timestamp: number;
    }) => {
      // If this is our own message, add a chat bubble above our player
      if (message.playerId === socket.id && playerRef.current) {
        createChatBubble(message.playerId, message.text, playerRef.current);
      } 
      // If it's another player's message, find their mesh and add a bubble
      else if (message.playerId && playersRef.current && playersRef.current.has(message.playerId)) {
        const playerMesh = playersRef.current.get(message.playerId);
        if (playerMesh) {
          createChatBubble(message.playerId, message.text, playerMesh);
        }
      }
    };

    socket.on('chatMessage', handleChatMessage);

    // Return cleanup function
    return () => {
      socket.off('chatMessage', handleChatMessage);
    };
  };

  // Initialize the chat listener (but don't wait for the Promise to resolve)
  setupChatListeners().then(cleanup => {
    cleanupListener = cleanup;
  });

  // Return the public API and cleanup function
  return { 
    updateChatBubbles,
    cleanup: () => {
      // Call the socket cleanup function if it exists
      if (cleanupListener) {
        cleanupListener();
      }
      
      // Clean up all chat bubbles
      chatBubbles.forEach((bubble) => {
        if (bubble.object && bubble.object.parent) {
          bubble.object.parent.remove(bubble.object);
        }
      });
      chatBubbles.clear();
    }
  };
};

export default createChatBubbleManager; 