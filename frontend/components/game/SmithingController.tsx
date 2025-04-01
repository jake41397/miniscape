import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGame } from '../../contexts/GameContext';
import { getSocket } from '../../game/network/socket';
import { SmithingSystem } from '../../game/systems/SmithingSystem';
import soundManager from '../../game/audio/soundManager';

interface SmithingControllerProps {
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  isConnected?: boolean;
}

const SmithingController: React.FC<SmithingControllerProps> = ({
  playerRef,
  isConnected: externalConnectionStatus = true
}) => {
  const { gameState } = useGame();
  const smithingSystemRef = useRef<SmithingSystem | null>(null);

  // Initialize the smithing system
  useEffect(() => {
    if (!smithingSystemRef.current) {
      smithingSystemRef.current = new SmithingSystem(playerRef);
    }
    
    // Add the openSmithingPanel function to the window object to allow global access
    window.openSmithingPanel = (mode: string) => {
      if (!externalConnectionStatus) {
        const chatEvent = new CustomEvent('chat-message', {
          detail: { 
            content: 'Cannot connect to server. Please try again later.',
            type: 'error',
            timestamp: Date.now()
          },
          bubbles: true
        });
        document.dispatchEvent(chatEvent);
        return;
      }

      // Directly trigger smelting for bronze bar
      if (smithingSystemRef.current) {
        smithingSystemRef.current.startSmelting(
          'BRONZE_BAR',
          gameState.player?.inventory || [],
          gameState.player?.skills || {}
        );
      }
    };
    
    return () => {
      delete window.openSmithingPanel;
    };
  }, [playerRef, externalConnectionStatus, gameState]);

  // Component doesn't render anything visible
  return null;
};

// Add the type definition for the global window object
declare global {
  interface Window {
    openSmithingPanel?: (mode: string) => void;
  }
}

export default SmithingController; 