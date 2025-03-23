import { useState, useEffect, CSSProperties } from 'react';
import { getSocket } from '../../game/network/socket';
import { Item, ItemType } from '../../types/player';
import ItemManager from '../../game/world/ItemManager';

interface InventoryPanelProps {
  onDropItem?: (item: Item) => void;
  style?: CSSProperties;
  itemManager?: ItemManager;
}

const InventoryPanel: React.FC<InventoryPanelProps> = ({ onDropItem, style, itemManager }) => {
  const [inventory, setInventory] = useState<Item[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  
  useEffect(() => {
    let socketInstance: any = null;
    
    const setupSocket = async () => {
      socketInstance = await getSocket();
      
      if (socketInstance) {
        // Listen for inventory updates from server
        socketInstance.on('inventoryUpdate', (updatedInventory: Item[]) => {
          setInventory(updatedInventory);
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
  }, []);
  
  const handleDropItem = async (item: Item) => {
    // First check if we have an itemManager that can handle the drop
    if (itemManager) {
      await itemManager.dropItem(item);
      return;
    }
    
    // Fall back to previous behavior if no itemManager
    if (onDropItem) {
      onDropItem(item);
    } else {
      // If no callback and no itemManager, send directly to server
      const socket = await getSocket();
      if (socket) {
        socket.emit('dropItem', { itemId: item.id, itemType: item.type });
      }
    }
  };
  
  // Map item types to visual representation
  const getItemColor = (type: ItemType): string => {
    switch (type) {
      case ItemType.LOG:
        return '#8B4513'; // Brown for logs
      case ItemType.COAL:
        return '#36454F'; // Dark gray for coal
      case ItemType.FISH:
        return '#6495ED'; // Blue for fish
      default:
        return '#CCCCCC'; // Default gray
    }
  };
  
  const toggleInventory = () => {
    setIsOpen(!isOpen);
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
  
  return (
    <div className="inventory-panel" style={style}>
      <div className="inventory-button" onClick={toggleInventory}>
        <span>Inventory ({inventory.length})</span>
      </div>
      
      {isOpen && (
        <div className="inventory-content">
          <h3>Inventory</h3>
          
          {inventory.length === 0 ? (
            <div className="empty-inventory">Your inventory is empty</div>
          ) : (
            <div className="inventory-grid">
              {inventory.map((item) => (
                <div key={item.id} className="inventory-item">
                  <div 
                    className="item-icon" 
                    style={{ backgroundColor: getItemColor(item.type) }}
                  />
                  <div className="item-details">
                    <span className="item-name">{item.type}</span>
                    <span className="item-count">x{item.count}</span>
                  </div>
                  <button 
                    className="drop-button"
                    onClick={() => handleDropItem(item)}
                  >
                    Drop
                  </button>
                </div>
              ))}
            </div>
          )}
          
          {/* Test button - remove in production */}
          <button className="test-button" onClick={addTestItem}>
            Add Test Item
          </button>
        </div>
      )}
      
      <style jsx>{`
        .inventory-panel {
          position: absolute;
          top: 20px;
          right: 20px;
          z-index: 100;
          font-family: sans-serif;
        }
        
        .inventory-button {
          background-color: rgba(0, 0, 0, 0.7);
          color: white;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;
          text-align: center;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
          transition: background-color 0.2s;
        }
        
        .inventory-button:hover {
          background-color: rgba(0, 0, 0, 0.8);
        }
        
        .inventory-content {
          margin-top: 10px;
          background-color: rgba(0, 0, 0, 0.7);
          color: white;
          border-radius: 8px;
          padding: 15px;
          width: 250px;
          box-shadow: 0 0 10px rgba(0, 0, 0, 0.5);
        }
        
        .inventory-content h3 {
          margin-top: 0;
          margin-bottom: 15px;
          font-size: 18px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          padding-bottom: 8px;
        }
        
        .empty-inventory {
          text-align: center;
          padding: 20px 0;
          color: #AAA;
        }
        
        .inventory-grid {
          display: flex;
          flex-direction: column;
          gap: 10px;
          max-height: 250px;
          overflow-y: auto;
        }
        
        .inventory-item {
          display: flex;
          align-items: center;
          padding: 8px;
          background-color: rgba(50, 50, 50, 0.8);
          border-radius: 4px;
        }
        
        .item-icon {
          width: 32px;
          height: 32px;
          border-radius: 4px;
          margin-right: 10px;
        }
        
        .item-details {
          flex: 1;
          display: flex;
          flex-direction: column;
        }
        
        .item-name {
          font-weight: bold;
          text-transform: capitalize;
        }
        
        .item-count {
          font-size: 12px;
          color: #CCC;
        }
        
        .drop-button {
          padding: 4px 8px;
          background-color: #a33;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          font-size: 12px;
        }
        
        .drop-button:hover {
          background-color: #c44;
        }
        
        .test-button {
          margin-top: 15px;
          padding: 8px;
          background-color: #4c6b9a;
          color: white;
          border: none;
          border-radius: 4px;
          cursor: pointer;
          width: 100%;
        }
        
        .test-button:hover {
          background-color: #5f83bb;
        }
      `}</style>
    </div>
  );
};

export default InventoryPanel; 