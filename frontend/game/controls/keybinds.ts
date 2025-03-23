// Define types for our keybinding system
export interface Keybind {
  primary: string;
  secondary: string;
  description: string;
}

export type KeybindAction = 
  | 'moveForward' 
  | 'moveBackward' 
  | 'moveLeft' 
  | 'moveRight'
  | 'jump';

// Default keybinds configuration
export const DEFAULT_KEYBINDS: Record<KeybindAction, Keybind> = {
  moveForward: { primary: 'w', secondary: 'ArrowUp', description: 'Move Forward' },
  moveBackward: { primary: 's', secondary: 'ArrowDown', description: 'Move Backward' },
  moveLeft: { primary: 'a', secondary: 'ArrowLeft', description: 'Move Left' },
  moveRight: { primary: 'd', secondary: 'ArrowRight', description: 'Move Right' },
  jump: { primary: ' ', secondary: '', description: 'Jump' }
};

// Helper to get key display name (for UI)
export const getKeyDisplayName = (key: string): string => {
  switch (key) {
    case ' ': return 'Space';
    case 'ArrowUp': return '↑';
    case 'ArrowDown': return '↓';
    case 'ArrowLeft': return '←';
    case 'ArrowRight': return '→';
    case 'Control': return 'Ctrl';
    case '': return 'None';
    default: return key;
  }
};

// Helper to check if a key matches an action's keybinds
export const matchesKeybind = (
  action: KeybindAction, 
  key: string, 
  keybinds: Record<KeybindAction, Keybind>
): boolean => {
  const bind = keybinds[action];
  return key === bind.primary || key === bind.secondary;
};

// Helper to find conflicting keybinds
export const findKeybindConflicts = (
  keybinds: Record<KeybindAction, Keybind>,
  newKey: string,
  currentAction: KeybindAction
): KeybindAction[] => {
  const conflicts: KeybindAction[] = [];
  
  // Skip empty keys
  if (!newKey) return conflicts;
  
  // Check all actions for the same key
  Object.entries(keybinds).forEach(([action, bind]) => {
    if (action !== currentAction) {
      if (bind.primary === newKey || bind.secondary === newKey) {
        conflicts.push(action as KeybindAction);
      }
    }
  });
  
  return conflicts;
};

// Get all unique keys used in keybinds
export const getAllKeybindKeys = (keybinds: Record<KeybindAction, Keybind>): string[] => {
  return Object.values(keybinds)
    .flatMap(bind => [bind.primary, bind.secondary])
    .filter(Boolean);
}; 