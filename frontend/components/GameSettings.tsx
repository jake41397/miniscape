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
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
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
    <>
      {/* Settings button */}
      <button
        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          padding: '5px 10px',
          cursor: 'pointer',
          fontSize: '12px',
          zIndex: 100
        }}
      >
        ⚙️ Settings
      </button>
      
      {/* Settings panel */}
      {isSettingsOpen && (
        <div style={{
          position: 'absolute',
          top: '45px',
          right: '10px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          border: '1px solid #333',
          borderRadius: '5px',
          padding: '10px',
          width: '250px',
          zIndex: 101,
          fontFamily: 'sans-serif',
          fontSize: '14px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '10px', borderBottom: '1px solid #555', paddingBottom: '5px' }}>
            Game Settings
          </div>
          
          <div style={{ marginBottom: '15px' }}>
            <label htmlFor="displayName" style={{ display: 'block', marginBottom: '5px' }}>
              Display Name
            </label>
            <div style={{ 
              marginBottom: '8px', 
              fontSize: '12px', 
              color: 'rgba(255, 255, 255, 0.6)',
              padding: '4px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '3px'
            }}>
              Current name: <span style={{ fontWeight: 'bold' }}>{playerName}</span>
            </div>
            <div style={{ display: 'flex', gap: '5px' }}>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                style={{
                  flex: 1,
                  padding: '5px',
                  backgroundColor: 'rgba(255, 255, 255, 0.1)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '3px',
                  color: 'white'
                }}
                placeholder="Enter display name"
              />
              <button
                onClick={handleDisplayNameChange}
                style={{
                  padding: '5px 10px',
                  backgroundColor: '#4CAF50',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  cursor: 'pointer'
                }}
              >
                Save
              </button>
            </div>
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label htmlFor="invertHorizontal" style={{ cursor: 'pointer' }}>
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
              style={{ cursor: 'pointer' }}
            />
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label htmlFor="soundToggle" style={{ cursor: 'pointer' }}>
              Sound Effects
            </label>
            <input
              id="soundToggle"
              type="checkbox"
              checked={soundEnabled}
              onChange={() => setSoundEnabled(!soundEnabled)}
              style={{ cursor: 'pointer' }}
            />
          </div>
          
          <div style={{ marginTop: '15px', textAlign: 'right' }}>
            <button
              onClick={() => setIsSettingsOpen(false)}
              style={{
                backgroundColor: '#555',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                padding: '3px 8px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </>
  );
};

export default GameSettings; 