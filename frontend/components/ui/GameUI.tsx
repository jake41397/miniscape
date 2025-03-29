import React from 'react';
import styles from '../../../styles/components/GameUI.module.css';
import { SocketController } from '../game/SocketController';
import { UIController } from '../game/UIController';

interface GameUIProps {
  isConnected: boolean;
  currentZone: string;
  uiController: UIController | SocketController | null;
}

const GameUI: React.FC<GameUIProps> = ({ isConnected, currentZone, uiController }) => {
  const handleForceSyncPlayers = () => {
    if (uiController) {
      console.log('Forcing player sync...');
      // Check if we're using SocketController
      if ('forceSyncPlayers' in uiController) {
        uiController.forceSyncPlayers();
      }
    }
  };

  const handleSettingsClick = () => {
    if (uiController) {
      // Check if we're using UIController
      if ('toggleSettings' in uiController) {
        uiController.toggleSettings();
      }
    }
  };

  return (
    <div className={styles.gameUI}>
      <div className={styles.connectionStatus}>
        {isConnected ? (
          <span className={styles.connected}>Connected</span>
        ) : (
          <span className={styles.disconnected}>Disconnected</span>
        )}
      </div>
      
      <div className={styles.zoneName}>
        {currentZone}
      </div>
      
      {/* Debug button */}
      <button 
        className={styles.debugButton} 
        onClick={handleForceSyncPlayers}
        title="Force player sync"
      >
        Sync Players
      </button>

      {/* Settings button */}
      <button 
        className={styles.settingsButton} 
        onClick={handleSettingsClick}
        title="Open settings"
      >
        Settings
      </button>
    </div>
  );
};

export default GameUI; 