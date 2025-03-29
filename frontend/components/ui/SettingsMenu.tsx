import { FC } from 'react';
import { UIController } from '../game/UIController';

interface SettingsMenuProps {
  isOpen: boolean;
  displayName: string;
  soundEnabled: boolean;
  isHorizontalInverted: boolean;
  setDisplayName: (name: string) => void;
  handleDisplayNameChange: () => void;
  uiController: UIController | null;
}

const SettingsMenu: FC<SettingsMenuProps> = ({
  isOpen,
  displayName,
  soundEnabled,
  isHorizontalInverted,
  setDisplayName,
  handleDisplayNameChange,
  uiController
}) => {
  if (!isOpen) return null;

  return (
    <div className="settings-panel">
      <h3>Settings</h3>
      <div>
        <label>
          Display Name:
          <div className="current-name">
            Current name: <span>{displayName}</span>
          </div>
          <input 
            type="text" 
            value={displayName} 
            onChange={(e) => setDisplayName(e.target.value)} 
          />
          <button onClick={handleDisplayNameChange}>Update</button>
        </label>
      </div>
      <div>
        <label>
          <input 
            type="checkbox" 
            checked={soundEnabled} 
            onChange={() => uiController?.toggleSound()} 
          />
          Sound Effects
        </label>
      </div>
      <div>
        <label>
          <input 
            type="checkbox" 
            checked={isHorizontalInverted} 
            onChange={() => uiController?.toggleCameraInversion()} 
          />
          Invert Horizontal Camera
        </label>
      </div>
      <button onClick={() => uiController?.toggleSettings()}>Close</button>

      <style jsx>{`
        .settings-panel {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          background-color: rgba(0, 0, 0, 0.8);
          color: white;
          padding: 20px;
          border-radius: 8px;
          width: 300px;
          z-index: 1000;
          box-shadow: 0 0 20px rgba(0, 0, 0, 0.5);
        }
        
        h3 {
          margin-top: 0;
          margin-bottom: 20px;
          text-align: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.2);
          padding-bottom: 10px;
        }
        
        label {
          display: flex;
          align-items: center;
          margin-bottom: 15px;
        }
        
        .current-name {
          font-size: 12px;
          color: rgba(255, 255, 255, 0.7);
          margin-bottom: 5px;
          background-color: rgba(255, 255, 255, 0.1);
          padding: 4px 8px;
          border-radius: 4px;
          margin-top: 4px;
        }
        
        .current-name span {
          font-weight: bold;
        }
        
        input[type="text"] {
          margin-left: 10px;
          padding: 5px;
          background-color: rgba(255, 255, 255, 0.9);
          border: none;
          border-radius: 4px;
          flex: 1;
        }
        
        input[type="checkbox"] {
          margin-right: 10px;
        }
        
        button {
          background-color: #4c6b9a;
          color: white;
          border: none;
          border-radius: 4px;
          padding: 8px 16px;
          cursor: pointer;
          margin-left: 10px;
        }
        
        button:hover {
          background-color: #5f83bb;
        }
        
        button:last-child {
          display: block;
          width: 100%;
          margin-top: 20px;
          margin-left: 0;
        }
      `}</style>
    </div>
  );
};

export default SettingsMenu; 