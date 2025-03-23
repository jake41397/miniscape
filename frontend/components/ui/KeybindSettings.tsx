import React, { useState, useCallback, useEffect, useRef } from 'react';
import { 
  Keybind, 
  KeybindAction, 
  DEFAULT_KEYBINDS,
  getKeyDisplayName,
  findKeybindConflicts
} from '../../game/controls/keybinds';

interface KeybindSettingsProps {
  keybinds: Record<KeybindAction, Keybind>;
  onKeybindsChange: (newKeybinds: Record<KeybindAction, Keybind>) => void;
  onClose: () => void;
}

const KeybindSettings: React.FC<KeybindSettingsProps> = ({ 
  keybinds, 
  onKeybindsChange,
  onClose
}) => {
  const [editingKeybind, setEditingKeybind] = useState<{action: KeybindAction, isPrimary: boolean} | null>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [conflicts, setConflicts] = useState<KeybindAction[]>([]);
  const [saveMessage, setSaveMessage] = useState<string>('');

  // Focus the overlay whenever it appears
  useEffect(() => {
    if (editingKeybind && overlayRef.current) {
      overlayRef.current.focus();
    }
  }, [editingKeybind]);

  // Function to start editing a keybind
  const startEditingKeybind = useCallback((action: KeybindAction, isPrimary: boolean) => {
    setEditingKeybind({ action, isPrimary });
    setConflicts([]);
  }, []);

  // Function to handle key press when editing
  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (!editingKeybind) return;
    
    event.preventDefault();
    event.stopPropagation();
    
    // Don't allow Escape as a keybind key
    if (event.key !== 'Escape') {
      // Check for key conflicts
      const newKey = event.key;
      const isSecondary = !editingKeybind.isPrimary;
      
      // Don't allow the same key for primary and secondary of the same action
      if (isSecondary && keybinds[editingKeybind.action].primary === newKey) {
        alert("Primary and secondary keys cannot be the same");
        return;
      }
      
      // Check for conflicts with other keybinds
      const conflictingActions = findKeybindConflicts(keybinds, newKey, editingKeybind.action);
      
      if (conflictingActions.length > 0) {
        setConflicts(conflictingActions);
        // Show conflict warning but still allow setting the key
        const conflictWarning = conflictingActions.map(action => 
          `${keybinds[action].description} (${getKeyDisplayName(keybinds[action].primary)})`
        ).join(', ');
        
        const confirmChange = window.confirm(
          `This key is already used by: ${conflictWarning}\n\nDo you want to use it anyway?`
        );
        
        if (!confirmChange) {
          return;
        }
      }
      
      // Update the keybind
      onKeybindsChange({
        ...keybinds,
        [editingKeybind.action]: {
          ...keybinds[editingKeybind.action],
          [editingKeybind.isPrimary ? 'primary' : 'secondary']: newKey
        }
      });
      
      // Show saved message
      setSaveMessage('Keybind updated');
      setTimeout(() => setSaveMessage(''), 2000);
      
      setConflicts([]);
    }
    
    // Exit keybind edit mode
    setEditingKeybind(null);
  }, [editingKeybind, keybinds, onKeybindsChange]);

  // Function to clear a secondary keybind
  const clearSecondaryKeybind = useCallback((action: KeybindAction) => {
    onKeybindsChange({
      ...keybinds,
      [action]: {
        ...keybinds[action],
        secondary: ''
      }
    });
    
    // Show saved message
    setSaveMessage('Secondary keybind cleared');
    setTimeout(() => setSaveMessage(''), 2000);
  }, [keybinds, onKeybindsChange]);

  // Function to reset keybinds to default
  const resetKeybindsToDefault = useCallback(() => {
    onKeybindsChange(DEFAULT_KEYBINDS);
    
    // Show saved message
    setSaveMessage('Keybinds reset to defaults');
    setTimeout(() => setSaveMessage(''), 2000);
  }, [onKeybindsChange]);

  return (
    <div style={{ 
      marginTop: '10px', 
      maxHeight: '200px', 
      overflowY: 'auto',
      border: '1px solid #555',
      borderRadius: '3px',
      padding: '5px'
    }}>
      {saveMessage && (
        <div style={{
          backgroundColor: 'rgba(0, 128, 0, 0.2)',
          color: '#00c853',
          padding: '5px',
          borderRadius: '3px',
          marginBottom: '10px',
          textAlign: 'center',
          fontSize: '12px'
        }}>
          {saveMessage}
        </div>
      )}
      
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left', fontSize: '12px', padding: '3px', borderBottom: '1px solid #555' }}>Action</th>
            <th style={{ textAlign: 'center', fontSize: '12px', padding: '3px', borderBottom: '1px solid #555' }}>Primary</th>
            <th style={{ textAlign: 'center', fontSize: '12px', padding: '3px', borderBottom: '1px solid #555' }}>Secondary</th>
            <th style={{ width: '40px', borderBottom: '1px solid #555' }}></th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(keybinds).map(([action, bind]) => (
            <tr key={action} style={{ borderBottom: '1px solid #333' }}>
              <td style={{ padding: '5px 3px', fontSize: '12px' }}>{bind.description}</td>
              <td style={{ padding: '5px 3px', textAlign: 'center' }}>
                <button
                  onClick={() => startEditingKeybind(action as KeybindAction, true)}
                  style={{
                    background: editingKeybind?.action === action && editingKeybind?.isPrimary ? '#007bff' : '#444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    padding: '2px 5px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    minWidth: '40px'
                  }}
                >
                  {editingKeybind?.action === action && editingKeybind?.isPrimary ? 'Press Key' : getKeyDisplayName(bind.primary)}
                </button>
              </td>
              <td style={{ padding: '5px 3px', textAlign: 'center' }}>
                <button
                  onClick={() => startEditingKeybind(action as KeybindAction, false)}
                  style={{
                    background: editingKeybind?.action === action && !editingKeybind?.isPrimary ? '#007bff' : '#444',
                    color: 'white',
                    border: 'none',
                    borderRadius: '3px',
                    padding: '2px 5px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    minWidth: '40px'
                  }}
                >
                  {editingKeybind?.action === action && !editingKeybind?.isPrimary ? 'Press Key' : getKeyDisplayName(bind.secondary)}
                </button>
              </td>
              <td style={{ padding: '5px 3px', textAlign: 'center' }}>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      
      <div style={{ marginTop: '10px', textAlign: 'center' }}>
        <button
          onClick={resetKeybindsToDefault}
          style={{
            backgroundColor: '#d9534f',
            color: 'white',
            border: 'none',
            borderRadius: '3px',
            padding: '3px 8px',
            cursor: 'pointer',
            fontSize: '12px',
            marginRight: '8px'
          }}
        >
          Reset to Default
        </button>
        <button
          onClick={onClose}
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
      
      {/* Overlay that captures keypress when editing a keybind */}
      {editingKeybind && (
        <div
          ref={overlayRef}
          onKeyDown={handleKeyDown}
          tabIndex={0}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            outline: 'none' // Remove focus outline
          }}
        >
          <div style={{
            backgroundColor: '#222',
            padding: '20px',
            borderRadius: '5px',
            textAlign: 'center',
            color: 'white',
            maxWidth: '400px'
          }}>
            <div style={{ fontWeight: 'bold', marginBottom: '10px' }}>
              Press any key to set {keybinds[editingKeybind.action].description} {editingKeybind.isPrimary ? 'primary' : 'secondary'} key
            </div>
            <div style={{ marginBottom: '10px' }}>
              Current: {editingKeybind.isPrimary 
                ? getKeyDisplayName(keybinds[editingKeybind.action].primary)
                : getKeyDisplayName(keybinds[editingKeybind.action].secondary)}
            </div>
            {conflicts.length > 0 && (
              <div style={{ marginBottom: '10px', color: '#ff6b6b', fontSize: '12px' }}>
                Warning: This key conflicts with:
                <ul style={{ textAlign: 'left', marginTop: '5px' }}>
                  {conflicts.map(action => (
                    <li key={action}>
                      {keybinds[action].description} ({getKeyDisplayName(keybinds[action].primary)})
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {!editingKeybind.isPrimary && (
              <div style={{ marginBottom: '10px', fontSize: '12px', color: '#aaa' }}>
                You can also clear this secondary binding with the clear button
              </div>
            )}
            <button
              onClick={() => setEditingKeybind(null)}
              style={{
                backgroundColor: '#555',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                padding: '5px 10px',
                cursor: 'pointer',
                marginRight: !editingKeybind.isPrimary ? '10px' : '0'
              }}
            >
              Cancel (Esc)
            </button>
            {!editingKeybind.isPrimary && (
              <button
                onClick={() => {
                  clearSecondaryKeybind(editingKeybind.action);
                  setEditingKeybind(null);
                }}
                style={{
                  backgroundColor: '#d9534f',
                  color: 'white',
                  border: 'none',
                  borderRadius: '3px',
                  padding: '5px 10px',
                  cursor: 'pointer'
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default KeybindSettings; 