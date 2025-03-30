import React, { useState, useEffect } from 'react';
import * as THREE from 'three';

interface PlayerContextMenuProps {
  position: { x: number, y: number }; // Screen coordinates
  targetPlayer: {
    id: string;
    name: string;
    position: THREE.Vector3;
  };
  onClose: () => void;
  onFollow: (playerId: string) => void;
  onTrade: (playerId: string) => void;
  onMessage: (playerId: string) => void;
  onReport: (playerId: string) => void;
}

const PlayerContextMenu: React.FC<PlayerContextMenuProps> = ({
  position,
  targetPlayer,
  onClose,
  onFollow,
  onTrade,
  onMessage,
  onReport
}) => {
  const [isVisible, setIsVisible] = useState(false);
  
  useEffect(() => {
    // Animation effect - fade in
    setIsVisible(true);
    
    // Close menu when clicking outside
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.player-context-menu')) {
        onClose();
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);
  
  const handleAction = (action: (playerId: string) => void) => {
    action(targetPlayer.id);
    onClose();
  };
  
  return (
    <div 
      className={`player-context-menu ${isVisible ? 'visible' : ''}`}
      style={{
        left: position.x,
        top: position.y
      }}
    >
      <div className="menu-header">
        <span className="player-name">{targetPlayer.name}</span>
      </div>
      
      <div className="menu-options">
        <button onClick={() => handleAction(onFollow)}>
          <span className="icon">👣</span> Follow
        </button>
        
        <button onClick={() => handleAction(onTrade)}>
          <span className="icon">💰</span> Trade
        </button>
        
        <button onClick={() => handleAction(onMessage)}>
          <span className="icon">💬</span> Message
        </button>
        
        <div className="divider"></div>
        
        <button onClick={() => handleAction(onReport)} className="report-button">
          <span className="icon">⚠️</span> Report
        </button>
      </div>
      
      <style jsx>{`
        .player-context-menu {
          position: absolute;
          background-color: rgba(20, 20, 20, 0.95);
          border: 1px solid #FFD700;
          border-radius: 4px;
          width: 150px;
          box-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
          z-index: 1000;
          opacity: 0;
          transform: translateY(10px);
          transition: opacity 0.2s, transform 0.2s;
        }
        
        .player-context-menu.visible {
          opacity: 1;
          transform: translateY(0);
        }
        
        .menu-header {
          padding: 8px 12px;
          background-color: rgba(40, 40, 40, 0.95);
          border-bottom: 1px solid #444;
          color: #FFD700;
          font-weight: bold;
          text-align: center;
          border-top-left-radius: 4px;
          border-top-right-radius: 4px;
        }
        
        .player-name {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        
        .menu-options {
          padding: 5px 0;
        }
        
        .menu-options button {
          display: flex;
          align-items: center;
          width: 100%;
          padding: 6px 12px;
          background: none;
          border: none;
          color: white;
          text-align: left;
          cursor: pointer;
          transition: background-color 0.1s;
          font-size: 14px;
        }
        
        .menu-options button:hover {
          background-color: rgba(255, 255, 255, 0.1);
        }
        
        .icon {
          margin-right: 8px;
          font-size: 16px;
        }
        
        .divider {
          height: 1px;
          background-color: #444;
          margin: 5px 0;
        }
        
        .report-button {
          color: #f44336;
        }
      `}</style>
    </div>
  );
};

export default PlayerContextMenu; 