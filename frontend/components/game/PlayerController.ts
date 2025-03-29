/**
 * src/game/controllers/PlayerController.ts
 * * Handles local player input, movement calculations, camera control,
 * and applying updates to the player's Three.js mesh.
 */
import * as THREE from 'three';
// Make sure this path is correct for your project structure
import { cachePlayerPosition } from '../../game/network/socket'; 

// --- Constants ---

// Movement Settings - Using original values from GameCanvas.tsx
export const MOVEMENT_SPEED = 0.02; // Original value from GameCanvas
export const FIXED_SPEED_FACTOR = 0.02; // Original value from GameCanvas
export const JUMP_FORCE = 0.3;
export const GRAVITY = 0.015; // Represents deceleration per frame/update; consider multiplying by delta if it's acceleration
export const JUMP_COOLDOWN = 500; // milliseconds
export const PLAYER_ROTATION_LERP_FACTOR = 0.15; // How quickly the player turns (0-1)

// Camera Settings
export const CAMERA_DEFAULT_DISTANCE = 10;
export const CAMERA_DEFAULT_ANGLE = 0;
export const CAMERA_DEFAULT_TILT = 0.5; // 0.1 (low angle) to 0.9 (high angle)
export const CAMERA_MIN_DISTANCE = 3;
export const CAMERA_MAX_DISTANCE = 20;
export const CAMERA_ZOOM_SPEED = 0.5;
export const CAMERA_ROTATE_SPEED_X = 0.005; // Horizontal sensitivity
export const CAMERA_ROTATE_SPEED_Y = 0.003; // Vertical sensitivity (tilt)
export const CAMERA_TILT_MIN = 0.1; 
export const CAMERA_TILT_MAX = 0.9;
export const PLAYER_GROUND_Y = 1.0; // Assumed Y position when player is on the ground

// --- Interfaces ---

export interface PlayerMovementState {
  moveForward: boolean;
  moveBackward: boolean;
  moveLeft: boolean;
  moveRight: boolean;
  isJumping: boolean;
  jumpVelocity: number;
  lastJumpTime: number;
  lastUpdateTime: number; // Timestamp of the last update frame
}

export interface KeyState {
  [key: string]: boolean; // Tracks which keys are currently pressed
}

export interface CameraState {
  distance: number;
  angle: number; // Horizontal rotation around the player
  tilt: number;  // Vertical angle (0.1 low, 0.9 high)
  isMiddleMouseDown: boolean;
  lastMousePosition: { x: number; y: number };
  isHorizontalInverted: boolean; // Setting for camera rotation direction
}

// --- PlayerController Class ---

export class PlayerController {
  private playerRef: React.MutableRefObject<THREE.Mesh | null>;
  private movementState: React.MutableRefObject<PlayerMovementState>;
  private keysPressed: React.MutableRefObject<KeyState>;
  private cameraState: React.MutableRefObject<CameraState>;
  private camera: THREE.Camera;
  private lastSentPosition: React.MutableRefObject<{ x: number; y: number; z: number }>;
  private movementChanged: React.MutableRefObject<boolean>;
  private socketController: any; // Assuming a socketController is set up

  constructor(
    playerRef: React.MutableRefObject<THREE.Mesh | null>,
    movementState: React.MutableRefObject<PlayerMovementState>,
    keysPressed: React.MutableRefObject<KeyState>,
    cameraState: React.MutableRefObject<CameraState>,
    camera: THREE.Camera,
    lastSentPosition: React.MutableRefObject<{ x: number; y: number; z: number }>,
    movementChanged: React.MutableRefObject<boolean>,
    socketController: any // Assuming a socketController is set up
  ) {
    this.playerRef = playerRef;
    this.movementState = movementState;
    this.keysPressed = keysPressed;
    this.cameraState = cameraState;
    this.camera = camera;
    this.lastSentPosition = lastSentPosition;
    this.movementChanged = movementChanged;
    this.socketController = socketController;

    // Initialize lastUpdateTime if not already set
    if (!this.movementState.current.lastUpdateTime) {
        this.movementState.current.lastUpdateTime = Date.now();
    }
  }

