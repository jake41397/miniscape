/**
 * src/game/controllers/PlayerController.ts
 * * Handles local player input, movement calculations, camera control,
 * and applying updates to the player's Three.js mesh.
 */
import * as THREE from 'three';
// Make sure this path is correct for your project structure
import { saveLastKnownPosition } from '../../game/network/socket'; 

// --- Constants ---

// Movement Settings
export const MOVEMENT_SPEED = 0.25; // Adjusted for potentially delta-time independent update
export const JUMP_FORCE = 0.3;
export const GRAVITY = 0.015;
export const JUMP_COOLDOWN = 500; // milliseconds
export const PLAYER_ROTATION_LERP_FACTOR = 0.15; // How quickly the player turns (0-1)
// Auto-Movement Specific Speed
export const AUTO_MOVE_SPEED = 0.25; // Separate speed for point-and-click, adjust as needed

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
  private socketController: any; // Replace 'any' with your actual SocketController type

  // Auto-movement state
  private isAutoMoving: boolean = false;
  private targetPosition: THREE.Vector3 | null = null;
  private autoMovePromiseResolve: (() => void) | null = null;
  private autoMoveFrameId: number | null = null; // Store requestAnimationFrame ID

  // Inside the moveToPosition method, private class-level variable for tracking update time
  private lastUpdateTime: number = 0;

  constructor(
    playerRef: React.MutableRefObject<THREE.Mesh | null>,
    movementState: React.MutableRefObject<PlayerMovementState>,
    keysPressed: React.MutableRefObject<KeyState>,
    cameraState: React.MutableRefObject<CameraState>,
    camera: THREE.Camera,
    lastSentPosition: React.MutableRefObject<{ x: number; y: number; z: number }>,
    movementChanged: React.MutableRefObject<boolean>,
    socketController: any // Replace 'any' with your actual SocketController type
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
   * Interrupts the current automatic movement, if any.
   * Called by new clicks OR manual keyboard movement.
   */
  interruptMovement(): void {
    if (this.isAutoMoving) {
      console.log("%c 🛑 Interrupting automatic movement.", "background: #ff5722; color: white;");
      this.isAutoMoving = false;
      this.targetPosition = null;

      // Cancel the animation frame loop
      if (this.autoMoveFrameId !== null) {
          cancelAnimationFrame(this.autoMoveFrameId);
          this.autoMoveFrameId = null;
      }

      // Resolve the promise associated with the interrupted movement
      if (this.autoMovePromiseResolve) {
          this.autoMovePromiseResolve(); // Indicate completion (or cancellation)
          this.autoMovePromiseResolve = null;
      }
      
      // CRITICAL FIX: Reset movement state to ensure keyboard movement is responsive
      this.movementState.current = {
        ...this.movementState.current,
        moveForward: false,
        moveBackward: false,
        moveLeft: false,
        moveRight: false,
        lastUpdateTime: Date.now() // Reset timestamp to ensure proper delta calculations
      };
      
      // CRITICAL FIX: Use matrix based camera direction analysis
      const player = this.playerRef.current;
      if (player) {
        // Use the improved camera direction extraction method
        const cameraMatrix = new THREE.Matrix4().extractRotation(this.camera.matrixWorld);
        const cameraForward = new THREE.Vector3(0, 0, -1).applyMatrix4(cameraMatrix);
        const cameraRight = new THREE.Vector3(1, 0, 0).applyMatrix4(cameraMatrix);
        
        // Flatten to XZ plane
        cameraForward.y = 0;
        cameraRight.y = 0;
        
        // Normalize
        if (cameraForward.lengthSq() > 0.001) cameraForward.normalize();
        if (cameraRight.lengthSq() > 0.001) cameraRight.normalize();
        
        // Calculate angle for debugging
        const forwardAngleDeg = (Math.atan2(cameraForward.x, cameraForward.z) * 180 / Math.PI) % 360;
        
        // Log exact camera state for debugging movement control issues
        console.log("%c 🧭 Movement Controls Reset - Camera Analysis:", "background: #3F51B5; color: white; font-size: 14px", {
          cameraForward: {
            x: cameraForward.x.toFixed(3),
            z: cameraForward.z.toFixed(3)
          },
          cameraRight: {
            x: cameraRight.x.toFixed(3),
            z: cameraRight.z.toFixed(3)
          },
          forwardAngleDeg: forwardAngleDeg.toFixed(1) + "°",
          cameraStateAngle: this.cameraState.current.angle.toFixed(3),
          time: new Date().toISOString().split('T')[1]
        });
      }
      
      // Reset rotation lerp factor temporarily to make rotation more responsive
      // after interrupting auto-movement
      setTimeout(() => {
        // This helps ensure smooth rotation transition when keyboard controls start
        if (this.playerRef.current) {
          console.log("%c 🔄 Player movement properly reset for keyboard control", "color: #2196F3;");
        }
      }, 50); // Small delay to ensure rendering cycle completes
    }
  }

  /**
   * Move player automatically to a specific target position.
   * Returns a Promise that resolves when the movement completes or is interrupted.
   */
  moveToPosition(target: THREE.Vector3): Promise<void> {
    console.log("%c 🚶 moveToPosition CALLED", "background: #ff00ff; color: white; font-size: 16px;", {
      targetX: target.x.toFixed(2),
      targetZ: target.z.toFixed(2),
      playerExists: !!this.playerRef.current,
      isAutoMoving: this.isAutoMoving,
      socketControllerExists: !!this.socketController
    });
    
    // IMPORTANT: Interrupt any previous auto-movement *before* starting a new one.
    this.interruptMovement();

    return new Promise((resolve) => {
      const player = this.playerRef.current;
      if (!player) {
        console.warn("❌ Player mesh not available for moveToPosition.");
        resolve(); // Cannot move if player doesn't exist
        return;
      }

      this.isAutoMoving = true;
      this.targetPosition = target.clone(); // Store a copy
      this.targetPosition.y = player.position.y; // Maintain current height
      this.autoMovePromiseResolve = resolve; // Store the resolver

      console.log(`✅ Starting auto-move to: (${this.targetPosition.x.toFixed(2)}, ${this.targetPosition.z.toFixed(2)})`);

      // Initialize last frame time for delta calculations
      let lastFrameTime = performance.now();
      
      // --- Movement loop function ---
      const moveStep = () => {
        // Check if movement was interrupted *externally* (by interruptMovement)
        if (!this.isAutoMoving || !this.targetPosition) {
            // The promise resolve is handled within interruptMovement
            return; // Stop the loop
        }

        const currentPlayer = this.playerRef.current; // Re-check player ref in case it changes
        if (!currentPlayer) {
            console.warn("Player mesh became null during auto-move.");
            this.interruptMovement(); // Clean up state
            return;
        }

        // Calculate frame delta for smoother movement
        const now = performance.now();
        const frameDelta = Math.min((now - lastFrameTime) / 1000, 0.1); // Cap at 100ms to prevent jumps
        lastFrameTime = now;
        
        // Calculate speed based on frame time
        const frameSpeed = AUTO_MOVE_SPEED * frameDelta * 60; // Normalize to 60fps equivalent
        
        const currentPosition = currentPlayer.position;
        const distanceToTarget = currentPosition.distanceTo(this.targetPosition);

        // --- Check for arrival ---
        const arrivalThreshold = frameSpeed * 0.5; // Stop slightly before exact point
        if (distanceToTarget < arrivalThreshold) {
            console.log("Auto-move arrived at target.");
            // Snap to final position for precision
            currentPlayer.position.copy(this.targetPosition);

            // Send final precise position
            if (this.socketController) {
              this.socketController.sendPlayerPosition(
                currentPlayer.position,
                currentPlayer.rotation.y,
                true // Indicate final position
              );
            }
            
            // Check for zone changes on arrival
            if (this.socketController && typeof this.socketController.checkAndUpdateZone === 'function') {
              this.socketController.checkAndUpdateZone(
                currentPlayer.position.x, 
                currentPlayer.position.z
              );
            }
            
            saveLastKnownPosition({ // Persist final position
              x: currentPlayer.position.x,
              y: currentPlayer.position.y,
              z: currentPlayer.position.z
            });

            this.isAutoMoving = false; // Mark as finished
            this.targetPosition = null;
            if (this.autoMovePromiseResolve) {
              this.autoMovePromiseResolve(); // Resolve the original promise
              this.autoMovePromiseResolve = null;
            }
            this.autoMoveFrameId = null;
            return; // End the loop
        }

        // --- Calculate movement for this frame ---
        const direction = new THREE.Vector3()
          .subVectors(this.targetPosition, currentPosition)
          .normalize();

        // Rotate player to face the direction of movement
        const targetRotationY = Math.atan2(direction.x, direction.z);
        // Smoothly interpolate rotation using Lerp
        currentPlayer.rotation.y = THREE.MathUtils.lerp(
            currentPlayer.rotation.y,
            targetRotationY,
            PLAYER_ROTATION_LERP_FACTOR // Use the rotation lerp factor
        );

        // Calculate move distance for this frame
        // Use Math.min to avoid overshooting the target
        const moveDistance = Math.min(frameSpeed, distanceToTarget);

        // Apply movement
        currentPlayer.position.addScaledVector(direction, moveDistance);
        
        // Mark that movement has changed
        this.movementChanged.current = true;

        // --- Send position updates periodically ---
        const currentTime = Date.now();
        const timeSinceLastUpdate = currentTime - this.lastUpdateTime;
        const UPDATE_INTERVAL = 100; // milliseconds
        
        if (timeSinceLastUpdate > UPDATE_INTERVAL) {
          if (this.socketController) {
            this.socketController.sendPlayerPosition(
              currentPlayer.position,
              currentPlayer.rotation.y,
              false // Not the final position yet
            );
            
            // Check for zone changes during movement
            if (typeof this.socketController.checkAndUpdateZone === 'function') {
              this.socketController.checkAndUpdateZone(
                currentPlayer.position.x, 
                currentPlayer.position.z
              );
            }
          }
          
          // Update last position and time
          this.lastSentPosition.current = { 
            x: currentPlayer.position.x, 
            y: currentPlayer.position.y, 
            z: currentPlayer.position.z 
          };
          this.lastUpdateTime = currentTime;
        }

        // --- Continue movement in the next frame ---
        this.autoMoveFrameId = requestAnimationFrame(moveStep);
      };

      // Start the movement loop
      this.autoMoveFrameId = requestAnimationFrame(moveStep);
    });
  }

  /**
   * Main update loop for the player controller. Call this in your game loop.
   * Handles keyboard input, gravity, jumping, camera updates, and network sync.
   * CRUCIALLY, handles interrupting auto-movement if manual keys are pressed.
   *
   * @param deltaTime Time elapsed since the last frame (in seconds, ideally)
   * @returns boolean True if movement occurred, false otherwise
   */
  update(deltaTime: number): boolean {
    const player = this.playerRef.current;
    if (!player) return false;

    const state = this.movementState.current;
    const keys = this.keysPressed.current;
    const now = Date.now();
    let didMovementOccur = false;

    // --- Process Keyboard Input ---
    let manualMovementInput = false;
    const moveDirection = new THREE.Vector3(0, 0, 0);
    
    // CRITICAL FIX: Use a completely different approach for determining camera direction
    // Get the camera's local axes (right, up, forward)
    const cameraMatrix = new THREE.Matrix4().extractRotation(this.camera.matrixWorld);
    
    // Extract the world-space right and forward vectors directly from the camera's matrix
    // These give us the EXACT vectors in world space that represent camera directions
    const cameraRight = new THREE.Vector3(1, 0, 0).applyMatrix4(cameraMatrix);
    const cameraForward = new THREE.Vector3(0, 0, -1).applyMatrix4(cameraMatrix);
    
    // Now flatten these vectors to the XZ plane for ground movement
    cameraRight.y = 0;
    cameraForward.y = 0;
    
    // Normalize them to ensure unit length even after flattening
    if (cameraRight.lengthSq() > 0.001) cameraRight.normalize();
    if (cameraForward.lengthSq() > 0.001) cameraForward.normalize();
    
    // Calculate camera angle in degrees for debugging
    const currentCameraAngle = (Math.atan2(cameraForward.x, cameraForward.z) * 180 / Math.PI) % 360;

    // Check for keyboard input - using the camera-derived vectors directly
    if (keys['w'] || keys['ArrowUp']) {
      moveDirection.add(cameraForward);
      manualMovementInput = true;
    }
    if (keys['s'] || keys['ArrowDown']) {
      moveDirection.sub(cameraForward);
      manualMovementInput = true;
    }
    
    // CRITICAL FIX: A/D behavior - explicitly log and never flip
    // Always use cameraRight for left/right movement
    if (keys['a'] || keys['ArrowLeft']) {
      // LEFT = SUBTRACT the camera's right vector (never changes)
      moveDirection.sub(cameraRight);
      console.log("%c 👈 LEFT VECTOR APPLIED", "color: #E91E63;", {
        rightVector: { x: cameraRight.x.toFixed(2), z: cameraRight.z.toFixed(2) },
        resultDir: { 
          x: (-cameraRight.x).toFixed(2), 
          z: (-cameraRight.z).toFixed(2) 
        },
        currentAngle: currentCameraAngle.toFixed(1) + "°"
      });
      manualMovementInput = true;
    }
    if (keys['d'] || keys['ArrowRight']) {
      // RIGHT = ADD the camera's right vector (never changes)
      moveDirection.add(cameraRight);
      console.log("%c 👉 RIGHT VECTOR APPLIED", "color: #2196F3;", {
        rightVector: { x: cameraRight.x.toFixed(2), z: cameraRight.z.toFixed(2) },
        resultDir: { 
          x: cameraRight.x.toFixed(2), 
          z: cameraRight.z.toFixed(2) 
        },
        currentAngle: currentCameraAngle.toFixed(1) + "°"
      });
      manualMovementInput = true;
    }

    // --- INTERRUPT AUTO-MOVEMENT ---
    // If any manual movement key is pressed while auto-moving, stop auto-moving immediately
    if (manualMovementInput && this.isAutoMoving) {
      this.interruptMovement();
      
      // CRITICAL FIX: Force update the deltaTime to prevent speed issues during transition
      state.lastUpdateTime = now - 16; // Assume ~60fps frame time
    }

    // --- Apply Manual Movement (only if not auto-moving) ---
    if (!this.isAutoMoving && moveDirection.lengthSq() > 0) {
      moveDirection.normalize();

      // Calculate target rotation based on movement direction
      const targetRotationY = Math.atan2(moveDirection.x, moveDirection.z);
      player.rotation.y = THREE.MathUtils.lerp(player.rotation.y, targetRotationY, PLAYER_ROTATION_LERP_FACTOR);

      // CRITICAL FIX: Calculate time-based speed factor
      // This ensures consistent movement regardless of frame rate or recent mode switches
      const timeDelta = (now - state.lastUpdateTime) / 1000; // Convert to seconds
      const speedFactor = Math.min(timeDelta * 60, 2.0); // Cap at 2x normal speed to prevent teleporting
      
      // Use fixed movement speed multiplied by time factor for consistent movement
      const frameSpeed = MOVEMENT_SPEED * speedFactor;

      // Apply movement based on calculated frame speed
      player.position.addScaledVector(moveDirection, frameSpeed);
      this.movementChanged.current = true; // Flag that position changed manually
      didMovementOccur = true;
      
      // Check for zone changes if we have a socketController with checkAndUpdateZone
      if (this.socketController && typeof this.socketController.checkAndUpdateZone === 'function') {
        // Check if the player has crossed into a new zone
        this.socketController.checkAndUpdateZone(player.position.x, player.position.z);
      }
    }
    // --- Auto Movement Handling ---
    else if (this.isAutoMoving && this.targetPosition) {
      // Note: Most auto-movement logic is in moveToPosition's frameStep
      // But we still need to mark that movement is occurring
      didMovementOccur = true;
      
      // Check for zone changes here as well for auto-movement
      if (this.socketController && typeof this.socketController.checkAndUpdateZone === 'function') {
        // Check if the player has crossed into a new zone
        this.socketController.checkAndUpdateZone(player.position.x, player.position.z);
      }
    }
    
    // Update lastUpdateTime for next frame
    state.lastUpdateTime = now;

    // --- Handle Jumping and Gravity (Only if not auto-moving) ---
    if (!this.isAutoMoving) {
        if (keys[' '] && !state.isJumping && (now - state.lastJumpTime > JUMP_COOLDOWN)) {
            state.isJumping = true;
            state.jumpVelocity = JUMP_FORCE;
            state.lastJumpTime = now;
            this.movementChanged.current = true; // Position will change due to jump
            didMovementOccur = true;
        }

        // Apply gravity / jump velocity
        if (state.isJumping) {
            player.position.y += state.jumpVelocity;
            state.jumpVelocity -= GRAVITY; // Apply gravity deceleration

            // Check for landing
            if (player.position.y <= PLAYER_GROUND_Y) {
                player.position.y = PLAYER_GROUND_Y; // Snap to ground
                state.isJumping = false;
                state.jumpVelocity = 0;
                this.movementChanged.current = true; // Position settled
                didMovementOccur = true;
            }
        } else {
             // Ensure player stays on ground if not jumping
             if (player.position.y !== PLAYER_GROUND_Y) {
                 player.position.y = PLAYER_GROUND_Y;
                 this.movementChanged.current = true;
                 didMovementOccur = true;
             }
        }
    } else {
        // If auto-moving, ensure player stays at the fixed Y level
        if (player.position.y !== PLAYER_GROUND_Y) {
            player.position.y = PLAYER_GROUND_Y;
            // No need to set movementChanged here, auto-move handles its own updates
            didMovementOccur = true;
        }
    }

    // --- Update Camera Position ---
    this.updateCameraPosition(player.position);

    // --- Send Network Updates ---
    // Send updates if movement changed significantly OR periodically
    const distanceMoved = player.position.distanceTo(this.lastSentPosition.current as any); // Cast needed if type is {x,y,z}
    const sendThreshold = 0.1; // Send update if moved more than this distance

    // Send if position changed significantly OR if it was specifically flagged (e.g., jump start/land)
    // Avoid sending updates during auto-move here, as moveToPosition handles its own sends.
    if (!this.isAutoMoving && (this.movementChanged.current || distanceMoved > sendThreshold)) {
        if (this.socketController) {
            
            this.socketController.sendPlayerPosition(
                player.position,
                player.rotation.y,
                !state.isJumping // Send 'final=true' if on ground after manual move/jump land
            );
        } else {
            console.log("%c ❌ Cannot send position - socketController is null", "background: red; color: white;");
        }
        this.lastSentPosition.current = { x: player.position.x, y: player.position.y, z: player.position.z };
        this.movementChanged.current = false; // Reset flag after sending

        // Optionally save position less frequently on manual move
        // saveLastKnownPosition(this.lastSentPosition.current);
    }
    
    // Return whether any movement occurred this frame
    return didMovementOccur;
  }

  /**
   * Check if movement occurred in the last update.
   * @returns True if movement occurred, false otherwise
   */
  didMovementOccur(): boolean {
    return this.movementChanged.current;
  }

  // Handle camera positioning and orientation
  private updateCameraPosition(playerPosition: THREE.Vector3): void {
    const camState = this.cameraState.current;

    // Calculate camera position based on player, distance, angle, tilt
    const cameraOffset = new THREE.Vector3(
        Math.sin(camState.angle) * camState.distance * Math.cos(camState.tilt * Math.PI),
        Math.sin(camState.tilt * Math.PI) * camState.distance,
        Math.cos(camState.angle) * camState.distance * Math.cos(camState.tilt * Math.PI)
    );

    const cameraPosition = new THREE.Vector3().copy(playerPosition).add(cameraOffset);

    // IMPORTANT: Store previous camera position and orientation for debugging movement issues
    const prevCameraPos = this.camera.position.clone();
    
    // Before updating camera, store previous right vector for consistency check
    const prevCameraMatrix = new THREE.Matrix4().extractRotation(this.camera.matrixWorld);
    const prevRightVector = new THREE.Vector3(1, 0, 0).applyMatrix4(prevCameraMatrix);
    prevRightVector.y = 0;
    if (prevRightVector.lengthSq() > 0.001) prevRightVector.normalize();
    
    // Update camera position
    this.camera.position.copy(cameraPosition);
    
    // Look at the player's head position
    this.camera.lookAt(playerPosition.x, playerPosition.y + 1.0, playerPosition.z);
    
    // After update, get new right vector and check for significant changes
    const newCameraMatrix = new THREE.Matrix4().extractRotation(this.camera.matrixWorld);
    const newRightVector = new THREE.Vector3(1, 0, 0).applyMatrix4(newCameraMatrix);
    newRightVector.y = 0;
    if (newRightVector.lengthSq() > 0.001) newRightVector.normalize();
    
    // Check if right vector direction has flipped significantly (dot product near -1)
    const rightVectorDot = prevRightVector.dot(newRightVector);
    
    // If we detect a significant flip in the right vector (meaning A/D would swap)
    if (rightVectorDot < 0) {
      console.warn("%c ⚠️ RIGHT VECTOR FLIP DETECTED! This could cause A/D keys to swap behavior", 
        "background: red; color: white; font-size: 16px", {
          dotProduct: rightVectorDot.toFixed(3),
          prevRight: { x: prevRightVector.x.toFixed(2), z: prevRightVector.z.toFixed(2) },
          newRight: { x: newRightVector.x.toFixed(2), z: newRightVector.z.toFixed(2) },
          cameraAngle: camState.angle.toFixed(2),
          time: new Date().toISOString().split('T')[1]
      });
    }
    
    // Only call updateProjectionMatrix if it's a perspective or orthographic camera
    if (this.camera instanceof THREE.PerspectiveCamera || this.camera instanceof THREE.OrthographicCamera) {
        this.camera.updateProjectionMatrix();
    }
  }

  // Add methods for handling mouse input for camera controls if they aren't elsewhere
  // handleMouseDown, handleMouseMove, handleMouseUp, handleWheel...
}

export default PlayerController;