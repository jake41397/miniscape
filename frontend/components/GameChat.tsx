import React, { useRef } from 'react';
import * as THREE from 'three';
import Chat, { ChatRefHandle } from './chat/Chat';

interface GameChatProps {
  sceneRef: React.RefObject<THREE.Scene | null>;
  playerRef: React.RefObject<THREE.Mesh | null>;
  playersRef: React.RefObject<Map<string, THREE.Mesh>>;
}

const GameChat: React.FC<GameChatProps> = ({ sceneRef, playerRef, playersRef }) => {
  // Create a ref for the Chat component with the proper type
  const chatRef = useRef<ChatRefHandle>(null);

  // Function to update chat bubbles - can be called from parent if needed
  const updateChatBubbles = () => {
    if (chatRef.current) {
      chatRef.current.updateChatBubbles();
    }
  };

  return (
    <Chat
      ref={chatRef}
      scene={sceneRef.current}
      playerRef={playerRef}
      playersRef={playersRef}
    />
  );
};

export default GameChat;

// Export the ChatRefHandle type for convenience
export type { ChatRefHandle }; 