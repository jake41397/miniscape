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
    console.log(`%c 🔨 Setting up SmithingSystem`, "color: #3f51b5;");
    if (!smithingSystemRef.current) {
      smithingSystemRef.current = new SmithingSystem(playerRef);
      console.log(`%c 🔨 SmithingSystem created`, "color: #3f51b5;");
    }
    
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
      
      // Check if there's a selected recipe from the dialog system
      if ((window as any).selectedSmithingRecipe) {
        console.log('SmithingController: Found selected recipe from dialog:', (window as any).selectedSmithingRecipe);
        
        // Automatically trigger smelting for the selected recipe
        setTimeout(() => {
          try {
            const selectedRecipe = (window as any).selectedSmithingRecipe;
            console.log('SmithingController: Auto-smelting selected recipe:', selectedRecipe);
            
            if (mode === 'smelting') {
              handleSmelt(selectedRecipe);
            } else {
              handleSmith(selectedRecipe);
            }
            
            // Clear the selected recipe
            delete (window as any).selectedSmithingRecipe;
          } catch (err) {
            console.error('SmithingController: Error auto-smelting recipe:', err);
          }
        }, 500); // Small delay to ensure panel is fully rendered
      }
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
    console.log(`%c 🔨 Setting up open-smithing event listener`, "color: #3f51b5;");
    
    const handleOpenSmithing = (event: any) => {
      console.log(`%c 🔨 Received open-smithing event`, "background: #3f51b5; color: white; font-size: 14px;", event.detail);
      
      // If player isn't connected, don't show the panel
      if (!socketConnected) {
        console.error('SmithingController: Socket not connected, cannot open smithing panel');
        return;
      }
      
      // Set panel visibility first to ensure it's visible
      console.log(`%c 🔨 Setting panel visible=true`, "background: #3f51b5; color: white; font-size: 14px;");
      setVisible(true);
      
      // Stop event propagation to prevent other handlers from being triggered
      if (event.stopPropagation) {
        event.stopPropagation();
      }
      
      // Set mode based on event detail
      if (event.detail && event.detail.mode) {
        setMode(event.detail.mode);
      }
      
      // Store the selected recipe if it's in the event
      if (event.detail && event.detail.recipeKey) {
        console.log(`%c 🔨 Received recipe: ${event.detail.recipeKey}`, "color: #3f51b5;");
        (window as any).selectedSmithingRecipe = event.detail.recipeKey;
        
        // Auto-trigger smelting after a short delay
        setTimeout(() => {
          try {
            if (event.detail.mode === 'smelting' || event.detail.mode === SmithingMode.SMELTING) {
              console.log(`%c 🔨 Auto-triggering handleSmelt with: ${event.detail.recipeKey}`, "background: #3f51b5; color: white; font-size: 14px;");
              handleSmelt(event.detail.recipeKey);
            } else {
              console.log('SmithingController: Auto-triggering handleSmith with:', event.detail.recipeKey);
              handleSmith(event.detail.recipeKey);
            }
          } catch (err) {
            console.error('SmithingController: Error auto-triggering smithing function:', err);
          }
        }, 500); // Increased delay to ensure panel is fully rendered
      }
      
      // Play UI sound
      //soundManager.play('ui_click');
    };
    
    // Add event listener
    document.addEventListener('open-smithing', handleOpenSmithing);
    
    // Check if window has the global recipe
    if ((window as any).selectedSmithingRecipe) {
      console.log(`%c 🔨 Found window.selectedSmithingRecipe = ${(window as any).selectedSmithingRecipe}`, "background: #3f51b5; color: white; font-size: 14px;");
    } else {
      console.log(`%c 🔨 No window.selectedSmithingRecipe found`, "color: #3f51b5;");
    }
    
    return () => {
      document.removeEventListener('open-smithing', handleOpenSmithing);
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

      // Remove any existing listeners first to prevent duplicates
      socket.off('smithingProgress' as any, handleProgress);
      socket.off('smithingComplete' as any, handleSmithingComplete);
      socket.off('inventoryUpdate' as any, handleInventoryUpdate);
      socket.off('smithingError' as any, handleSmithingError);

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
    console.log(`%c 🔨 handleSmelt called with: ${barType}`, "background: #3f51b5; color: white; font-size: 14px;");
    
    if (!socketConnected) {
      console.error('SmithingController: Socket not connected, cannot start smelting');
      
      // Show error notification
      const notificationEvent = new CustomEvent('show-notification', {
        detail: { 
          message: 'Cannot connect to server. Please try again later.',
          type: 'error'
        },
        bubbles: true
      });
      document.dispatchEvent(notificationEvent);
      return;
    }
    
    console.log(`%c 🔨 Starting to smelt ${barType}, socket connected: ${socketConnected}`, "color: #3f51b5;");
    console.log(`%c 🔨 Player inventory:`, "color: #3f51b5;", gameState.player?.inventory);
    console.log(`%c 🔨 Player skills:`, "color: #3f51b5;", gameState.player?.skills);
    
    setIsProcessing(true);
    
    // Try to use the smithing system
    try {
      // Use the smithing system
      if (smithingSystemRef.current) {
        console.log(`%c 🔨 Calling smithingSystemRef.current.startSmelting(${barType})`, "background: #3f51b5; color: white; font-size: 14px;");
        
        smithingSystemRef.current.startSmelting(
          barType,
          gameState.player?.inventory || [],
          gameState.player?.skills || {}
        );
      } else {
        console.error('SmithingController: smithingSystemRef.current is null');
      }
      
      // Sound effect for smelting
      soundManager.play('mining_hit'); // Reusing mining sound for now
    } catch (error) {
      console.error('SmithingController: Error starting smelting:', error);
      setIsProcessing(false);
      
      // Show error notification
      const notificationEvent = new CustomEvent('show-notification', {
        detail: { 
          message: 'Error starting smelting process. Please try again.',
          type: 'error'
        },
        bubbles: true
      });
      document.dispatchEvent(notificationEvent);
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

  // Add a notification when the panel is made visible or invisible
  useEffect(() => {
    console.log(`%c 🔨 SmithingPanel visibility changed to: ${visible}`, "background: purple; color: white; font-size: 20px;");
    
    if (visible) {
      const notificationEvent = new CustomEvent('show-notification', {
        detail: { 
          message: `Smithing panel opened in ${mode} mode`,
          type: 'info'
        },
        bubbles: true
      });
      document.dispatchEvent(notificationEvent);
    }
  }, [visible, mode]);

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