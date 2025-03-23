import React, { useRef, useEffect, useState, useCallback } from 'react';
import * as THREE from 'three';
import { getSocket } from '../../game/network/socket';
import useKeyboardControls from '../../hooks/useKeyboardControls';
import PlayerManager from './PlayerManager';
import RemotePlayersManager from './RemotePlayersManager';
import CameraManager from './CameraManager';

// Constants
const MOVEMENT_SPEED = 0.02;
const FIXED_SPEED_FACTOR = 0.02;
const JUMP_FORCE = 0.3;
const GRAVITY = 0.01;
const SEND_INTERVAL = 100; // Send updates at most every 100ms

// World boundaries
const WORLD_BOUNDS = {
  minX: -50, 
  maxX: 50,
  minZ: -50,
  maxZ: 50
};

interface PlayerControllerProps {
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  onZoneChange: (x: number, z: number) => void;
  addPositionToHistory: (x: number, z: number, time: number) => void;
  detectAnomalousMovement: () => void;
  onPositionChange: () => void;
  onInit?: (controller: { updatePlayerMovement: () => void }) => void;
  initialPlayers?: any[];
  mySocketId?: string;
}

// Add a KeyboardControlComponent to handle continuous keyboard input
const KeyboardControlComponent: React.FC<{
  onUpdate: () => void, 
  atBoundary: boolean, 
  keyboardState: any
}> = ({ onUpdate, atBoundary, keyboardState }) => {
  useEffect(() => {
    console.log("KeyboardControlComponent mounted - setting up continuous updates");
    
    // Force initial update to ensure positioning is correct
    setTimeout(() => {
      console.log("Forcing immediate initial position update");
      onUpdate();
    }, 100);
    
    // Set up a continuous update loop for smooth movement
    const updateIntervalId = setInterval(() => {
      // Only trigger movement if keys are pressed AND we're not at a boundary
      // or if boundary state has changed and keys are pressed (to allow movement in other directions)
      const keysPressed = keyboardState.forward || keyboardState.backward || 
                         keyboardState.left || keyboardState.right;
      
      if (keysPressed) {
        onUpdate();
      }
    }, 16); // ~60fps
    
    // Also handle direct key events for immediate response
    const handleKeyEvent = (event: KeyboardEvent) => {
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.code)) {
        // Immediate update on key press/release
        onUpdate();
      }
    };
    
    window.addEventListener('keydown', handleKeyEvent);
    window.addEventListener('keyup', handleKeyEvent);
    
    return () => {
      clearInterval(updateIntervalId);
      window.removeEventListener('keydown', handleKeyEvent);
      window.removeEventListener('keyup', handleKeyEvent);
      console.log("KeyboardControlComponent unmounted - cleanup complete");
    };
  }, [onUpdate, atBoundary, keyboardState]);
  
  return null;
};

