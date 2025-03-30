import { useState, useEffect, CSSProperties, useRef, useImperativeHandle, forwardRef } from 'react';
import { getSocket } from '../../game/network/socket';
import { Item, ItemType } from '../../types/player';
import ItemManager from '../../game/world/ItemManager';

interface InventoryPanelProps {
  onDropItem?: (item: Item) => void;
  style?: CSSProperties;
  itemManager?: ItemManager;
}

// Define ref handle interface
export interface InventoryPanelHandle {
  dropSelectedItem: () => Promise<boolean>;
  getSelectedItem: () => Item | null;
}

interface ContextMenu {
  x: number;
  y: number;
  item: Item;
  actions: Array<{
    label: string;
    handler: () => void;
  }>;
}

// Render item sprites directly as React components
const ItemSprites = {
  [ItemType.LOG]: () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="40" height="40">
      <rect x="10" y="30" width="80" height="40" rx="5" fill="#8B4513" />
      <path d="M20 40 L80 40" stroke="#6A3805" strokeWidth="3" strokeLinecap="round" />
      <path d="M15 50 L85 50" stroke="#6A3805" strokeWidth="2" strokeLinecap="round" />
      <path d="M25 60 L75 60" stroke="#6A3805" strokeWidth="3" strokeLinecap="round" />
      <circle cx="10" cy="50" r="10" fill="#A0522D" />
      <circle cx="90" cy="50" r="10" fill="#A0522D" />
      <circle cx="10" cy="50" r="6" fill="none" stroke="#6A3805" strokeWidth="2" />
      <circle cx="10" cy="50" r="3" fill="none" stroke="#6A3805" strokeWidth="1" />
      <circle cx="90" cy="50" r="6" fill="none" stroke="#6A3805" strokeWidth="2" />
      <circle cx="90" cy="50" r="3" fill="none" stroke="#6A3805" strokeWidth="1" />
    </svg>
  ),
  [ItemType.COAL]: () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="40" height="40">
      <path d="M20,30 C15,40 10,60 30,75 C50,85 80,70 85,55 C90,40 70,25 50,30 C30,35 25,30 20,30 Z" 
            fill="#36454F" />
      <ellipse cx="35" cy="45" rx="6" ry="4" fill="#555" transform="rotate(-15 35 45)" />
      <ellipse cx="60" cy="60" rx="10" ry="5" fill="#555" transform="rotate(20 60 60)" />
      <ellipse cx="40" cy="65" rx="7" ry="4" fill="#555" transform="rotate(-5 40 65)" />
      <ellipse cx="30" cy="40" rx="2" ry="1" fill="#888" transform="rotate(-15 30 40)" />
      <ellipse cx="65" cy="55" rx="3" ry="1.5" fill="#888" transform="rotate(20 65 55)" />
      <ellipse cx="45" cy="60" rx="2" ry="1" fill="#888" transform="rotate(-5 45 60)" />
    </svg>
  ),
  [ItemType.FISH]: () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="40" height="40">
      <path d="M30,50 C40,30 60,30 75,50 C60,70 40,70 30,50 Z" 
            fill="#6495ED" stroke="#4682B4" strokeWidth="2" />
      <path d="M25,50 C15,35 5,50 15,65 C20,55 20,45 25,50 Z" 
            fill="#6495ED" stroke="#4682B4" strokeWidth="2" />
      <path d="M55,35 C60,25 65,30 60,40 Z" 
            fill="#6495ED" stroke="#4682B4" strokeWidth="1" />
      <path d="M55,65 C60,75 65,70 60,60 Z" 
            fill="#6495ED" stroke="#4682B4" strokeWidth="1" />
      <circle cx="70" cy="45" r="5" fill="white" stroke="#4682B4" strokeWidth="1" />
      <circle cx="72" cy="44" r="2" fill="black" />
      <path d="M45,45 Q50,40 55,45" stroke="#4682B4" strokeWidth="1" fill="none" />
      <path d="M45,55 Q50,60 55,55" stroke="#4682B4" strokeWidth="1" fill="none" />
      <path d="M40,40 Q45,35 50,40" stroke="#4682B4" strokeWidth="1" fill="none" />
      <path d="M40,60 Q45,65 50,60" stroke="#4682B4" strokeWidth="1" fill="none" />
    </svg>
  ),
  // Default for unknown items
  default: () => (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="40" height="40">
      <rect x="10" y="10" width="80" height="80" rx="5" fill="#888" />
      <text x="50" y="70" fontSize="70" fontWeight="bold" textAnchor="middle" fill="#333">?</text>
      <rect x="10" y="10" width="80" height="80" rx="5" fill="none" stroke="#555" strokeWidth="3" />
    </svg>
  )
};

