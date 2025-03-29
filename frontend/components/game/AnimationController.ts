// New file AnimationController.ts (Corrected)

import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { PlayerController } from './PlayerController';
import { SocketController } from './SocketController';

interface AnimationControllerOptions {
  scene: THREE.Scene;
  camera: THREE.Camera;
  renderer: THREE.WebGLRenderer;
  labelRenderer: CSS2DRenderer;
  playerController: PlayerController;
  socketController: SocketController;
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  playersRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  clock: THREE.Clock;
}

// Constants (brought back from old code for consistency)
const INTERPOLATION_SPEED = 0.4; // Base interpolation speed
const POSITION_SNAP_THRESHOLD = 5.0; // Snap if distance > this
const ENABLE_POSITION_PREDICTION = true; // Assuming you still want prediction
const CLOSE_SNAP_DISTANCE_SQ = 0.02 * 0.02; // Squared distance for snapping when close
const ROTATION_SPEED = 0.3; // How fast rotation catches up

export class AnimationController {
  private scene: THREE.Scene;
  private camera: THREE.Camera;
  private renderer: THREE.WebGLRenderer;
  private labelRenderer: CSS2DRenderer;
  private playerController: PlayerController;
  private socketController: SocketController;
  private playerRef: React.MutableRefObject<THREE.Mesh | null>;
  private playersRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  private clock: THREE.Clock;
  private frameId: number | null = null;
  private lastPositionUpdateTime = 0;
  private POSITION_UPDATE_INTERVAL = 100; // ms - Corrected to match the original GameCanvas SEND_INTERVAL
  private movementChanged = false;

  constructor(options: AnimationControllerOptions) {
    this.scene = options.scene;
    this.camera = options.camera;
    this.renderer = options.renderer;
    this.labelRenderer = options.labelRenderer;
    this.playerController = options.playerController;
    this.socketController = options.socketController;
    this.playerRef = options.playerRef;
    this.playersRef = options.playersRef;
    this.clock = options.clock;
  }

  public start(): void {
    if (this.frameId === null) {
      this.clock.start();
      this.animate();
    }
  }

  public stop(): void {
    if (this.frameId !== null) {
      cancelAnimationFrame(this.frameId);
      this.frameId = null;
      this.clock.stop();
    }
  }

  private animate = (): void => {
    this.frameId = requestAnimationFrame(this.animate);

    const delta = this.clock.getDelta();
    const now = Date.now();

    // Update local player movement and camera
    this.movementChanged = this.playerController.updatePlayerMovement(delta);
    this.playerController.updateCamera();

    // Send local player position update if needed
    if (this.movementChanged && now - this.lastPositionUpdateTime > this.POSITION_UPDATE_INTERVAL) {
      const player = this.playerRef.current;
      if (player) {
        // Send position *and rotation* with player orientation
        this.socketController.sendPlayerPosition(player.position, player.rotation.y);
        this.lastPositionUpdateTime = now;
        this.movementChanged = false; // Reset movement flag after sending
      }
    }

    // Detailed diagnostic logging (once every ~10 seconds)
    if (Math.random() < 0.002) {
      console.log('🔍 DETAILED DIAGNOSTIC:');
      console.log(`- playersRef Map size: ${this.playersRef.current.size}`);
      console.log(`- playersRef keys:`, Array.from(this.playersRef.current.keys()));
      
      // Count player meshes in scene
      let playerMeshesInScene = 0;
      let playerMeshesWithUserData = 0;
      const playerIdsInScene: string[] = [];
      
      this.scene.traverse(object => {
        if (object.type === 'Mesh') {
          if (object.userData && object.userData.playerId) {
            playerMeshesWithUserData++;
            playerIdsInScene.push(object.userData.playerId);
            
            // Check if this player is tracked
            if (!this.playersRef.current.has(object.userData.playerId)) {
              console.log(`🚨 Found untracked player in scene: ${object.userData.playerId} (${object.userData.playerName || 'unknown'})`);
            }
          }
          playerMeshesInScene++;
        }
      });
      
      console.log(`- Total meshes in scene: ${playerMeshesInScene}`);
      console.log(`- Player meshes with userData: ${playerMeshesWithUserData}`);
      console.log(`- Player IDs in scene: ${playerIdsInScene.join(', ') || 'none'}`);
      
      // Force check reference integrity
      this.socketController.checkAndRepairPlayerReferences();
    }

    // Even if there are no other players, we need to keep the game running
    // Update other player positions and rotations if there are any
    if (this.playersRef.current.size > 0) {
      this.updateOtherPlayers(delta);
    } else {
      // If there are no other players, just log periodically (every ~5 seconds to avoid spam)
      if (Math.random() < 0.01) {
        console.log("No other players to update. This is normal if you're the only player.");
      }
      
      // Periodically ask the server for players (once every ~15 seconds)
      if (Math.random() < 0.001) {
        console.log("🔄 Requesting player data from server...");
        this.socketController.requestPlayersData();
      }
    }
    
    // Update chat bubbles - check for and remove expired bubbles
    if (this.socketController.updateChatBubbles) {
      this.socketController.updateChatBubbles();
    }

    // Render the scene
    this.render();
  };

