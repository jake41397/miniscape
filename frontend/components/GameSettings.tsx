import React, { useState, useEffect, useRef } from 'react';
import { getSocket } from '../game/network/socket';

interface GameSettingsProps {
  playerName: string;
  setPlayerName: (name: string) => void;
  soundEnabled: boolean;
  setSoundEnabled: (enabled: boolean) => void;
  isHorizontalInverted: boolean;
  setIsHorizontalInverted: (inverted: boolean) => void;
  isHorizontalInvertedRef: React.MutableRefObject<boolean>;
}

const GameSettings: React.FC<GameSettingsProps> = ({
  playerName,
  setPlayerName,
  soundEnabled,
  setSoundEnabled,
  isHorizontalInverted,
  setIsHorizontalInverted,
  isHorizontalInvertedRef
}) => {
  // Remove isSettingsOpen state as it will be controlled by TabMenu
  const [displayName, setDisplayName] = useState('');

  // Initialize display name
  useEffect(() => {
    if (playerName) {
      setDisplayName(playerName);
    }
  }, [playerName]);

  // Handle display name change
  const handleDisplayNameChange = async () => {
    if (!displayName.trim()) return;
    
    const socket = await getSocket();
    if (socket) {
      socket.emit('updateDisplayName', { name: displayName.trim() });
      setPlayerName(displayName.trim());
    }
  };

  return (
    <div className="settings-panel">
      <div className="settings-header">Game Settings</div>
      
      <div className="setting-group">
        <label htmlFor="displayName">
          Display Name
        </label>
        <div className="current-name">
          Current name: <span>{playerName}</span>
        </div>
        <div className="input-group">
          <input
            id="displayName"
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder="Enter display name"
          />
          <button onClick={handleDisplayNameChange}>
            Save
          </button>
        </div>
      </div>
      
      <div className="setting-row">
        <label htmlFor="invertHorizontal">
          Invert Camera Horizontal
        </label>
        <input
          id="invertHorizontal"
          type="checkbox"
          checked={isHorizontalInverted}
          onChange={() => {
            const newValue = !isHorizontalInverted;
            setIsHorizontalInverted(newValue);
          }}
        />
      </div>
      
      <div className="setting-row">
        <label htmlFor="soundToggle">
          Sound Effects
        </label>
        <input
          id="soundToggle"
          type="checkbox"
          checked={soundEnabled}
          onChange={() => setSoundEnabled(!soundEnabled)}
        />
      </div>

      <style jsx>{`
        .settings-panel {
          color: white;
          padding: 15px;
          width: 280px;
          font-family: sans-serif;
        }
        
        .settings-header {
          font-weight: bold;
          margin-bottom: 15px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          padding-bottom: 8px;
          font-size: 18px;
        }
        
        .setting-group {
          margin-bottom: 20px;
        }
        
        .setting-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 10px;
          padding: 5px 0;
        }
        
        label {
          display: block;
          margin-bottom: 5px;
          cursor: pointer;
        }
        
        .current-name {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 8px;
          background-color: rgba(255, 255, 255, 0.1);
          padding: 4px 8px;
          border-radius: 4px;
        }
        
        .current-name span {
          font-weight: bold;
        }
        
        .input-group {
          display: flex;
          gap: 5px;
        }
        
        input[type="text"] {
          flex: 1;
          padding: 5px;
          background-color: rgba(255, 255, 255, 0.1);
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 3px;
          color: white;
        }
        
        input[type="checkbox"] {
          cursor: pointer;
        }
        
        button {
          padding: 5px 10px;
          background-color: #4c6b9a;
          color: white;
          border: none;
          border-radius: 3px;
          cursor: pointer;
        }
        
        button:hover {
          background-color: #5f83bb;
        }
      `}</style>
    </div>
  );
};

export default GameSettings; 