  /**
   * Updates player position and rotation based on input state and delta time.
   * @param delta Time elapsed since the last frame in seconds.
   * @returns boolean Indicating if the player's position or state changed.
   */
  updatePlayerMovement(delta: number): boolean {
    const player = this.playerRef.current;
    if (!player) return false;

    const state = this.movementState.current;
    let didMove = false; // Track if any change occurred this frame

    // --- Calculate Input Vector ---
    // Vector relative to player's desired movement (forward/backward, left/right)
    const inputVector = new THREE.Vector3(0, 0, 0);
    if (state.moveForward)  { inputVector.z += 1; }
    if (state.moveBackward) { inputVector.z -= 1; }
    if (state.moveLeft)     { inputVector.x += 1; }
    if (state.moveRight)    { inputVector.x -= 1; }

    // --- Calculate World Movement Direction ---
    const worldMovementDirection = new THREE.Vector3();
    const isMovingHorizontally = inputVector.x !== 0 || inputVector.z !== 0;

    if (isMovingHorizontally) {
      inputVector.normalize(); // Normalize input vector

      // Get camera's forward direction projected onto the ground plane (XZ)
      const cameraForward = new THREE.Vector3();
      this.camera.getWorldDirection(cameraForward);
      cameraForward.y = 0;
      cameraForward.normalize();

      // Calculate camera's right direction on the ground plane
      const cameraRight = new THREE.Vector3().crossVectors(
        this.camera.up, // Use camera's up vector (typically Vector3(0, 1, 0))
        cameraForward
      ).normalize();

      // Combine camera directions with input vector to get world movement direction
      // Forward/backward component
      if (inputVector.z !== 0) {
        worldMovementDirection.add(cameraForward.clone().multiplyScalar(inputVector.z));
      }
      // Left/right component
      if (inputVector.x !== 0) {
        worldMovementDirection.add(cameraRight.clone().multiplyScalar(inputVector.x));
      }

      // Normalize the final world direction vector
      worldMovementDirection.normalize();

      // --- Apply Position Change ---
      const currentSpeed = FIXED_SPEED_FACTOR; // Speed in units per second
      player.position.x += worldMovementDirection.x * currentSpeed * delta;
      player.position.z += worldMovementDirection.z * currentSpeed * delta;
      
      // --- Apply Player Rotation ---
      // Calculate the target angle based on the world movement direction
      const targetAngle = Math.atan2(worldMovementDirection.x, worldMovementDirection.z);

      // Smoothly interpolate the player's Y rotation towards the target angle
      const rotationDiff = targetAngle - player.rotation.y;
      
      // Normalize the difference to the range [-PI, PI] for shortest rotation path
      let normalizedDiff = (rotationDiff + Math.PI) % (Math.PI * 2) - Math.PI;
      if (normalizedDiff < -Math.PI) {
          normalizedDiff += Math.PI * 2; // Adjust if modulo results in value less than -PI
      }

      // Apply a portion of the difference using Lerp factor
      player.rotation.y += normalizedDiff * PLAYER_ROTATION_LERP_FACTOR;
      
      didMove = true;
      
      // Check for zone changes if we have a socketController with checkAndUpdateZone
      if (this.socketController && typeof this.socketController.checkAndUpdateZone === 'function') {
        // Check if the player has crossed into a new zone
        this.socketController.checkAndUpdateZone(player.position.x, player.position.z);
      }
    } 
    // else: No horizontal input, player maintains current rotation.

    // --- Handle Jumping and Gravity ---
    if (state.isJumping) {
      // Apply jump velocity
      player.position.y += state.jumpVelocity;
      
      // Apply gravity (as simple deceleration per frame - adjust if needed)
      state.jumpVelocity -= GRAVITY; 
      
      // Check for landing
      if (player.position.y <= PLAYER_GROUND_Y) {
        player.position.y = PLAYER_GROUND_Y; // Snap to ground
        state.isJumping = false;
        state.jumpVelocity = 0;
      }
      didMove = true; // Vertical movement counts as change
    }

    // --- Update State and Cache ---
    if (didMove) {
      this.movementChanged.current = true; // Mark change for network/other systems
      
      // Cache position periodically or on significant change if needed
      cachePlayerPosition({
        x: player.position.x,
        y: player.position.y,
        z: player.position.z
      });
    }
    
    // Update last update time for the next frame's delta calculation
    state.lastUpdateTime = Date.now();
    
    // Return whether the player's state changed this frame
    // Note: movementChanged ref might be reset elsewhere (e.g., after network send)
    return this.movementChanged.current; 
  }

  /** Handles key down events for movement and actions. */
  handleKeyDown(e: KeyboardEvent): void {
    // Ignore input if typing in an input field
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
    }

    const key = e.key;
    this.keysPressed.current[key] = true;
    const state = this.movementState.current;

    if (key === 'w' || key === 'ArrowUp')   { state.moveForward = true; }
    if (key === 's' || key === 'ArrowDown') { state.moveBackward = true; }
    if (key === 'a' || key === 'ArrowLeft') { state.moveLeft = true; }
    if (key === 'd' || key === 'ArrowRight'){ state.moveRight = true; }

