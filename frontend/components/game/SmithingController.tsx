import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useGame } from '../../contexts/GameContext';
import { getSocket } from '../../game/network/socket';
import SmithingPanel from '../ui/SmithingPanel';
import { SmithingMode, SmithingSystem } from '../../game/systems/SmithingSystem';

interface SmithingControllerProps {
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
}

const SmithingController: React.FC<SmithingControllerProps> = ({
  playerRef
}) => {
  const { gameState } = useGame();
  const [visible, setVisible] = useState<boolean>(false);
  const [mode, setMode] = useState<SmithingMode>(SmithingMode.SMELTING);
  const [progress, setProgress] = useState<number>(0);
  const [isSmithing, setIsSmithing] = useState<boolean>(false);
  const smithingSystemRef = useRef<SmithingSystem | null>(null);

  // Initialize the smithing system
  useEffect(() => {
    smithingSystemRef.current = new SmithingSystem(playerRef);
  }, [playerRef]);

  // Set up event listeners for smithing actions
  useEffect(() => {
    const handleOpenSmithing = (e: CustomEvent) => {
      setVisible(true);
      if (e.detail && e.detail.mode) {
        setMode(e.detail.mode);
      }
    };

    // Listen for the event to open the smithing interface
    document.addEventListener('open-smithing' as any, handleOpenSmithing);
    
    return () => {
      document.removeEventListener('open-smithing' as any, handleOpenSmithing);
    };
  }, []);

  // Set up socket handlers for smithing progress and completion
  useEffect(() => {
    const setupSocketHandlers = async () => {
      const socket = await getSocket();
      if (!socket) return;

      // Use 'on' with a type assertion for custom events
      socket.on('smithingProgress' as any, (data: { progress: number }) => {
        setProgress(data.progress);
      });

      socket.on('smithingComplete' as any, (data: { mode: SmithingMode }) => {
        setProgress(0);
        setIsSmithing(false);
      });
    };

    setupSocketHandlers();
    
    return () => {
      getSocket().then(socket => {
        if (socket) {
          socket.off('smithingProgress' as any);
          socket.off('smithingComplete' as any);
        }
      });
    };
  }, []);

  const handleClosePanel = () => {
    setVisible(false);
    if (isSmithing) {
      // Cancel the current smithing action
      if (smithingSystemRef.current) {
        smithingSystemRef.current.cancelSmithing();
      }
      setIsSmithing(false);
      setProgress(0);
    }
  };

  const handleChangeMode = (newMode: SmithingMode) => {
    setMode(newMode);
  };

  const handleSmelt = (barType: string) => {
    if (smithingSystemRef.current) {
      smithingSystemRef.current.startSmelting(
        barType,
        gameState.player?.inventory || [],
        gameState.player?.skills || {}
      );
      setIsSmithing(true);
    }
  };

  const handleSmith = (itemType: string) => {
    if (smithingSystemRef.current) {
      smithingSystemRef.current.startSmithing(
        itemType,
        gameState.player?.inventory || [],
        gameState.player?.skills || {}
      );
      setIsSmithing(true);
    }
  };

  return (
    <SmithingPanel
      visible={visible}
      onClose={handleClosePanel}
      mode={mode}
      onChangeMode={handleChangeMode}
      onSmelt={handleSmelt}
      onSmith={handleSmith}
      progress={progress}
      isSmithing={isSmithing}
    />
  );
};

export default SmithingController; 