import React, { useState } from 'react';
import ChatPanel from '../ui/ChatPanel';
import InventoryPanel from '../ui/InventoryPanel';

interface GameUIProps {
  isConnected: boolean;
  playerName: string;
  currentZone: string;
  isCleaningUp: boolean;
  isSettingsOpen: boolean;
  soundEnabled: boolean;
  isHorizontalInverted: boolean;
  onToggleSettings: () => void;
  onToggleSound: () => void;
  onToggleHorizontalInvert: () => void;
  onCleanupClick: () => void;
  onReconnect: () => void;
}

const GameUI: React.FC<GameUIProps> = ({
  isConnected,
  playerName,
  currentZone,
  isCleaningUp,
  isSettingsOpen,
  soundEnabled,
  isHorizontalInverted,
  onToggleSettings,
  onToggleSound,
  onToggleHorizontalInvert,
  onCleanupClick,
  onReconnect
}) => {
  // State for developer options
  const [showDevOptions, setShowDevOptions] = useState(false);
  const [forceLocalDev, setForceLocalDev] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('force_local_dev') === 'true';
    }
    return false;
  });
  const [customServerUrl, setCustomServerUrl] = useState(() => {
    if (typeof localStorage !== 'undefined') {
      return localStorage.getItem('manual_backend_url') || 'http://localhost:4000';
    }
    return 'http://localhost:4000';
  });

  // Function to apply server settings
  const applyServerSettings = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('force_local_dev', forceLocalDev.toString());
      
      if (customServerUrl && customServerUrl.trim() !== '') {
        localStorage.setItem('manual_backend_url', customServerUrl);
      } else {
        localStorage.removeItem('manual_backend_url');
      }
      
      // Show notification that settings were applied and require refresh
      alert('Server settings applied. The page will now reload to apply changes.');
      window.location.reload();
    }
  };

  // Force connection with polling only
  const connectWithPollingOnly = () => {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('force_polling_transport', 'true');
      alert('Will attempt to connect using polling transport only. The page will now reload.');
      window.location.reload();
    }
  };

  return (
    <>
      {/* Zone indicator */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '5px 15px',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        color: 'white',
        borderRadius: '20px',
        fontFamily: 'sans-serif',
        fontSize: '14px',
        fontWeight: 'bold',
        zIndex: 100
      }}>
        {currentZone}
      </div>

      {/* Connection status indicator */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        display: 'flex',
        alignItems: 'center',
        padding: '5px 10px',
        backgroundColor: isConnected ? 'rgba(0, 128, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)',
        color: 'white',
        borderRadius: '5px',
        fontFamily: 'sans-serif',
        fontSize: '12px',
        zIndex: 100
      }}>
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: isConnected ? '#0f0' : '#f00',
          marginRight: '5px'
        }}></div>
        {isConnected ? 'Connected' : 'Disconnected'}
      </div>
      
      {/* Settings button */}
      <button
        onClick={onToggleSettings}
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
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label htmlFor="invertHorizontal" style={{ cursor: 'pointer' }}>
              Invert Camera Horizontal
            </label>
            <input
              id="invertHorizontal"
              type="checkbox"
              checked={isHorizontalInverted}
              onChange={onToggleHorizontalInvert}
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
              onChange={onToggleSound}
              style={{ cursor: 'pointer' }}
            />
          </div>
          
          {/* Developer Options Toggle */}
          <div style={{ marginTop: '15px', borderTop: '1px solid #555', paddingTop: '10px' }}>
            <div 
              style={{ 
                display: 'flex', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                cursor: 'pointer',
                marginBottom: '8px'
              }}
              onClick={() => setShowDevOptions(!showDevOptions)}
            >
              <span>🛠️ Developer Options</span>
              <span>{showDevOptions ? '▼' : '►'}</span>
            </div>
            
            {/* Developer Options Panel */}
            {showDevOptions && (
              <div style={{ 
                backgroundColor: 'rgba(50, 50, 50, 0.9)',
                padding: '8px',
                borderRadius: '4px',
                marginBottom: '10px'
              }}>
                <div style={{ fontSize: '12px', color: '#ffcc00', marginBottom: '8px' }}>
                  Warning: These settings are for development only.
                </div>
                
                {/* Force Local Dev Mode */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label htmlFor="forceLocalDev" style={{ cursor: 'pointer', fontSize: '13px' }}>
                    Force Local Development
                  </label>
                  <input
                    id="forceLocalDev"
                    type="checkbox"
                    checked={forceLocalDev}
                    onChange={(e) => setForceLocalDev(e.target.checked)}
                    style={{ cursor: 'pointer' }}
                  />
                </div>
                
                {/* Bypass Authentication (Development Only) */}
                <button
                  onClick={() => {
                    localStorage.setItem('bypass_socket_check', 'true');
                    localStorage.setItem('test_mode_enabled', 'true');
                    alert('Authentication bypass enabled for development. The page will now reload.');
                    window.location.href = '/game';
                  }}
                  style={{
                    backgroundColor: '#6600cc',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    width: '100%',
                    marginBottom: '8px'
                  }}
                >
                  Bypass Authentication
                </button>
                
                {/* Custom Server URL */}
                <div style={{ marginBottom: '8px' }}>
                  <label htmlFor="customServerUrl" style={{ fontSize: '13px', display: 'block', marginBottom: '4px' }}>
                    Custom Server URL:
                  </label>
                  <input
                    id="customServerUrl"
                    type="text"
                    value={customServerUrl}
                    onChange={(e) => setCustomServerUrl(e.target.value)}
                    placeholder="http://localhost:4000"
                    style={{ 
                      width: '100%',
                      padding: '4px',
                      backgroundColor: '#333',
                      color: 'white',
                      border: '1px solid #555',
                      borderRadius: '3px'
                    }}
                  />
                </div>
                
                {/* WebSocket Transport Option */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label htmlFor="useWebSocket" style={{ cursor: 'pointer', fontSize: '13px' }}>
                    Enable WebSocket Transport
                  </label>
                  <input
                    id="useWebSocket"
                    type="checkbox"
                    checked={localStorage.getItem('use_websocket_transport') === 'true'}
                    onChange={(e) => {
                      localStorage.setItem('use_websocket_transport', e.target.checked.toString());
                      // Force component update
                      setForceLocalDev(prev => prev);
                    }}
                    style={{ cursor: 'pointer' }}
                  />
                </div>
                
                {/* Apply Settings Button */}
                <button
                  onClick={applyServerSettings}
                  style={{
                    backgroundColor: '#006699',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    width: '100%',
                    marginTop: '4px'
                  }}
                >
                  Apply Server Settings
                </button>
                
                {/* Reset Connection Settings Button */}
                <button
                  onClick={() => {
                    localStorage.removeItem('socket_disable_auto_reconnect');
                    localStorage.removeItem('socket_disable_until');
                    localStorage.removeItem('socket_total_attempts');
                    localStorage.removeItem('socket_last_attempt_time');
                    localStorage.removeItem('last_socket_connection_id');
                    alert('Connection settings reset. The page will now reload.');
                    window.location.reload();
                  }}
                  style={{
                    backgroundColor: '#996600',
                    color: 'white', 
                    border: 'none',
                    borderRadius: '3px',
                    padding: '4px 8px',
                    cursor: 'pointer',
                    fontSize: '12px',
                    width: '100%',
                    marginTop: '8px'
                  }}
                >
                  Reset Connection Settings
                </button>
              </div>
            )}
          </div>
          
          <div style={{ marginTop: '15px', textAlign: 'right' }}>
            <button
              onClick={onToggleSettings}
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
      
      {/* Reconnect button */}
      {!isConnected && (
        <button
          onClick={onReconnect}
          style={{
            position: 'absolute',
            top: '40px',
            left: '10px',
            backgroundColor: 'rgba(0, 0, 255, 0.5)',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            padding: '5px 10px',
            cursor: 'pointer',
            fontSize: '12px',
            zIndex: 100
          }}
        >
          Reconnect
        </button>
      )}
      
      {/* Ghost cleanup button */}
      <button
        onClick={onCleanupClick}
        disabled={isCleaningUp}
        style={{
          position: 'absolute',
          top: '45px',
          right: '10px',
          backgroundColor: isCleaningUp ? 'rgba(100, 100, 100, 0.5)' : 'rgba(255, 0, 0, 0.6)',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          padding: '5px 10px',
          cursor: isCleaningUp ? 'default' : 'pointer',
          fontSize: '12px',
          zIndex: 100
        }}
      >
        {isCleaningUp ? 'Cleaning...' : '👻 Remove Ghosts'}
      </button>
      
      <ChatPanel />
      <InventoryPanel style={{ top: "100px", right: "20px" }} />
    </>
  );
};

export default GameUI; 