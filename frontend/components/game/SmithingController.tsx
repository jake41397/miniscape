import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { useGame } from '../../contexts/GameContext';
import { getSocket } from '../../game/network/socket';
import SmithingPanel from '../ui/SmithingPanel';
import { SmithingMode, SmithingSystem } from '../../game/systems/SmithingSystem';
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
  const [visible, setVisible] = useState<boolean>(false);
  const [mode, setMode] = useState<SmithingMode>(SmithingMode.SMELTING);
  const [progress, setProgress] = useState<number>(0);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [socketConnected, setSocketConnected] = useState<boolean>(externalConnectionStatus);
  const smithingSystemRef = useRef<SmithingSystem | null>(null);

  // Use useEffect to update internal connection state when external prop changes
  useEffect(() => {
    setSocketConnected(externalConnectionStatus);
  }, [externalConnectionStatus]);

  // Initialize the smithing system
  useEffect(() => {
    smithingSystemRef.current = new SmithingSystem(playerRef);
    
    // Add the openSmithingPanel function to the window object to allow global access
    window.openSmithingPanel = (mode: string) => {
      console.log('SmithingController: Opening smithing panel with mode:', mode);
      
      if (!socketConnected) {
        console.log('SmithingController: Cannot open panel - disconnected from server');
        return;
      }
      
      // Reset progress
      setProgress(0);
      
      // Set panel to visible
      setVisible(true);
      
      // Set mode based on the parameter
      if (mode === 'smithing') {
        setMode(SmithingMode.SMITHING);
      } else {
        setMode(SmithingMode.SMELTING);
      }
      
      // Play UI sound
      soundManager.play('ui_click');
    };
    
    return () => {
      // Clean up any ongoing smithing operations
      if (isProcessing && smithingSystemRef.current) {
        smithingSystemRef.current.cancelSmelting();
      }
      
      // Remove the global function
      delete window.openSmithingPanel;
    };
  }, [playerRef, isProcessing, socketConnected]);

  // Listen for the open-smithing event
  useEffect(() => {
    const handleOpenSmithingEvent = (e: CustomEvent) => {
      console.log('SmithingController: Received open-smithing event:', e.detail);
      
      // If player isn't connected, don't show the panel
      if (!socketConnected) {
        console.log('SmithingController: Cannot open panel - disconnected from server');
        return;
      }
      
      // Stop event propagation to prevent other handlers from being triggered
      if (e.stopPropagation) {
        e.stopPropagation();
      }
      
      // Reset progress
      setProgress(0);
      
      // Set panel to visible
      setVisible(true);
      
      // Set mode based on event detail
      if (e.detail && e.detail.mode) {
        setMode(e.detail.mode);
      }
    };
    
    // Add event listener
    document.addEventListener('open-smithing' as any, handleOpenSmithingEvent as any);
    
    // Clean up
    return () => {
      document.removeEventListener('open-smithing' as any, handleOpenSmithingEvent as any);
    };
  }, [socketConnected]);

  // Set up socket handlers for smithing progress and completion
  useEffect(() => {
    const setupSocketHandlers = async () => {
      const socket = await getSocket();
      if (!socket) {
        console.log('SmithingController: Socket not available for smithing progress handlers');
        return;
      }

      // Progress handler
      const handleProgress = (data: { progress: number }) => {
        setProgress(data.progress);
      };
      
      // Completion handler for smithing (works for both smelting and smithing)
      const handleSmithingComplete = (data: any = {}) => {
        setProgress(0);
        setIsProcessing(false);
        soundManager.play('mining_hit'); // Reusing mining sound for now
        
        // Display notification about completion
        const completionMessage = data.barsCreated > 1 
          ? `You have created ${data.barsCreated} items.` 
          : 'You have successfully completed the smithing process.';
        
        const notificationEvent = new CustomEvent('show-notification', {
          detail: { 
            message: completionMessage,
            type: 'success'
          },
          bubbles: true
        });
        document.dispatchEvent(notificationEvent);
      };
      
      // Inventory update handler
      const handleInventoryUpdate = (data: { inventory: any[] }) => {
        console.log('Inventory updated:', data.inventory);
        
        // Update global inventory
        if (window.playerInventory) {
          window.playerInventory = data.inventory;
        }
        
        // Dispatch an event that other components can listen for to update inventory UI
        const inventoryUpdateEvent = new CustomEvent('inventory-updated', {
          detail: { inventory: data.inventory },
          bubbles: true
        });
        document.dispatchEvent(inventoryUpdateEvent);
      };
      
      // Error handler
      const handleSmithingError = (data: { message: string }) => {
        setProgress(0);
        setIsProcessing(false);
        
        // Display error notification
        const notificationEvent = new CustomEvent('show-notification', {
          detail: { 
            message: data.message || 'Error during smithing process',
            type: 'error'
          },
          bubbles: true
        });
        document.dispatchEvent(notificationEvent);
      };

      // Register handlers - use only smithingProgress and smithingComplete
      socket.on('smithingProgress' as any, handleProgress);
      socket.on('smithingComplete' as any, handleSmithingComplete);
      socket.on('inventoryUpdate' as any, handleInventoryUpdate);
      socket.on('smithingError' as any, handleSmithingError);
      
      return () => {
        if (socket) {
          socket.off('smithingProgress' as any, handleProgress);
          socket.off('smithingComplete' as any, handleSmithingComplete);
          socket.off('inventoryUpdate' as any, handleInventoryUpdate);
          socket.off('smithingError' as any, handleSmithingError);
        }
      };
    };

    // Only set up socket handlers if the panel is visible
    if (visible) {
      const cleanup = setupSocketHandlers();
      return () => {
        if (cleanup) cleanup.then(fn => fn && fn());
      };
    }
  }, [visible]);

  // Handle closing the panel
  const handleClosePanel = () => {
    if (isProcessing) {
      // Cancel the current smithing action
      if (smithingSystemRef.current) {
        smithingSystemRef.current.cancelSmelting();
      }
      setIsProcessing(false);
      setProgress(0);
    }
    
    // Close the panel
    setVisible(false);
    
    // Play UI sound
    soundManager.play('ui_click');
  };

  // Handle smelting
  const handleSmelt = (barType: string) => {
    if (!smithingSystemRef.current || !socketConnected) return;
    
    try {
      smithingSystemRef.current.startSmelting(
        barType,
        gameState.player?.inventory || [],
        gameState.player?.skills || {}
      );
      setIsProcessing(true);
      // Sound effect for smelting
      soundManager.play('mining_hit'); // Reusing mining sound for now
    } catch (error) {
      console.error('SmithingController: Error starting smelting:', error);
    }
  };
  
  // Handle smithing
  const handleSmith = (itemType: string) => {
    if (!smithingSystemRef.current || !socketConnected) return;
    
    try {
      smithingSystemRef.current.startSmithing(
        itemType,
        gameState.player?.inventory || [],
        gameState.player?.skills || {}
      );
      setIsProcessing(true);
      // Sound effect for smithing
      soundManager.play('mining_hit'); // Reusing mining sound for now
    } catch (error) {
      console.error('SmithingController: Error starting smithing:', error);
    }
  };

  // Only render the panel if visible
  if (!visible) return null;

  return (
    <SmithingPanel
      visible={visible}
      onClose={handleClosePanel}
      mode={mode}
      progress={progress}
      isProcessing={isProcessing}
      onSmelt={handleSmelt}
      onSmith={handleSmith}
    />
  );
};

// Add the type definition for the global window object to include openSmithingPanel
declare global {
  interface Window {
    openSmithingPanel?: (mode: string) => void;
  }
}

export default SmithingController; 