    // Handle jump action
    if (key === ' ' && !state.isJumping) {
      const now = Date.now();
      if (now - state.lastJumpTime > JUMP_COOLDOWN) {
        state.isJumping = true;
        state.jumpVelocity = JUMP_FORCE;
        state.lastJumpTime = now;
        this.movementChanged.current = true; // Jumping is a change
      }
    }
  }

  /** Handles key up events to stop movement/actions. */
  handleKeyUp(e: KeyboardEvent): void {
     // Ignore input if typing in an input field
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
    }
      
    const key = e.key;
    this.keysPressed.current[key] = false;
    const state = this.movementState.current;

    if (key === 'w' || key === 'ArrowUp')   { state.moveForward = false; }
    if (key === 's' || key === 'ArrowDown') { state.moveBackward = false; }
    if (key === 'a' || key === 'ArrowLeft') { state.moveLeft = false; }
    if (key === 'd' || key === 'ArrowRight'){ state.moveRight = false; }
  }

  /** Updates camera position and orientation to follow the player. */
  updateCamera(): void {
    const player = this.playerRef.current;
    if (!player || !this.camera) return;

    const { distance, angle, tilt } = this.cameraState.current;

    // Calculate camera target position based on player and camera state
    const cameraPosition = new THREE.Vector3();

    // Calculate horizontal position based on angle and distance
    // angle=0 -> camera is behind player (+Z relative to player)
    cameraPosition.x = player.position.x + Math.sin(angle) * distance;
    cameraPosition.z = player.position.z + Math.cos(angle) * distance;

    // Calculate vertical position based on tilt and player height
    // Using formula derived from old code for similar feel: tilt (0.1-0.9) -> height (2.6 - 7.4) above player feet
    cameraPosition.y = player.position.y + (tilt * 6 + 2);

    // Apply calculated position to the camera
    this.camera.position.copy(cameraPosition);

    // Make the camera look at a point slightly above the player's feet
    const lookAtPos = new THREE.Vector3(player.position.x, player.position.y + 1.0, player.position.z);
    this.camera.lookAt(lookAtPos);
  }

  /** Handles mouse move events for camera rotation (usually with middle mouse button). */
  handleMouseMove(e: MouseEvent): void {
    const camState = this.cameraState.current;
    if (!camState.isMiddleMouseDown) return;

    // Calculate change in mouse position
    const deltaX = e.clientX - camState.lastMousePosition.x;
    const deltaY = e.clientY - camState.lastMousePosition.y;

    // Update stored last mouse position
    camState.lastMousePosition.x = e.clientX;
    camState.lastMousePosition.y = e.clientY;

    // Determine rotation direction based on inversion setting
    // invertFactor = 1 for standard (mouse right -> look right / angle increases)
    // invertFactor = -1 for inverted (mouse right -> look left / angle decreases)
    const invertFactor = camState.isHorizontalInverted ? -1 : 1;

    // Update camera angle (horizontal rotation)
    camState.angle -= deltaX * CAMERA_ROTATE_SPEED_X * invertFactor;

    // Update camera tilt (vertical rotation), clamping within limits
    camState.tilt = Math.max(
        CAMERA_TILT_MIN, 
        Math.min(CAMERA_TILT_MAX, camState.tilt - deltaY * CAMERA_ROTATE_SPEED_Y)
    );
  }

  /** Handles mouse down events, primarily for starting camera rotation. */
  handleMouseDown(e: MouseEvent): void {
    // Check for middle mouse button (button ID 1)
    if (e.button === 1) {
      const camState = this.cameraState.current;
      camState.isMiddleMouseDown = true;
      camState.lastMousePosition.x = e.clientX;
      camState.lastMousePosition.y = e.clientY;
      // Prevent default browser behavior for middle-click (like auto-scroll)
      e.preventDefault(); 
    }
  }

  /** Handles mouse up events, primarily for stopping camera rotation. */
  handleMouseUp(e: MouseEvent): void {
    // Check for middle mouse button release
    if (e.button === 1) {
      this.cameraState.current.isMiddleMouseDown = false;
    }
  }

  /** Handles mouse wheel events for zooming the camera in/out. */
  handleMouseWheel(e: WheelEvent): void {
    const camState = this.cameraState.current;
    // Determine zoom direction (positive deltaY usually means scrolling down/away)
    const delta = Math.sign(e.deltaY); // Get -1, 0, or 1
    
    // Adjust distance based on zoom speed and direction, clamping within limits
    camState.distance = Math.max(
        CAMERA_MIN_DISTANCE, 
        Math.min(CAMERA_MAX_DISTANCE, camState.distance + delta * CAMERA_ZOOM_SPEED)
    );
  }
}

export default PlayerController;