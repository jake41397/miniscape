import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { WorldItem, ResourceNode, ResourceType } from '../../game/world/resources';
import { getSocket } from '../../game/network/socket';

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
      // Check if clicking on the menu itself (prevent closing when clicking on a menu item)
      const target = e.target as HTMLElement;
      if (!target.closest('.world-context-menu')) {
        onClose();
      }
    };

    document.addEventListener('click', handleOutsideClick);
    return () => document.removeEventListener('click', handleOutsideClick);
  }, [onClose]);

  // Create menu items based on nearby items and resources
  useEffect(() => {
    if (!playerPosition) {
      setMenuItems([]);
      return;
    }

    const items: { label: string; action: () => void; disabled: boolean }[] = [];

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
        }
      });
    }

    setMenuItems(items);
  }, [nearbyItems, nearbyResources, playerPosition, onPickupItem, onInteractWithResource]);

  if (!position || menuItems.length === 0) {
    return null;
  }

  // Determine menu title based on what's being displayed
  let menuTitle = 'Items';
  if (nearbyItems.length === 0 && nearbyResources.length > 0) {
    menuTitle = 'Resources';
  } else if (nearbyItems.length > 0 && nearbyResources.length > 0) {
    menuTitle = 'Interact';
  }

  return (
    <div 
      className="world-context-menu"
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`
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
            onClick={() => {
              console.log(`Menu item clicked: ${item.label}, disabled: ${item.disabled}`);
              if (!item.disabled) {
                console.log(`Calling action for item: ${item.label}`);
                item.action();
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