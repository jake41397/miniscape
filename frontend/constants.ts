// Player movement speed
export const MOVEMENT_SPEED = 5; // Reduced from 0.0375 (nearly 50% reduction again)
// Define a constant speed factor to prevent accumulation
export const FIXED_SPEED_FACTOR = 0.15; // Reduced from 0.0375
// Network settings
export const SEND_INTERVAL = 20; // Reduced from 30ms to 20ms for more frequent updates
// Position interpolation settings
export const INTERPOLATION_SPEED = 0.4; // Increased from 0.3 for faster position syncing

// Add position prediction settings
export const POSITION_HISTORY_LENGTH = 5; // How many positions to keep for prediction
export const ENABLE_POSITION_PREDICTION = true; // Whether to use prediction for remote players
// Add a snap threshold for large position discrepancies
export const POSITION_SNAP_THRESHOLD = 5.0; // If discrepancy is larger than this, snap instantly

// Jumping and Gravity
export const JUMP_FORCE = 0.3;
export const GRAVITY = 0.015;
export const JUMP_COOLDOWN = 500; // milliseconds

// Camera settings
export const CAMERA_ZOOM_SPEED = 0.5;
export const CAMERA_MIN_DISTANCE = 3;
export const CAMERA_MAX_DISTANCE = 20;
export const CAMERA_ROTATION_SPEED = 0.005;
export const CAMERA_TILT_SPEED = 0.003;
export const CAMERA_MIN_TILT = 0.1;
export const CAMERA_MAX_TILT = 0.9;

// Debug configuration
export const DEBUG = {
  showPositionMarkers: false,   // Disable markers for now to fix errors
  showVelocityVectors: false,   // Show velocity prediction vectors
  logNetworkStats: false        // Log network stats periodically
};

// Add type definition for player move data
export interface PlayerMoveData {
  id: string;
  x: number;
  y: number;
  z: number;
  timestamp?: number; // Make timestamp optional
}

// Player constants
export const PLAYER_DEFAULT_Y = 1;

// Interaction
export const GATHERING_COOLDOWN = 2000; // milliseconds 