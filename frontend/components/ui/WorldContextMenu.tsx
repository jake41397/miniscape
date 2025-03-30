import React, { useEffect, useState } from 'react';
import * as THREE from 'three';
import { WorldItem } from '../../game/world/resources';
import { getSocket } from '../../game/network/socket';

interface WorldContextMenuProps {
  position: { x: number, y: number } | null;
  playerPosition: THREE.Vector3 | null;
  nearbyItems: WorldItem[];
  onClose: () => void;
  onPickupItem: (itemId: string) => void;
}

const MAX_INTERACTION_DISTANCE = 3; // Maximum distance (in world units) for item interaction

const WorldContextMenu: React.FC<WorldContextMenuProps> = ({
  position,
  playerPosition,
  nearbyItems,
  onClose,
  onPickupItem
}) => {
  const [menuItems, setMenuItems] = useState<{ label: string; action: () => void; disabled: boolean }[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // Setup error listener
  useEffect(() => {
    const handleError = (error: any) => {
      console.log("Received error from server:", error);
      setErrorMessage(typeof error === 'string' ? error : 'Failed to pick up item');
      
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

  // Create menu items based on nearby items
  useEffect(() => {
    if (!playerPosition) {
      setMenuItems([]);
      return;
    }

    const items = nearbyItems.map(item => {
      // Calculate distance from player to this item
      const distance = playerPosition.distanceTo(new THREE.Vector3(item.x, item.y, item.z));
      const tooFar = distance > MAX_INTERACTION_DISTANCE;

      return {
        label: `Pick up ${item.itemType} ${tooFar ? '(too far)' : ''}`,
        action: () => {
          console.log(`%c 🎯 PICK UP ACTION: ${item.itemType} (${item.dropId})`, "background: purple; color: white; font-size: 16px;");
          console.log({
            item,
            distance,
            tooFar,
            playerPosition: playerPosition ? `(${playerPosition.x.toFixed(2)}, ${playerPosition.y.toFixed(2)}, ${playerPosition.z.toFixed(2)})` : null,
            itemPosition: `(${item.x.toFixed(2)}, ${item.y.toFixed(2)}, ${item.z.toFixed(2)})`
          });
          onPickupItem(item.dropId);
        },
        disabled: tooFar
      };
    });

    setMenuItems(items);
  }, [nearbyItems, playerPosition, onPickupItem]);

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
    >
      <div className="menu-header">Items</div>
      
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