import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { WorldItem, ResourceNode, ResourceType } from '../../game/world/resources';
import { getSocket } from '../../game/network/socket';
import { enterVibesversePortal } from '../../game/world/landmarks';

// Add TypeScript declaration for the global openSmithingPanel function
declare global {
  interface Window {
    openSmithingPanel?: (mode: string) => void;
    rightClickedPortal?: {
      id: string;
      name: string;
      type: string;
      destinationUrl?: string;
    };
  }
}

interface WorldContextMenuProps {
  position: { x: number, y: number } | null;
  playerPosition: THREE.Vector3 | null;
  nearbyItems: WorldItem[];
  nearbyResources?: ResourceNode[];
  onClose: () => void;
  onPickupItem: (itemId: string) => void;
  onInteractWithResource?: (resourceId: string, action: string) => void;
}

const MAX_INTERACTION_DISTANCE = 3; // Maximum distance (in world units) for item interaction

const WorldContextMenu: React.FC<WorldContextMenuProps> = ({
  position,
  playerPosition,
  nearbyItems,
  nearbyResources = [],
  onClose,
  onPickupItem,
  onInteractWithResource
}) => {
  const [menuItems, setMenuItems] = useState<{ label: string; action: () => void; disabled: boolean }[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [menuTitle, setMenuTitle] = useState<string>('Actions');
  
  // Setup error listener
  useEffect(() => {
    const handleError = (error: any) => {
      console.log("Received error from server:", error);
      setErrorMessage(typeof error === 'string' ? error : 'Failed to perform action');
      
      // Auto-close after showing error
      setTimeout(() => {
        onClose();
      }, 2000);
    };
    
    getSocket().then(socket => {
      if (socket) {
        socket.on('error', handleError);
        return () => {
          socket.off('error', handleError);
        };
      }
    });
    
    return () => {
      getSocket().then(socket => {
        if (socket) {
          socket.off('error', handleError);
        }
      });
    };
  }, [onClose]);

  useEffect(() => {
    // Close menu when clicking outside
    const handleOutsideClick = (e: MouseEvent) => {
      // Only handle this event if it hasn't been handled by another component
      if ((e as any).handled) {
        return;
      }
      
      // Check if clicking on the menu itself (prevent closing when clicking on a menu item)
      const target = e.target as HTMLElement;
      if (!target.closest('.world-context-menu')) {
        e.stopPropagation(); // Stop propagation to prevent other handlers being affected
        onClose();
      }
    };

    document.addEventListener('click', handleOutsideClick, true); // Use capture phase
    return () => document.removeEventListener('click', handleOutsideClick, true);
  }, [onClose]);

  // Create menu items based on nearby items and resources
  useEffect(() => {
    if (!playerPosition) {
      setMenuItems([]);
      return;
    }

    const items: { label: string; action: () => void; disabled: boolean }[] = [];
    
    // Check if we have a portal clicked
    const portal = window.rightClickedPortal;
    if (portal) {
      // Set menu title to the portal name
      setMenuTitle(portal.name || 'Portal');
      
      // Add portal-specific actions
      if (portal.type === 'vibeverse') {
        items.push({
          label: `Enter Vibeverse Portal`,
          action: () => {
            console.log(`Entering Vibeverse Portal`);
            enterVibesversePortal();
          },
          disabled: false
        });
      } else if (portal.type === 'return') {
        // Get the destination URL for display
        let destinationName = 'previous game';
        if (portal.destinationUrl) {
          try {
            const url = new URL(portal.destinationUrl);
            destinationName = url.hostname;
          } catch (e) {
            console.error("Error parsing return URL:", e);
          }
        }
        
        items.push({
          label: `Return to ${destinationName}`,
          action: () => {
            console.log(`Returning to ${destinationName}`);
            // Find the landmark manager and call enterReturnPortal
            // This is a bit of a hack but should work
            const landmarkManager = (window as any).worldManager?.getLandmarkManager();
            if (landmarkManager && portal.destinationUrl) {
              landmarkManager.enterReturnPortal(portal.destinationUrl);
            }
          },
          disabled: false
        });
      }
      
      // Reset portal after menu is shown
      setTimeout(() => {
        window.rightClickedPortal = undefined;
      }, 100);
      
      // Set the items and return early
      setMenuItems(items);
      return;
    }

    // Default title if not portal
    setMenuTitle('Actions');

    // Add item pickup options
    nearbyItems.forEach(item => {
      // Calculate distance from player to this item
      const distance = playerPosition.distanceTo(new THREE.Vector3(item.x, item.y, item.z));
      const tooFar = distance > MAX_INTERACTION_DISTANCE;

      items.push({
        label: `Pick up ${item.itemType} ${tooFar ? '(too far)' : ''}`,
        action: () => {
          console.log(`%c 🎯 PICK UP ACTION: ${item.itemType} (${item.dropId})`, "background: purple; color: white; font-size: 16px;");
          onPickupItem(item.dropId);
        },
        disabled: tooFar
      });
    });

    // Add resource interaction options
    if (onInteractWithResource) {
      nearbyResources.forEach(resource => {
        // Calculate distance from player to this resource
        const distance = playerPosition.distanceTo(new THREE.Vector3(resource.x, resource.y, resource.z));
        const tooFar = distance > MAX_INTERACTION_DISTANCE;
        
        // Different options based on resource type
        if (resource.type === ResourceType.TREE) {
          // Get specific tree type from metadata
          const treeType = resource.metadata?.treeType || 'normal_tree';
          // Convert tree type to display name (e.g., oak_tree -> Oak)
          const treeDisplayName = treeType.replace('_tree', '').replace(/_/g, ' ');
          const displayName = treeDisplayName === 'normal' ? 'Tree' : treeDisplayName.charAt(0).toUpperCase() + treeDisplayName.slice(1);
          
          items.push({
            label: `Chop ${displayName} ${tooFar ? '(too far)' : ''}`,
            action: () => {
              console.log(`%c 🪓 CHOP TREE ACTION: ${resource.id} (${treeType})`, "background: green; color: white; font-size: 16px;");
              onInteractWithResource(resource.id, 'chop');
            },
            disabled: tooFar
          });
        } else if (resource.type === ResourceType.ROCK) {
          // Get specific rock type from metadata
          const rockType = resource.metadata?.rockType || 'stone';
          // Convert rock type to display name (e.g., copper_rock -> Copper)
          const rockDisplayName = rockType.replace('_rock', '').replace(/_/g, ' ');
          const displayName = rockDisplayName === 'stone' ? 'Rock' : rockDisplayName.charAt(0).toUpperCase() + rockDisplayName.slice(1);
          
          items.push({
            label: `Mine ${displayName} ${tooFar ? '(too far)' : ''}`,
            action: () => {
              console.log(`%c ⛏️ MINE ROCK ACTION: ${resource.id} (${rockType})`, "background: gray; color: white; font-size: 16px;");
              onInteractWithResource(resource.id, 'mine');
            },
            disabled: tooFar
          });
        } else if (resource.type === ResourceType.FISHING_SPOT || resource.type === 'fish') {
          // Get fishing spot details
          const spotType = resource.metadata?.spotType || 'net';
          const fishTypes = resource.metadata?.fishTypes || ['fish'];
          const primaryFish = fishTypes[0].replace(/_/g, ' ');
          const displayName = primaryFish.charAt(0).toUpperCase() + primaryFish.slice(1);
          
          items.push({
            label: `Fish ${displayName} ${tooFar ? '(too far)' : ''}`,
            action: () => {
              console.log(`%c 🎣 FISH ACTION: ${resource.id} (${spotType}) [type=${resource.type}]`, "background: blue; color: white; font-size: 16px;");
              onInteractWithResource(resource.id, 'fish');
            },
            disabled: tooFar
          });
        } else if (resource.metadata?.isFurnace || resource.id === 'barbarian_furnace') {
          // Handle furnace interaction for smelting
          items.push({
            label: `Smith at Furnace ${tooFar ? '(too far)' : ''}`,
            action: () => {
              console.log(`%c 🔥 FURNACE ACTION: ${resource.id}`, "background: orange; color: white; font-size: 16px;");
              
              // Instead of directly opening the panel, initiate the dialogue interaction
              // which will present options to the player
              onInteractWithResource(resource.id, 'interact');
            },
            disabled: tooFar
          });
        } else if (resource.metadata?.isAnvil || resource.id === 'barbarian_anvil') {
          // Handle anvil interaction for smithing
          items.push({
            label: `Smith at Anvil ${tooFar ? '(too far)' : ''}`,
            action: () => {
              console.log(`%c ⚒️ ANVIL ACTION: ${resource.id}`, "background: #CD853F; color: white; font-size: 16px;");
              
              // Instead of directly opening the panel, initiate the dialogue interaction
              // which will present options to the player
              onInteractWithResource(resource.id, 'interact');
            },
            disabled: tooFar
          });
        }
      });
    }

    setMenuItems(items);
  }, [playerPosition, nearbyItems, nearbyResources, onPickupItem, onInteractWithResource]);

  if (!position || menuItems.length === 0) {
    return null;
  }

  return (
    <div 
      className="world-context-menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`
      }}
      onClick={(e) => {
        // Mark event as handled to prevent other components from processing it
        (e as any).handled = true;
        e.stopPropagation();
      }}
    >
      <div className="menu-header">{menuTitle}</div>
      
      {errorMessage ? (
        <div className="error-message">{errorMessage}</div>
      ) : (
        menuItems.map((item, index) => (
          <div 
            key={`menu-item-${index}`}
            className={`menu-item ${item.disabled ? 'disabled' : ''}`}
            onClick={(e) => {
              e.stopPropagation(); // Stop propagation to prevent other click handlers
              console.log(`Menu item clicked: ${item.label}, disabled: ${item.disabled}`);
              if (!item.disabled) {
                console.log(`Calling action for item: ${item.label}`);
                item.action();
                onClose(); // Close the menu after any action
              }
            }}
          >
            {item.label}
          </div>
        ))
      )}
      
      <style jsx>{`
        .world-context-menu {
          position: fixed;
          background-color: rgba(20, 20, 20, 0.95);
          border-radius: 4px;
          width: 160px;
          z-index: 1000;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
          overflow: hidden;
        }
        
        .menu-header {
          font-size: 12px;
          font-weight: bold;
          padding: 8px;
          background-color: rgba(60, 100, 170, 0.95);
          text-transform: capitalize;
          color: white;
          text-align: center;
        }
        
        .menu-item {
          padding: 8px 12px;
          font-size: 12px;
          cursor: pointer;
          transition: background-color 0.2s;
          color: rgba(255, 255, 255, 0.9);
        }
        
        .menu-item:hover:not(.disabled) {
          background-color: rgba(100, 120, 150, 0.8);
        }
        
        .menu-item.disabled {
          color: rgba(255, 255, 255, 0.4);
          cursor: default;
        }
        
        .error-message {
          padding: 10px;
          color: #ff6b6b;
          font-size: 12px;
          text-align: center;
          border-top: 1px solid rgba(255, 100, 100, 0.3);
        }
      `}</style>
    </div>
  );
};

export default WorldContextMenu; 