  private updateOtherPlayers(delta: number): void {
    // Debug logging: How many players are in the map?
    const playerCount = this.playersRef.current.size;
    
    // Only log this information occasionally to reduce spam
    if (Math.random() < 0.02) { // Roughly once every 50 frames
      const socketController = this.socketController;
      
      console.log(`Updating ${playerCount} other players`, {
        playerIds: Array.from(this.playersRef.current.keys()),
        ownSocketId: socketController.getSocketId ? socketController.getSocketId() : 'unknown'
      });
      
      // If no players, log warning about possible issue and run detailed scene inspection
      if (playerCount === 0) {
        console.warn("No other players found in playersRef map. Inspecting scene for orphaned player meshes...");
        
        // Scan the scene for player meshes that might not be in playersRef
        let orphanedPlayerMeshes = 0;
        this.scene.traverse(object => {
          if (object.type === 'Mesh' && object.userData && object.userData.playerId) {
            const playerId = object.userData.playerId;
            if (!this.playersRef.current.has(playerId)) {
              console.log(`Found orphaned player mesh: ${playerId} (${object.userData.playerName || 'unknown'})`);
              orphanedPlayerMeshes++;
              
              // Add the orphaned mesh to playersRef if it has a valid playerId
              if (playerId && playerId !== this.socketController.getSocketId()) {
                console.log(`Recovering orphaned player mesh: ${playerId}`);
                this.playersRef.current.set(playerId, object as THREE.Mesh);
              }
            }
          }
        });
        
        if (orphanedPlayerMeshes > 0) {
          console.log(`Recovery complete: Found ${orphanedPlayerMeshes} orphaned player meshes`);
        } else {
          console.log("No orphaned player meshes found in the scene.");
        }
        
        // Request forced sync if we should have players but don't
        if (socketController.forceSyncPlayers) {
          console.log("Requesting forced player sync from server...");
          socketController.forceSyncPlayers();
        }
      }
    }
    
    this.playersRef.current.forEach((mesh, playerId) => {
      // Ensure mesh has userData and targetPosition
      if (mesh.userData && mesh.userData.targetPosition) {
        const target = mesh.userData.targetPosition as THREE.Vector3;
        const current = mesh.position;

        // Calculate distance (use non-squared for dynamic factor logic)
        const distance = Math.sqrt(
          Math.pow(target.x - current.x, 2) +
          Math.pow(target.z - current.z, 2) // Only XZ distance matters for dynamic factor/rotation
        );
        const distanceSquared = distance * distance + Math.pow(target.y - current.y, 2); // Full 3D distance squared for snapping

        // If distance is large, snap immediately
        if (distanceSquared > POSITION_SNAP_THRESHOLD * POSITION_SNAP_THRESHOLD) {
          mesh.position.copy(target);
          // Also snap rotation if available in userData
          if (mesh.userData.rotationY !== undefined) {
            mesh.rotation.y = mesh.userData.rotationY;
          }
        } else if (distance > 0.005) { // Only interpolate if there's a meaningful distance
          // Calculate time since last server update for prediction
          const timeSinceUpdate = mesh.userData.lastUpdateTime ? (Date.now() - mesh.userData.lastUpdateTime) / 1000 : delta;

          // Dynamic interpolation factor based on distance (restored logic)
          let finalFactor = INTERPOLATION_SPEED;
          if (distance > 3.0) { finalFactor = 0.8; }
          else if (distance > 1.0) { finalFactor = 0.6; }
          else if (distance > 0.5) { finalFactor = 0.5; }
          else {
            const distanceFactor = Math.min(1, distance * 0.9);
            finalFactor = Math.min(1, INTERPOLATION_SPEED * (1 + distanceFactor * 5));
          }

          // Clamp factor based on delta to prevent overshooting on low frame rates
          const lerpFactor = Math.min(1, finalFactor); // Removed delta * 60, direct factor is often better

          // Interpolate position
          mesh.position.x += (target.x - current.x) * lerpFactor;
          mesh.position.y += (target.y - current.y) * lerpFactor;
          mesh.position.z += (target.z - current.z) * lerpFactor;

          // Apply prediction based on server-provided velocity (restored logic)
          if (ENABLE_POSITION_PREDICTION && mesh.userData.serverVelocity) {
            const predictionFactor = Math.min(0.3, timeSinceUpdate * 0.6);
            if (distance < 0.8) { // Only predict for small distances
              mesh.position.x += mesh.userData.serverVelocity.x * timeSinceUpdate * predictionFactor;
              mesh.position.z += mesh.userData.serverVelocity.z * timeSinceUpdate * predictionFactor;
            }
          }

          // Update player rotation to face movement direction or match server rotation
          if (distance > 0.05) { // Only update rotation if moving significantly
            // If we have server rotation data, prioritize that for better sync
            if (mesh.userData.rotationY !== undefined) {
              const rotationDiff = mesh.userData.rotationY - mesh.rotation.y;
              // Normalize rotation difference to [-PI, PI]
              const normalizedDiff = ((rotationDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
              // Use faster rotation speed during active movement
              mesh.rotation.y += normalizedDiff * ROTATION_SPEED * 1.5;
            } else {
              // Fall back to calculated angle based on movement direction
              const angle = Math.atan2(target.x - current.x, target.z - current.z);
              const rotationDiff = angle - mesh.rotation.y;
              const normalizedDiff = ((rotationDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
              mesh.rotation.y += normalizedDiff * ROTATION_SPEED;
            }
          } else if (mesh.userData.rotationY !== undefined) {
            // If not moving much, slowly sync with last known server rotation
            const rotationDiff = mesh.userData.rotationY - mesh.rotation.y;
            const normalizedDiff = ((rotationDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
            
            // If the rotation difference is large, sync faster
            const rotationSpeed = Math.abs(normalizedDiff) > 0.5 ? 
              ROTATION_SPEED * 0.5 : // Faster sync for large differences
              ROTATION_SPEED * 0.1;  // Slower sync for minor adjustments
              
            mesh.rotation.y += normalizedDiff * rotationSpeed;
          }

          // Snap if very close (restored logic)
          // Use squared distance check for performance
          if (distanceSquared < CLOSE_SNAP_DISTANCE_SQ) {
            mesh.position.copy(target);
          }
        }
      } else {
        console.warn(`Player mesh ${playerId} missing userData or targetPosition:`, mesh.userData);
      }
    });
  }


  private render(): void {
    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }

  public resize(width: number, height: number): void {
    this.renderer.setSize(width, height);
    this.labelRenderer.setSize(width, height);

    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.camera.aspect = width / height;
      this.camera.updateProjectionMatrix();
    }
  }
}

export default AnimationController;