const InventoryPanel = forwardRef<InventoryPanelHandle, InventoryPanelProps>(({ onDropItem, style, itemManager }, ref) => {
  const [inventory, setInventory] = useState<Item[]>([]);
  const [selectedItemIndex, setSelectedItemIndex] = useState<number | null>(null);
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  
  // Grid configuration
  const GRID_SIZE = 4; // 4x6 grid (24 slots)
  const GRID_ROWS = 6;

  // Expose methods via ref for external components
  useImperativeHandle(ref, () => ({
    // Drop the currently selected item
    dropSelectedItem: async () => {
      if (selectedItemIndex !== null && inventory[selectedItemIndex]) {
        await handleDropItem(inventory[selectedItemIndex]);
        return true;
      }
      return false;
    },
    // Get the currently selected item
    getSelectedItem: () => {
      if (selectedItemIndex !== null && inventory[selectedItemIndex]) {
        return inventory[selectedItemIndex];
      }
      return null;
    }
  }));
  
  useEffect(() => {
    let socketInstance: any = null;
    
    const setupSocket = async () => {
      socketInstance = await getSocket();
      
      if (socketInstance) {
        // Listen for inventory updates from server
        socketInstance.on('inventoryUpdate', (updatedInventory: Item[]) => {
          setInventory(updatedInventory);
          
          // If the current selected index is out of bounds after update,
          // reset it or adjust it
          if (selectedItemIndex !== null) {
            if (updatedInventory.length === 0) {
              setSelectedItemIndex(null);
            } else if (selectedItemIndex >= updatedInventory.length) {
              setSelectedItemIndex(updatedInventory.length - 1);
            }
          }
        });
      }
    };
    
    setupSocket();
    
    // Cleanup on unmount
    return () => {
      if (socketInstance) {
        socketInstance.off('inventoryUpdate');
      }
    };
  }, [selectedItemIndex]);
  
  // Handle clicks outside of the context menu
  useEffect(() => {
    const handleOutsideClick = () => {
      setContextMenu(null);
    };

    if (contextMenu) {
      document.addEventListener('click', handleOutsideClick);
    }

    return () => {
      document.removeEventListener('click', handleOutsideClick);
    };
  }, [contextMenu]);
  
  // Prevent default browser context menu on the inventory
  useEffect(() => {
    const preventDefaultContextMenu = (e: MouseEvent) => {
      // Only prevent in the inventory area
      const target = e.target as HTMLElement;
      if (target.closest('.inventory-grid')) {
        e.preventDefault();
      }
    };
    
    document.addEventListener('contextmenu', preventDefaultContextMenu);
    
    return () => {
      document.removeEventListener('contextmenu', preventDefaultContextMenu);
    };
  }, []);
  
  const handleDropItem = async (item: Item) => {
    console.log(`%c 🎒 Dropping item: ${item.type}`, "background: #FF5722; color: white; font-size: 14px;");
    
    if (itemManager) {
      console.log(`%c ✅ Using itemManager to drop item: ${item.type}`, "background: #4CAF50; color: white;");
      const success = await itemManager.dropItem(item);
      
      if (success) {
        console.log(`%c ✅ Successfully dropped item using itemManager: ${item.type}`, "background: #4CAF50; color: white;");
        
        // Remove from local inventory immediately for better UX
        setInventory(prevInventory => {
          const newInventory = [...prevInventory];
          const index = newInventory.findIndex(i => i.id === item.id);
          if (index !== -1) {
            if (newInventory[index].count && newInventory[index].count > 1) {
              newInventory[index].count -= 1;
            } else {
              newInventory.splice(index, 1);
            }
          }
          return newInventory;
        });
        
        return true;
      } else {
        console.error(`%c ❌ Failed to drop item using itemManager: ${item.type}`, "background: red; color: white;");
      }
    }
    
    // Rest of the function remains unchanged
    if (onDropItem) {
      console.log(`Using onDropItem callback to drop item: ${item.type}`);
      onDropItem(item);
    } else {
      // If no callback and no itemManager, send directly to server
      console.log(`No itemManager or callback found, sending drop directly to server`);
      const socket = await getSocket();
      if (socket) {
        console.log(`Socket available (${socket.id}), emitting dropItem event`);
        
        // Get player position from data attribute if available
        const positionElement = document.querySelector('[data-player-position]');
        let positionData = {};
        
        if (positionElement && positionElement.getAttribute('data-position')) {
          try {
            positionData = JSON.parse(positionElement.getAttribute('data-position') || '{}');
            console.log('Retrieved player position for drop:', positionData);
          } catch (e) {
            console.error('Failed to parse player position:', e);
          }
        }
        
        // Send in the format that the server expects based on which handler processes it
        (socket as any).emit('dropItem', { 
          itemId: item.id, 
          itemType: item.type,
          ...positionData
        });
        
        // Remove from local inventory immediately for better UX
        setInventory(prevInventory => {
          const newInventory = [...prevInventory];
          const index = newInventory.findIndex(i => i.id === item.id);
          if (index !== -1) {
            if (newInventory[index].count && newInventory[index].count > 1) {
              newInventory[index].count -= 1;
            } else {
              newInventory.splice(index, 1);
            }
          }
          return newInventory;
        });
      } else {
        console.error('Failed to get socket for item drop');
      }
    }
  };

  const handleUseItem = (item: Item) => {
    console.log(`Using item: ${item.type}`);
    // Here you would implement the "use" functionality
    // This could trigger different behaviors based on the item type
  };

  const handleConsumeItem = (item: Item) => {
    console.log(`Consuming item: ${item.type}`);
    // Here you would implement consuming logic (for food, potions, etc.)
    // This would typically send a message to the server
    // For now, we'll just log it
  };

  const handleExamineItem = (item: Item) => {
    console.log(`Examining item: ${item.type}`);
    // Here you could display information about the item
    // This is a common action in RuneScape
  };
  
  // Get sprite component for an item type
  const getItemSprite = (type: ItemType) => {
    const SpriteComponent = ItemSprites[type] || ItemSprites.default;
    return <SpriteComponent />;
  };
  
  const selectItem = (index: number) => {
    setSelectedItemIndex(index === selectedItemIndex ? null : index);
  };

  const handleRightClick = (e: React.MouseEvent, item: Item) => {
    e.preventDefault();
    e.stopPropagation();
    
    // Create context menu actions based on item type
    const actions = [
      { 
        label: 'Drop', 
        handler: () => {
          handleDropItem(item);
          setContextMenu(null);
        }
      },
      { 
        label: 'Use', 
        handler: () => {
          handleUseItem(item);
          setContextMenu(null);
        }
      },
      // Add different actions based on item type
      ...(item.type === ItemType.FISH ? [
        { 
          label: 'Eat', 
          handler: () => {
            handleConsumeItem(item);
            setContextMenu(null);
          }
        }
      ] : []),
      { 
        label: 'Examine', 
        handler: () => {
          handleExamineItem(item);
          setContextMenu(null);
        }
      }
    ];
    
    // Calculate adjusted position to ensure menu doesn't go off-screen
    const menuWidth = 120; // Must match width in CSS
    const menuHeight = (actions.length + 1) * 35; // Approximate height based on items + header
    
    let x = e.clientX;
    let y = e.clientY;
    
    // Check if it would go off the right edge
    if (x + menuWidth > window.innerWidth) {
      x = window.innerWidth - menuWidth - 10;
    }
    
    // Check if it would go off the bottom edge
    if (y + menuHeight > window.innerHeight) {
      y = window.innerHeight - menuHeight - 10;
    }
    
    setContextMenu({
      x,
      y,
      item,
      actions
    });
  };

  // For testing - will be removed when actual inventory is implemented
  const addTestItem = () => {
    const testItems: ItemType[] = [ItemType.LOG, ItemType.COAL, ItemType.FISH];
    const randomType = testItems[Math.floor(Math.random() * testItems.length)];
    
    const newItem: Item = {
      id: `item-${Date.now()}`,
      type: randomType,
      count: 1
    };
    
    setInventory([...inventory, newItem]);
  };

  // Add a test drop function that uses the ItemManager's test function
  const testDrop = async () => {
    if (itemManager) {
      console.log("Running test drop via ItemManager");
      await itemManager.testDrop();
    } else {
      console.error("Cannot test drop - no ItemManager available");
    }
  };
  
  return (
    <div className="inventory-panel" style={style}>
      <div className="inventory-content">
        <h3>Inventory</h3>
        
        {/* Debug buttons area */}
        <div className="debug-buttons">
          {/* Test button - remove in production */}
          <button className="test-button" onClick={addTestItem}>
            Add Test Item
          </button>
          
          {/* Test drop button - remove in production */}
          <button className="test-button" onClick={testDrop}>
            Test Drop
          </button>
        </div>
        
        <div className="hint-text">
          Right-click items for options
        </div>
        
        <div className="inventory-grid">
          {Array.from({ length: GRID_ROWS }).map((_, rowIndex) => (
            <div key={`row-${rowIndex}`} className="inventory-row">
              {Array.from({ length: GRID_SIZE }).map((_, colIndex) => {
                const slotIndex = rowIndex * GRID_SIZE + colIndex;
                const item = slotIndex < inventory.length ? inventory[slotIndex] : null;
                
                return (
                  <div 
                    key={`cell-${rowIndex}-${colIndex}`} 
                    className={`inventory-cell ${selectedItemIndex === slotIndex ? 'selected' : ''}`}
                    onClick={() => item && selectItem(slotIndex)}
                    onContextMenu={(e) => item && handleRightClick(e, item)}
                  >
                    {item && (
                      <div className="item-content">
                        <div className="item-icon">
                          {getItemSprite(item.type)}
                        </div>
                        {item.count > 1 && (
                          <div className="item-count">{item.count}</div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      
      {/* Context Menu */}
      {contextMenu && (
        <div 
          className="context-menu"
          style={{
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="context-menu-header">
            {contextMenu.item.type}
          </div>
          {contextMenu.actions.map((action, index) => (
            <div 
              key={`action-${index}`}
              className="context-menu-item"
              onClick={action.handler}
            >
              {action.label}
            </div>
          ))}
        </div>
      )}
      
      <style jsx>{`
        .inventory-panel {
          width: 100%;
          font-family: sans-serif;
        }
        
        .inventory-content {
          background-color: transparent;
          color: white;
          padding: 15px;
          width: 280px;
        }
        
        .inventory-content h3 {
          margin-top: 0;
          margin-bottom: 12px;
          font-size: 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          padding-bottom: 8px;
        }
        
        .hint-text {
          display: block;
          margin-bottom: 8px;
          font-style: italic;
          font-size: 11px;
          color: #888;
          text-align: center;
        }
        
        .inventory-grid {
          background-color: rgba(30, 30, 30, 0.5);
          border-radius: 4px;
          padding: 6px;
          margin-bottom: 10px;
        }
        
        .inventory-row {
          display: grid;
          grid-template-columns: repeat(4, 1fr);
          gap: 4px;
          margin-bottom: 4px;
        }
        
        .inventory-row:last-child {
          margin-bottom: 0;
        }
        
        .inventory-cell {
          width: 60px;
          height: 60px;
          background-color: rgba(40, 40, 40, 0.5);
          border-radius: 4px;
          position: relative;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .inventory-cell.selected {
          box-shadow: 0 0 0 2px rgba(255, 231, 153, 0.8);
        }
        
        .inventory-cell:hover {
          background-color: rgba(45, 45, 45, 0.8);
        }
        
        .item-content {
          width: 100%;
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        
        .item-icon {
          width: 40px;
          height: 40px;
          display: flex;
          align-items: center;
          justify-content: center;
          position: relative;
        }
        
        .item-count {
          position: absolute;
          bottom: 3px;
          right: 5px;
          font-size: 11px;
          color: white;
          text-shadow: 1px 1px 1px rgba(0, 0, 0, 0.9);
          font-weight: bold;
        }
        
        .context-menu {
          position: fixed;
          background-color: rgba(20, 20, 20, 0.95);
          border-radius: 4px;
          width: 120px;
          z-index: 1000;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
          overflow: hidden;
        }
        
        .context-menu-header {
          font-size: 12px;
          font-weight: bold;
          padding: 8px;
          background-color: rgba(60, 100, 170, 0.95);
          text-transform: capitalize;
          color: white;
          text-align: center;
        }
        
        .context-menu-item {
          padding: 8px 12px;
          font-size: 12px;
          cursor: pointer;
          transition: background-color 0.2s;
          color: rgba(255, 255, 255, 0.9);
        }
        
        .context-menu-item:hover {
          background-color: rgba(100, 120, 150, 0.8);
        }
        
        .debug-buttons {
          display: flex;
          gap: 5px;
          margin-bottom: 10px;
        }
        
        .test-button {
          margin-top: 5px;
          padding: 8px;
          background-color: #4c6b9a;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          flex: 1;
        }
        
        .test-button:hover {
          background-color: #5f83bb;
        }
      `}</style>
    </div>
  );
});

export default InventoryPanel; 