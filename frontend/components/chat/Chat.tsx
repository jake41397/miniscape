import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { getSocket } from '../../game/network/socket';
import ChatPanel from '../ui/ChatPanel';
import createChatBubbleManager from './ChatBubbleManager';
import * as THREE from 'three';

interface ChatProps {
  scene: THREE.Scene | null;
  playerRef: React.RefObject<THREE.Mesh | null>;
  playersRef: React.RefObject<Map<string, THREE.Mesh>>;
}

// Define the methods that will be exposed to parent components
export interface ChatRefHandle {
  updateChatBubbles: () => void;
}

const Chat = forwardRef<ChatRefHandle, ChatProps>((props, ref) => {
  const { scene, playerRef, playersRef } = props;
  
  // Ref for the chat bubble manager
  const chatBubbleManagerRef = useRef<{ updateChatBubbles: () => void, cleanup: () => void } | null>(null);

  // Expose methods to parent component
  useImperativeHandle(ref, () => ({
    updateChatBubbles: () => {
      if (chatBubbleManagerRef.current) {
        chatBubbleManagerRef.current.updateChatBubbles();
      }
    }
  }), []);

  // Initialize the chat bubble manager when the scene is ready
  useEffect(() => {
    if (!scene) return;

    // Initialize the chat bubble manager
    chatBubbleManagerRef.current = createChatBubbleManager({
      scene,
      playerRef,
      playersRef,
    });

    // Clean up on unmount
    return () => {
      // Clean up chat bubble manager
      if (chatBubbleManagerRef.current) {
        chatBubbleManagerRef.current.cleanup();
      }
    };
  }, [scene, playerRef, playersRef]);

  return (
    <div>
      <ChatPanel />
    </div>
  );
});

// Add display name for debugging purposes
Chat.displayName = 'Chat';

// Export the component
export default Chat; 