const PlayerController: React.FC<PlayerControllerProps> = ({
  playerRef,
  scene,
  camera,
  renderer,
  onZoneChange,
  addPositionToHistory,
  detectAnomalousMovement,
  onPositionChange,
  onInit,
  initialPlayers = [],
  mySocketId
}) => {
  const lastUpdateTime = useRef(Date.now());
  const [socketId, setSocketId] = useState<string | undefined>(mySocketId);
  const [sceneReady, setSceneReady] = useState<boolean>(false);
  
  // Initialize position for the player
  const initialPosition = useRef(new THREE.Vector3(0, 1, 0));
  
  // Initialize keyboard tracking outside the effect to prevent missing updates
  const keyboardState = useKeyboardControls();
  
  // Add a state to track movement for debugging
  const [movementDebug, setMovementDebug] = useState({ 
    isMoving: false,
    atBoundary: false,
    boundaryDirection: ''
  });
  
  // Create the movement function using useCallback to prevent unnecessary re-renders
  const updatePlayerMovement = useCallback(() => {
    // Access the player mesh reference from PlayerManager if available
    const playerMeshRef = (updatePlayerMovement as any).playerMeshRef;
    const activePlayerRef = playerMeshRef?.current || playerRef.current;
    
    if (!activePlayerRef) {
      console.warn("No player reference available for movement!");
      return;
    }
    
    // Check if player is at origin and needs to be initialized
    if (activePlayerRef.position.distanceTo(new THREE.Vector3(0, 0, 0)) < 0.1) {
      console.log("Player at origin, moving to initial position:", initialPosition.current);
      activePlayerRef.position.copy(initialPosition.current);
    }
    
    // Get camera direction for movement relative to camera view
    const cameraDirection = new THREE.Vector3();
    camera.getWorldDirection(cameraDirection);
    cameraDirection.y = 0;
    cameraDirection.normalize();
    
    // Get camera right vector for strafing
    const cameraRight = new THREE.Vector3(1, 0, 0);
    cameraRight.applyQuaternion(camera.quaternion);
    cameraRight.y = 0;
    cameraRight.normalize();
    
    const moveSpeed = 0.15; // Speed for responsive movement
    const moveDirection = new THREE.Vector3(0, 0, 0);
    
    // Calculate movement direction relative to camera view
    if (keyboardState.forward) moveDirection.add(cameraDirection);
    if (keyboardState.backward) moveDirection.sub(cameraDirection);
    if (keyboardState.left) moveDirection.sub(cameraRight);
    if (keyboardState.right) moveDirection.add(cameraRight);
    
    // Make sure player has correct userData for camera to find - do this even if not moving
    activePlayerRef.userData = {
      ...activePlayerRef.userData,
      isPlayer: true,
      playerId: 'localPlayer' 
    };
    
    // Debug - log the current player reference type to help diagnose issues
    if (!movementDebug.isMoving && moveDirection.length() > 0) {
      console.log("Player movement starting with:", {
        activePlayerRef: activePlayerRef,
        isObject3D: activePlayerRef instanceof THREE.Object3D,
        isGroup: activePlayerRef instanceof THREE.Group,
        isMesh: activePlayerRef instanceof THREE.Mesh,
        position: activePlayerRef.position.clone(),
        playerMeshRefExists: !!playerMeshRef?.current
      });
      setMovementDebug({ 
        isMoving: true,
        atBoundary: false,
        boundaryDirection: ''
      });
    }
    
    // Only proceed if there's actual movement
    if (moveDirection.length() > 0) {
      // Normalize for consistent speed in all directions
      moveDirection.normalize();
      moveDirection.multiplyScalar(moveSpeed);
      
      // Store original position for verification
      const originalPosition = activePlayerRef.position.clone();
      
      // Check for boundary constraints BEFORE moving
      const worldBounds = {
        minX: -50, maxX: 50,
        minZ: -50, maxZ: 50
      };
      
      // Pre-calculate potential new position
      const potentialPosition = originalPosition.clone().add(moveDirection);
      
      // Check boundary constraints
      const atXBoundary = (potentialPosition.x <= worldBounds.minX) || 
                         (potentialPosition.x >= worldBounds.maxX);
      const atZBoundary = (potentialPosition.z <= worldBounds.minZ) || 
                         (potentialPosition.z >= worldBounds.maxZ);
      
      // Update direction to allow sliding along boundaries
      if (atXBoundary) {
        moveDirection.x = 0;
      }
      if (atZBoundary) {
        moveDirection.z = 0;
      }
      
      // Only move if there's a valid movement direction
      if (moveDirection.length() > 0.01) {
        // Make player face the direction of movement (if direction components remain)
        if (Math.abs(moveDirection.x) > 0.01 || Math.abs(moveDirection.z) > 0.01) {
          const targetRotation = Math.atan2(moveDirection.x, moveDirection.z);
          activePlayerRef.rotation.y = targetRotation;
        }
        
        // Update position with adjusted movement
        activePlayerRef.position.add(moveDirection);
        
        // Apply final boundary constraints to ensure we never exceed limits
        activePlayerRef.position.x = Math.max(worldBounds.minX, Math.min(worldBounds.maxX, activePlayerRef.position.x));
        activePlayerRef.position.z = Math.max(worldBounds.minZ, Math.min(worldBounds.maxZ, activePlayerRef.position.z));
        
        // Only log boundary messages if there is still active movement
        // This prevents continuous logging when player is stationary at boundary
        if ((atXBoundary || atZBoundary) && moveDirection.length() > 0.01) {
          console.log("Player at world boundary - modified movement to slide", {
            position: originalPosition,
            direction: moveDirection,
            atXBoundary,
            atZBoundary
          });
        }
        
        // Update movement debug with boundary information
        let direction = '';
        if (atXBoundary) {
          direction = originalPosition.x <= worldBounds.minX ? 'west' : 'east';
        } else if (atZBoundary) {
          direction = originalPosition.z <= worldBounds.minZ ? 'north' : 'south';
        }
        
        setMovementDebug(prev => ({
          ...prev,
          atBoundary: atXBoundary || atZBoundary,
          boundaryDirection: direction
        }));
        
        // After movement, notify about position changes
        onPositionChange();
        onZoneChange(activePlayerRef.position.x, activePlayerRef.position.z);
        addPositionToHistory(
          activePlayerRef.position.x,
          activePlayerRef.position.z,
          Date.now()
        );
        
        // Async send to server without blocking movement
        getSocket().then(socket => {
          if (socket && activePlayerRef) {
            socket.emit('playerMove', {
              x: activePlayerRef.position.x,
              y: activePlayerRef.position.y,
              z: activePlayerRef.position.z
            });
          }
        });
      } else {
        // If no movement after boundary adjustment, update debug info
        setMovementDebug(prev => ({
          ...prev,
          atBoundary: atXBoundary || atZBoundary,
          boundaryDirection: atXBoundary ? 
            (originalPosition.x <= worldBounds.minX ? 'west' : 'east') : 
            (originalPosition.z <= worldBounds.minZ ? 'north' : 'south')
        }));
      }
    }
  }, [camera, keyboardState, playerRef, initialPosition, onPositionChange, onZoneChange, addPositionToHistory, movementDebug.isMoving]);
  
  // Get socket ID if not provided
  useEffect(() => {
    if (!mySocketId) {
      const getSocketId = async () => {
        const socket = await getSocket();
        if (socket && socket.id) {
          console.log("Socket ID retrieved:", socket.id);
          setSocketId(socket.id);
        }
      };
      
      getSocketId();
    }
  }, [mySocketId]);
  
  // Check if scene is ready
  useEffect(() => {
    if (scene instanceof THREE.Scene) {
      console.log("Scene is ready for player controller");
      setSceneReady(true);
    } else {
      console.warn("Scene is not a valid THREE.Scene object in PlayerController");
      setSceneReady(false);
    }
  }, [scene]);
  
  // Initialize controller immediately
  useEffect(() => {
    if (onInit) {
      onInit({ updatePlayerMovement });
      console.log("Player controller initialized with movement function ready to use");
    }
  }, [onInit]);
  
  // Log controller status
  useEffect(() => {
    console.log("Player controller status:", {
      socketId: socketId || "waiting for socket",
      sceneReady,
      playerRefExists: !!playerRef.current
    });
  }, [socketId, sceneReady]);

  // If scene is not ready yet, add a temporary placeholder cube to help debug
  useEffect(() => {
    // Safety fallback: Create a temporary cube if scene exists but components aren't working
    if (scene instanceof THREE.Scene && !sceneReady) {
      console.log("Creating temporary debug cube in scene");
      
      // Check if we already have a debug cube
      let hasDebugCube = false;
      scene.traverse((obj) => {
        if (obj.userData && obj.userData.isDebugCube) {
          hasDebugCube = true;
        }
      });
      
      if (!hasDebugCube) {
        const geometry = new THREE.BoxGeometry(1, 1, 1);
        const material = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
        const debugCube = new THREE.Mesh(geometry, material);
        debugCube.position.set(0, 2, 0);
        debugCube.userData = { isDebugCube: true };
        scene.add(debugCube);
        
        console.log("Debug cube added to scene");
      }
    }
    
    return () => {
      // Remove debug cube when components are ready
      if (scene instanceof THREE.Scene && sceneReady) {
        scene.traverse((obj) => {
          if (obj.userData && obj.userData.isDebugCube) {
            scene.remove(obj);
          }
        });
      }
    };
  }, [scene, sceneReady]);

  // Update movement debug status
  useEffect(() => {
    const interval = setInterval(() => {
      // Check if any keys are being pressed
      if (keyboardState) {
        const isMoving = keyboardState.forward || keyboardState.backward || 
                         keyboardState.left || keyboardState.right;
        
        setMovementDebug(prev => ({
          ...prev,
          isMoving
        }));
      }
    }, 200); // Check every 200ms
    
    return () => clearInterval(interval);
  }, [keyboardState]);

  // Create a reference to hold the sendEvent function
  const sendEventRef = useRef<any>(updatePlayerMovement);

  // Add a useEffect to capture the player mesh reference from PlayerManager
  useEffect(() => {
    // Store updatePlayerMovement in the ref for later use
    sendEventRef.current = updatePlayerMovement;
    
    // Check for player mesh reference every 200ms until found
    const checkForPlayerMesh = () => {
      const sendEvent = sendEventRef.current;
      if (sendEvent && sendEvent.playerMeshRef) {
        console.log('Found player mesh reference from PlayerManager!');
        (updatePlayerMovement as any).playerMeshRef = sendEvent.playerMeshRef;
        return true;
      }
      return false;
    };
    
    // Try immediately
    if (!checkForPlayerMesh()) {
      // Set up interval to check for player mesh reference
      const intervalId = setInterval(() => {
        if (checkForPlayerMesh()) {
          clearInterval(intervalId);
        }
      }, 200);
      
      return () => clearInterval(intervalId);
    }
  }, []);
  
  // Add a synchronization effect to force initial player and camera positioning
  useEffect(() => {
    if (!scene || !camera) return;
    
    // Force a position update when all components are ready
    const syncComponents = () => {
      // Try to find the player in the scene
      let playerFound = false;
      
      scene.traverse((object) => {
        if (object.userData && object.userData.isPlayer) {
          console.log("PlayerController: Found player in scene for initial sync");
          
          // Set this player as the active player reference
          if (playerRef && !playerRef.current) {
            console.log("Setting playerRef to found player");
            playerRef.current = object as THREE.Mesh;
          }
          
          // Ensure the player is at the initial position
          const initialPos = initialPosition.current;
          if (object.position.distanceTo(new THREE.Vector3(0, 0, 0)) < 0.1) {
            // If player is at origin, move it to the initial position
            console.log("Player at origin, moving to initial position:", initialPos);
            object.position.copy(initialPos);
          }
          
          // Force an immediate movement update
          if (typeof updatePlayerMovement === 'function') {
            console.log("Forcing initial player movement update");
            (updatePlayerMovement as any).playerMeshRef = { current: object };
            updatePlayerMovement();
          }
          
          playerFound = true;
        }
      });
      
      if (!playerFound) {
        console.warn("Player not found in scene for initial sync");
      }
      
      return playerFound;
    };
    
    // Try to sync immediately
    const syncSuccess = syncComponents();
    
    // If not successful, retry a few times
    if (!syncSuccess) {
      let attempts = 0;
      const maxAttempts = 5;
      
      const syncInterval = setInterval(() => {
        attempts++;
        console.log(`Attempt ${attempts} to sync components...`);
        
        if (syncComponents() || attempts >= maxAttempts) {
          clearInterval(syncInterval);
        }
      }, 500);
      
      return () => clearInterval(syncInterval);
    }
  }, [scene, camera, playerRef, initialPosition, updatePlayerMovement]);
  
  // Only render child components when scene is ready
  if (!sceneReady || !scene || !camera || !renderer) {
    console.warn("Cannot render player control components - dependencies not ready");
    return null;
  }

  return (
    <>
      <PlayerManager 
        scene={scene}
        camera={camera}
        renderer={renderer}
        sendEvent={updatePlayerMovement}
        initialPosition={initialPosition.current}
      />
      
      <RemotePlayersManager 
        scene={scene}
        initialPlayers={initialPlayers}
      />
      
      <CameraManager 
        scene={scene}
        camera={camera}
        renderer={renderer}
        targetPlayerId={'localPlayer'} // Use the localPlayer ID set in PlayerManager
      />
      
      {/* Add the KeyboardControlComponent to handle continuous updates */}
      <KeyboardControlComponent onUpdate={updatePlayerMovement} atBoundary={movementDebug.atBoundary} keyboardState={keyboardState} />
      
      {/* Debug info - can be removed in production */}
      <div style={{ 
        position: 'fixed', 
        bottom: '10px', 
        left: '10px', 
        backgroundColor: 'rgba(0,0,0,0.7)', 
        color: 'white', 
        padding: '8px', 
        fontSize: '12px', 
        zIndex: 100,
        pointerEvents: 'none', // Don't interfere with game controls
        borderRadius: '5px',
        maxWidth: '250px'
      }}>
        <div>WASD or Arrow Keys to move</div>
        <div>Camera following player: localPlayer</div>
        <div>Movement Status: {movementDebug.isMoving ? 'Moving' : 'Idle'}</div>
        <div>Player Controls: {(updatePlayerMovement as any).playerMeshRef ? "Connected" : "Not Connected"}</div>
        {movementDebug.atBoundary && (
          <div style={{ color: '#ffcc00' }}>
            World Boundary Reached: {movementDebug.boundaryDirection} edge
            <div style={{ fontSize: '10px', marginTop: '2px', color: '#aaa' }}>
              Try moving in a different direction to slide along the boundary
            </div>
          </div>
        )}
        <div style={{fontSize: '10px', color: '#aaa', marginTop: '5px'}}>If issues persist, press ESC and reload the page</div>
      </div>
    </>
  );
};

export default PlayerController; 