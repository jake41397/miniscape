// Sound Manager to handle audio effects in the game

// Sound effects map
const soundEffects: { [key: string]: HTMLAudioElement } = {};

// Sound categories
export enum SoundCategory {
  MUSIC = 'music',
  ENVIRONMENT = 'environment',
  UI = 'ui',
  PLAYER = 'player',
  RESOURCE = 'resource',
}

// Volume levels per category
const volumeLevels: { [key in SoundCategory]: number } = {
  [SoundCategory.MUSIC]: 0.3,
  [SoundCategory.ENVIRONMENT]: 0.5,
  [SoundCategory.UI]: 0.8,
  [SoundCategory.PLAYER]: 0.7,
  [SoundCategory.RESOURCE]: 0.6,
};

// Master volume
let masterVolume = 1.0;

// Sound enabled flag
let soundEnabled = true;

// Sound effect definitions
interface SoundEffect {
  url: string;
  category: SoundCategory;
  volume?: number; // Optional override for category volume
  loop?: boolean;
}

// Sound effect definitions
const soundEffectDefinitions: { [key: string]: SoundEffect } = {
  // UI sounds
  'ui_click': {
    url: '/sounds/ui/click.mp3',
    category: SoundCategory.UI,
  },
  'ui_hover': {
    url: '/sounds/ui/hover.mp3',
    category: SoundCategory.UI,
    volume: 0.3,
  },
  
  // Resource gathering
  'chop_tree': {
    url: '/sounds/resources/chop.mp3',
    category: SoundCategory.RESOURCE,
  },
  'mining_hit': {
    url: '/sounds/resources/mine.mp3',
    category: SoundCategory.RESOURCE,
  },
  'fishing_splash': {
    url: '/sounds/resources/splash.mp3',
    category: SoundCategory.RESOURCE,
  },
  'fishing_catch': {
    url: '/sounds/resources/catch.mp3',
    category: SoundCategory.RESOURCE,
  },
  'fishing_start': {
    url: '/sounds/resources/fishing_start.mp3',
    category: SoundCategory.RESOURCE,
  },
  'fishing_stop': {
    url: '/sounds/resources/fishing_stop.mp3',
    category: SoundCategory.RESOURCE,
  },
  
  // Player sounds
  'player_hit': {
    url: '/sounds/player/hit.mp3',
    category: SoundCategory.PLAYER,
  },
  'player_death': {
    url: '/sounds/player/death.mp3',
    category: SoundCategory.PLAYER,
  },
  'level_up': {
    url: '/sounds/player/levelup.mp3',
    category: SoundCategory.PLAYER,
    volume: 0.9,
  },
  // Add definitions for required sounds
  'playerJoin': {
    url: '/sounds/player/join.mp3',
    category: SoundCategory.PLAYER,
    volume: 0.7,
  },
  'itemDrop': {
    url: '/sounds/items/drop.mp3',
    category: SoundCategory.PLAYER,
    volume: 0.6,
  },
  
  // Environment
  'ambient_forest': {
    url: '/sounds/environment/forest.mp3',
    category: SoundCategory.ENVIRONMENT,
    loop: true,
  },
  'ambient_water': {
    url: '/sounds/environment/water.mp3',
    category: SoundCategory.ENVIRONMENT,
    loop: true,
  },
  
  // Music
  'music_lumbridge': {
    url: '/sounds/music/lumbridge.mp3',
    category: SoundCategory.MUSIC,
    loop: true,
  },
  'music_wilderness': {
    url: '/sounds/music/wilderness.mp3',
    category: SoundCategory.MUSIC,
    loop: true,
  },
};

// Initialize the sound manager
const initialize = (): void => {
  // Pre-load all sound effects
  Object.entries(soundEffectDefinitions).forEach(([key, def]) => {
    try {
      const audio = new Audio(def.url);
      audio.preload = 'auto';
      audio.volume = calculateVolume(def);
      audio.loop = def.loop || false;
      soundEffects[key] = audio;
      
      // Load the audio file
      audio.load();
    } catch (error) {
      console.error(`Failed to load sound effect: ${key}`, error);
    }
  });
};

// Calculate the actual volume for a sound effect
const calculateVolume = (effect: SoundEffect): number => {
  const categoryVolume = volumeLevels[effect.category];
  const effectVolume = effect.volume !== undefined ? effect.volume : 1.0;
  return effectVolume * categoryVolume * masterVolume * (soundEnabled ? 1 : 0);
};

// Update all sound volumes
const updateAllVolumes = (): void => {
  Object.entries(soundEffects).forEach(([key, audio]) => {
    const def = soundEffectDefinitions[key];
    if (def) {
      audio.volume = calculateVolume(def);
    }
  });
};

// Play a sound effect
const play = (key: string): HTMLAudioElement | undefined => {
  if (!soundEnabled || true) return undefined; // Disable sound effects during development
  
  const audio = soundEffects[key];
  if (!audio) {
    console.warn(`Sound effect not found: ${key}`);
    return undefined;
  }
  
  try {
    // If the audio is already playing, create a new instance
    if (!audio.paused) {
      const newAudio = new Audio(audio.src);
      newAudio.volume = audio.volume;
      newAudio.play().catch(error => {
        console.warn(`Failed to play sound effect: ${key}`, error);
      });
      return newAudio;
    }
    
    // Otherwise, reuse the existing audio element
    audio.currentTime = 0;
    audio.play().catch(error => {
      console.warn(`Failed to play sound effect: ${key}`, error);
    });
    return audio;
  } catch (error) {
    console.error(`Error playing sound effect: ${key}`, error);
    return undefined;
  }
};

// Stop a sound effect
const stop = (key: string): void => {
  const audio = soundEffects[key];
  if (audio) {
    audio.pause();
    audio.currentTime = 0;
  }
};

// Set the master volume
const setMasterVolume = (volume: number): void => {
  masterVolume = Math.max(0, Math.min(1, volume));
  updateAllVolumes();
};

// Set the volume for a category
const setCategoryVolume = (category: SoundCategory, volume: number): void => {
  volumeLevels[category] = Math.max(0, Math.min(1, volume));
  updateAllVolumes();
};

// Enable or disable sound
const setEnabled = (enabled: boolean): void => {
  soundEnabled = enabled;
  updateAllVolumes();
  
  // Pause all looping sounds if disabled
  if (!enabled) {
    Object.entries(soundEffectDefinitions).forEach(([key, def]) => {
      if (def.loop) {
        stop(key);
      }
    });
  }
};

// Get the current sound enabled state
const isEnabled = (): boolean => {
  return soundEnabled;
};

// Export the sound manager API
const soundManager = {
  initialize,
  play,
  stop,
  setMasterVolume,
  setCategoryVolume,
  setEnabled,
  isEnabled
};

// Initialize on load
if (typeof window !== 'undefined') {
  initialize();
} 

export default soundManager; 