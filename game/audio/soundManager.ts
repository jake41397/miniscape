// Sound manager for handling game sound effects
type SoundType = 
  | 'woodcutting'
  | 'mining'
  | 'fishing'
  | 'itemPickup'
  | 'itemDrop'
  | 'playerJoin'
  | 'chatMessage';

class SoundManager {
  private sounds: Map<SoundType, HTMLAudioElement> = new Map();
  private initialized: boolean = false;
  private enabled: boolean = true;

  constructor() {
    // Sound paths - these could be adjusted based on actual file names
    const soundPaths: Record<SoundType, string> = {
      woodcutting: '/sounds/woodcutting.mp3',
      mining: '/sounds/mining.mp3',
      fishing: '/sounds/fishing.mp3',
      itemPickup: '/sounds/item-pickup.mp3',
      itemDrop: '/sounds/item-drop.mp3',
      playerJoin: '/sounds/player-join.mp3',
      chatMessage: '/sounds/chat-message.mp3'
    };

    // Preload all sounds
    Object.entries(soundPaths).forEach(([type, path]) => {
      const audio = new Audio(path);
      audio.preload = 'auto';
      
      // Add to map
      this.sounds.set(type as SoundType, audio);

      // Handle loading errors (for development - will fail if files don't exist)
      audio.addEventListener('error', () => {
        console.warn(`Failed to load sound: ${path}`);
      });
    });

    this.initialized = true;
  }

  // Play a sound effect
  play(type: SoundType, volume: number = 0.5): void {
    if (!this.initialized || !this.enabled) return;

    const sound = this.sounds.get(type);
    if (sound) {
      // Reset to start (in case it's already playing)
      sound.currentTime = 0;
      sound.volume = volume;
      
      // Play the sound
      sound.play().catch(error => {
        console.warn(`Error playing sound ${type}:`, error);
      });
    }
  }

  // Enable or disable all sounds
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  // Check if sounds are enabled
  isEnabled(): boolean {
    return this.enabled;
  }
}

// Create a singleton instance
const soundManager = new SoundManager();
export default soundManager; 