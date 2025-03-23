import { useRef, useCallback } from 'react';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import soundManager from '../../game/audio/soundManager';

// Player movement speed
const MOVEMENT_SPEED = 0.02;
const FIXED_SPEED_FACTOR = 0.02;
// Position prediction settings
const POSITION_SNAP_THRESHOLD = 5.0;
const INTERPOLATION_SPEED = 0.4;

// World boundaries
const WORLD_BOUNDS = {
  minX: -50, 
  maxX: 50,
  minZ: -50,
  maxZ: 50
};

interface PlayerManagerProps {
  scene: THREE.Scene;
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  playersRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  nameLabelsRef: React.MutableRefObject<Map<string, CSS2DObject>>;
  chatBubblesRef: React.MutableRefObject<Map<string, { object: CSS2DObject, expiry: number }>>;
  positionHistory: React.MutableRefObject<Array<{x: number, z: number, time: number}>>;
  keysPressed: React.MutableRefObject<Record<string, boolean>>;
  cameraAngle: React.MutableRefObject<number>;
  notifyMovementChanged: () => void;
  ownSocketId?: string;
}

export const usePlayerManager = ({ 
  scene, 
  playerRef, 
  playersRef, 
  nameLabelsRef,
  chatBubblesRef,
  positionHistory,
  keysPressed,
  cameraAngle,
  notifyMovementChanged,
  ownSocketId
}: PlayerManagerProps) => {
  const isJumping = useRef(false);
  const jumpVelocity = useRef(0);
  const lastUpdateTime = useRef(0);
  const JUMP_FORCE = 0.3;
  const GRAVITY = 0.015;
  const MAX_HISTORY_LENGTH = 5;
  const ANOMALOUS_SPEED_THRESHOLD = 1.0;

  // Create player avatar
  const createPlayer = useCallback(() => {
    // Clean up existing player if any
    if (playerRef.current) {
      scene.remove(playerRef.current);
      if (playerRef.current.geometry) playerRef.current.geometry.dispose();
      if (Array.isArray(playerRef.current.material)) {
        playerRef.current.material.forEach(material => material.dispose());
      } else if (playerRef.current.material) {
        playerRef.current.material.dispose();
      }
    }

    const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
    const playerMaterial = new THREE.MeshStandardMaterial({
      color: 0x2196f3, // Blue color for player
    });
    const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
    
    // Position player slightly above ground to avoid z-fighting
    playerMesh.position.set(0, 1, 0);
    
    // Add player to scene
    scene.add(playerMesh);
    
    // Save player mesh to ref for later access
    playerRef.current = playerMesh;

    return playerMesh;
  }, [scene, playerRef]);
  
  // Create a player mesh for other players
  const createPlayerMesh = useCallback((player: any) => {
    // Skip if this is our own player
    if (ownSocketId === player.id) {
      console.log('Attempted to create mesh for own player, skipping:', player);
      return null;
    }
    
    console.log(`Creating mesh for player ${player.id}`, {
      playerExists: playersRef.current.has(player.id),
      position: { x: player.x, y: player.y, z: player.z }
    });
    
    // Find any existing meshes for this player to ensure proper cleanup
    const existingMeshes: THREE.Object3D[] = [];
    
    // Check in playersRef first
    if (playersRef.current.has(player.id)) {
      const knownMesh = playersRef.current.get(player.id);
      if (knownMesh) {
        existingMeshes.push(knownMesh);
      }
    }
    
    // Also search the entire scene for duplicates
    scene.traverse((object) => {
      if (object.userData && object.userData.playerId === player.id) {
        // Only add to our list if not already in existingMeshes
        if (!existingMeshes.includes(object)) {
          existingMeshes.push(object);
        }
      }
    });
    
    // Clean up all existing meshes for this player
    existingMeshes.forEach(mesh => {
      // First remove any CSS2DObjects
      mesh.traverse((child) => {
        if ((child as any).isCSS2DObject) {
          if (child.parent) {
            child.parent.remove(child);
          }
          scene.remove(child);
        }
      });
      
      // Clean up any object data
      if ((mesh as THREE.Mesh).geometry) {
        (mesh as THREE.Mesh).geometry.dispose();
      }
      
      // Clean up materials
      if ((mesh as THREE.Mesh).material) {
        if (Array.isArray((mesh as THREE.Mesh).material)) {
          ((mesh as THREE.Mesh).material as THREE.Material[]).forEach((material: THREE.Material) => material.dispose());
        } else {
          ((mesh as THREE.Mesh).material as THREE.Material).dispose();
        }
      }
      
      // Remove from scene
      scene.remove(mesh);
    });
    
    // Remove from our tracking references
    playersRef.current.delete(player.id);
        
    // Remove from name labels ref
    if (nameLabelsRef.current.has(player.id)) {
      const label = nameLabelsRef.current.get(player.id);
      if (label) {
        if (label.parent) {
          label.parent.remove(label);
        }
        scene.remove(label);
        nameLabelsRef.current.delete(player.id);
      }
    }
    
    // Create new player mesh
    const otherPlayerGeometry = new THREE.BoxGeometry(1, 2, 1);
    const otherPlayerMaterial = new THREE.MeshStandardMaterial({
      color: 0xff5722, // Orange color for other players
    });
    const otherPlayerMesh = new THREE.Mesh(otherPlayerGeometry, otherPlayerMaterial);
    
    // Set position from player data
    otherPlayerMesh.position.set(player.x, player.y, player.z);
    
    // Store player data in userData
    otherPlayerMesh.userData.playerId = player.id;
    otherPlayerMesh.userData.playerName = player.name;
    otherPlayerMesh.userData.targetPosition = new THREE.Vector3(player.x, player.y, player.z);
    otherPlayerMesh.userData.lastUpdateTime = Date.now();
    
    // Set disappearance timeout - if we don't hear from this player for 30 seconds, mark for cleanup
    otherPlayerMesh.userData.disappearanceTimeout = setTimeout(() => {
      otherPlayerMesh.userData.markedForCleanup = true;
    }, 30000);
    
    // Add to scene
    scene.add(otherPlayerMesh);
    
    // Store in players map
    playersRef.current.set(player.id, otherPlayerMesh);
    
    console.log(`Player mesh created and added for ${player.id}`, {
      meshCreated: !!otherPlayerMesh,
      position: otherPlayerMesh.position,
      inTrackingMap: playersRef.current.has(player.id)
    });
    
    return otherPlayerMesh;
  }, [scene, playersRef, nameLabelsRef, ownSocketId]);

  // Create name label for player
  const createNameLabel = useCallback((name: string, mesh: THREE.Mesh) => {
    // Get player ID
    const playerId = mesh.userData.playerId;
    
    // Remove any existing label for this player from the scene and ref
    if (playerId && nameLabelsRef.current.has(playerId)) {
      const existingLabel = nameLabelsRef.current.get(playerId);
      if (existingLabel) {
        // Remove from parent if it has one
        if (existingLabel.parent) {
          existingLabel.parent.remove(existingLabel);
        }
        // Also remove from scene directly to be sure
        scene.remove(existingLabel);
        // Remove from our tracking map
        nameLabelsRef.current.delete(playerId);
      }
    }
    
    // Remove existing labels from the mesh to avoid duplicates
    const childrenToRemove: THREE.Object3D[] = [];
    mesh.children.forEach(child => {
      if ((child as any).isCSS2DObject) {
        childrenToRemove.push(child);
      }
    });
    
    // Remove the children outside the loop
    childrenToRemove.forEach(child => {
      mesh.remove(child);
      scene.remove(child);
    });
    
    // Create new label
    const nameDiv = document.createElement('div');
    nameDiv.className = 'player-label';
    nameDiv.textContent = name;
    nameDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    nameDiv.style.color = 'white';
    nameDiv.style.padding = '2px 6px';
    nameDiv.style.borderRadius = '3px';
    nameDiv.style.fontSize = '12px';
    nameDiv.style.fontFamily = 'Arial, sans-serif';
    nameDiv.style.fontWeight = 'bold';
    nameDiv.style.textAlign = 'center';
    nameDiv.style.userSelect = 'none';
    nameDiv.style.pointerEvents = 'none'; // Make sure labels don't interfere with clicks
    
    const nameLabel = new CSS2DObject(nameDiv);
    nameLabel.position.set(0, 2.5, 0); // Position above the player
    nameLabel.userData.labelType = 'playerName';
    nameLabel.userData.forPlayer = playerId;
    
    // Add to tracking map if we have a playerId
    if (playerId) {
      nameLabelsRef.current.set(playerId, nameLabel);
    }
    
    // Add to mesh
    mesh.add(nameLabel);
    return nameLabel;
  }, [scene, nameLabelsRef]);

  // Create chat bubble above player
  const createChatBubble = useCallback((playerId: string, message: string, mesh: THREE.Mesh) => {
    // Remove any existing chat bubble for this player
    if (chatBubblesRef.current.has(playerId)) {
      const existingBubble = chatBubblesRef.current.get(playerId);
      if (existingBubble && existingBubble.object) {
        // Remove from parent if it has one
        if (existingBubble.object.parent) {
          existingBubble.object.parent.remove(existingBubble.object);
        }
        // Also remove from scene directly to be sure
        scene.remove(existingBubble.object);
      }
      // Remove from tracking map
      chatBubblesRef.current.delete(playerId);
    }
    
    // Create bubble div
    const bubbleDiv = document.createElement('div');
    bubbleDiv.className = 'chat-bubble';
    bubbleDiv.textContent = message;
    bubbleDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
    bubbleDiv.style.color = 'white';
    bubbleDiv.style.padding = '5px 10px';
    bubbleDiv.style.borderRadius = '10px';
    bubbleDiv.style.fontSize = '12px';
    bubbleDiv.style.fontFamily = 'Arial, sans-serif';
    bubbleDiv.style.maxWidth = '150px';
    bubbleDiv.style.textAlign = 'center';
    bubbleDiv.style.wordWrap = 'break-word';
    bubbleDiv.style.userSelect = 'none';
    bubbleDiv.style.pointerEvents = 'none'; // Make sure bubbles don't interfere with clicks
    
    // Create the bubble object
    const chatBubble = new CSS2DObject(bubbleDiv);
    chatBubble.position.set(0, 3.2, 0); // Position above the player name
    chatBubble.userData.bubbleType = 'chatBubble';
    chatBubble.userData.forPlayer = playerId;
    
    // Add to mesh
    mesh.add(chatBubble);
    
    // Store in our ref with expiry time (10 seconds from now)
    const expiryTime = Date.now() + 10000; // 10 seconds
    chatBubblesRef.current.set(playerId, { 
      object: chatBubble, 
      expiry: expiryTime 
    });
    
    console.log(`Created chat bubble for player ${playerId}, expires at ${new Date(expiryTime).toLocaleTimeString()}`);
    
    return chatBubble;
  }, [scene, chatBubblesRef]);

  // Update player movement
  const updatePlayerMovement = useCallback((deltaTime: number) => {
    if (!playerRef.current) return;
    
    const currentTime = Date.now();
    lastUpdateTime.current = currentTime;
    
    // Get key states at the beginning of the update
    const isW = keysPressed.current.w || keysPressed.current.ArrowUp;
    const isS = keysPressed.current.s || keysPressed.current.ArrowDown;
    const isD = keysPressed.current.d || keysPressed.current.ArrowRight;
    const isA = keysPressed.current.a || keysPressed.current.ArrowLeft;
    
    // Calculate movement direction based on camera angle (horizontal only)
    const forward = new THREE.Vector3(
      Math.sin(cameraAngle.current),
      0,
      Math.cos(cameraAngle.current)
    );
    const right = new THREE.Vector3(
      Math.sin(cameraAngle.current + Math.PI / 2),
      0,
      Math.cos(cameraAngle.current + Math.PI / 2)
    );
    
    // Calculate movement vector
    const movement = new THREE.Vector3(0, 0, 0);
    
    // Apply movement based on keys (use the captured states)
    if (isW) movement.sub(forward);
    if (isS) movement.add(forward);
    if (isD) movement.add(right);
    if (isA) movement.sub(right);
    
    // Only process movement if there is any
    if (movement.length() > 0) {
      // Normalize movement vector for consistent speed in all directions
      movement.normalize();
      
      // Apply reduced speed 
      movement.multiplyScalar(FIXED_SPEED_FACTOR);
      
      // Rotate player to face movement direction
      if (playerRef.current) {
        // Calculate the angle of movement in the XZ plane
        const angle = Math.atan2(movement.x, movement.z);
        // Set player rotation to face movement direction
        playerRef.current.rotation.y = angle;
      }
      
      // Calculate new position with the fixed movement
      const newX = playerRef.current.position.x + movement.x;
      const newZ = playerRef.current.position.z + movement.z;
      
      // Apply boundary checks
      const boundedX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, newX));
      const boundedZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, newZ));
      
      // Only update if we're actually moving
      if (Math.abs(boundedX - playerRef.current.position.x) > 0.0001 || 
          Math.abs(boundedZ - playerRef.current.position.z) > 0.0001) {
        
        // Update player position
        playerRef.current.position.x = boundedX;
        playerRef.current.position.z = boundedZ;
        
        // Flag that movement has changed for network updates
        notifyMovementChanged();
        
        // Position history update for anomaly detection
        positionHistory.current.push({x: boundedX, z: boundedZ, time: currentTime});
        if (positionHistory.current.length > MAX_HISTORY_LENGTH) {
          positionHistory.current.shift();
        }
        
        // Check for anomalous speed if we have enough history
        if (positionHistory.current.length >= 2) {
          detectAnomalousMovement();
        }
      }
    }
    
    // Handle jumping 
    if (isJumping.current) {
      playerRef.current.position.y += jumpVelocity.current;
      jumpVelocity.current -= GRAVITY;
      
      // Check if landed
      if (playerRef.current.position.y <= 1) {
        playerRef.current.position.y = 1;
        isJumping.current = false;
        jumpVelocity.current = 0;
      }
    }
  }, [playerRef, keysPressed, cameraAngle, positionHistory, notifyMovementChanged]);

  // Function to detect anomalous movement (sudden jumps)
  const detectAnomalousMovement = useCallback(() => {
    if (!playerRef.current) return;
    
    const history = positionHistory.current;
    const latest = history[history.length - 1];
    const previous = history[history.length - 2];
    
    // Calculate distance and time between points
    const distance = Math.sqrt(
      Math.pow(latest.x - previous.x, 2) + 
      Math.pow(latest.z - previous.z, 2)
    );
    const timeDiff = (latest.time - previous.time) / 1000; // Convert to seconds
    
    if (timeDiff > 0) {
      const speed = distance / timeDiff;
      
      // If speed exceeds threshold, adjust position
      if (speed > ANOMALOUS_SPEED_THRESHOLD) {
        console.warn(`Anomalous speed detected: ${speed.toFixed(2)} units/sec`);
        
        // Instead of immediate position correction, apply a smooth transition
        // For now, just cap the movement to a reasonable distance
        const maxAllowedDistance = MOVEMENT_SPEED * 2; // Allow some acceleration but cap it
        
        if (distance > maxAllowedDistance) {
          // Calculate direction vector
          const dirX = (latest.x - previous.x) / distance;
          const dirZ = (latest.z - previous.z) / distance;
          
          // Limit the movement to max allowed distance
          const cappedX = previous.x + (dirX * maxAllowedDistance);
          const cappedZ = previous.z + (dirZ * maxAllowedDistance);
          
          // Apply clamping again to ensure we're within bounds
          const boundedX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, cappedX));
          const boundedZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, cappedZ));
          
          // Update position
          playerRef.current.position.x = boundedX;
          playerRef.current.position.z = boundedZ;
          
          // Update last position in history
          positionHistory.current[positionHistory.current.length - 1] = {
            x: boundedX, 
            z: boundedZ, 
            time: latest.time
          };
        }
      }
    }
  }, [playerRef, positionHistory]);

  // Update remote player positions with interpolation
  const updateRemotePlayerPositions = useCallback((delta: number) => {
    // Update positions of all players with interpolation for smoother movement
    playersRef.current.forEach((playerMesh, playerId) => {
      if (!playerMesh.userData.targetPosition) return;
      
      // Get target position
      const target = playerMesh.userData.targetPosition;
      const current = playerMesh.position;
      
      // Calculate distance to target
      const distance = Math.sqrt(
        Math.pow(target.x - current.x, 2) + 
        Math.pow(target.z - current.z, 2)
      );
      
      // Improved interpolation logic - only interpolate if there's a significant distance
      if (distance > 0.005) {
        // Store previous position for velocity calculation if we don't have it yet
        if (!playerMesh.userData.prevPosition) {
          playerMesh.userData.prevPosition = current.clone();
          playerMesh.userData.prevUpdateTime = Date.now() - 16; // Assume 60fps
        }
        
        // Calculate time since last target position update
        const timeDelta = (Date.now() - playerMesh.userData.lastUpdateTime) / 1000;
        
        // Enhanced aggressive interpolation logic
        let finalFactor = INTERPOLATION_SPEED;
        
        // Use ultra-aggressive catch-up for larger distances
        if (distance > 3.0) {
          // For very large distances, use extremely aggressive catch-up (80% of the way each frame)
          finalFactor = 0.8;
        } else if (distance > 1.0) {
          // For large distances, use very aggressive catch-up (60% of the way each frame)
          finalFactor = 0.6;
        } else if (distance > 0.5) {
          // For medium distances, use moderately aggressive catch-up
          finalFactor = 0.5;
        } else {
          // Use distance-based scaling for smaller distances
          const distanceFactor = Math.min(1, distance * 0.9); // Scale more by distance, capped at 1
          finalFactor = Math.min(1, INTERPOLATION_SPEED * (1 + distanceFactor * 5));
        }
        
        // Apply position update with calculated factor
        playerMesh.position.x += (target.x - current.x) * finalFactor;
        playerMesh.position.y += (target.y - current.y) * finalFactor;
        playerMesh.position.z += (target.z - current.z) * finalFactor;
        
        // Enhanced prediction logic for server-calculated velocity
        if (playerMesh.userData.serverVelocity) {
          // Prediction strength grows with time since last update, but caps at a maximum
          const predictionFactor = Math.min(0.3, timeDelta * 0.6);
          
          // Apply prediction only for small distances to avoid making large discrepancies worse
          if (distance < 0.8) {
            playerMesh.position.x += playerMesh.userData.serverVelocity.x * timeDelta * predictionFactor;
            playerMesh.position.z += playerMesh.userData.serverVelocity.z * timeDelta * predictionFactor;
          }
        }
        
        // Update player rotation to face movement direction
        if (distance > 0.05) { // Only update rotation if there's meaningful movement
          const angle = Math.atan2(target.x - current.x, target.z - current.z);
          // Smooth rotation transition
          const rotationDiff = angle - playerMesh.rotation.y;
          // Normalize rotation difference to [-PI, PI]
          const normalizedDiff = ((rotationDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
          playerMesh.rotation.y += normalizedDiff * 0.3; // Increased from 0.2 for smoother rotation
        }
        
        // Enhanced snap logic - If we're very close to the target, snap to it
        if (distance < 0.02) { // Reduced from 0.03 to be even more precise
          playerMesh.position.copy(target);
        }
        
        // Store current position and time for next velocity calculation
        if (playerMesh.userData.prevPosition) {
          // Calculate velocity (units per second)
          const currentTime = Date.now();
          const dt = (currentTime - playerMesh.userData.prevUpdateTime) / 1000;
          
          if (dt > 0) {
            // Client-side velocity calculation as backup
            playerMesh.userData.velocity = {
              x: (playerMesh.position.x - playerMesh.userData.prevPosition.x) / dt,
              z: (playerMesh.position.z - playerMesh.userData.prevPosition.z) / dt
            };
            
            // Store position for next calculation
            playerMesh.userData.prevPosition = playerMesh.position.clone();
            playerMesh.userData.prevUpdateTime = currentTime;
          }
        }
      }
    });
  }, [playersRef]);

  // Logic to clean up player meshes
  const cleanupPlayerMeshes = useCallback(() => {
    console.log('Running player mesh cleanup');
    
    // Helper function to remove a player object and clean up resources
    const removePlayerObject = (object: THREE.Object3D) => {
      // Remove any CSS2DObjects first
      object.traverse((child) => {
        if ((child as any).isCSS2DObject) {
          if (child.parent) {
            child.parent.remove(child);
          }
          scene.remove(child);
        }
      });
      
      // Clean up geometry and materials if it's a mesh
      if ((object as THREE.Mesh).geometry) {
        (object as THREE.Mesh).geometry.dispose();
      }
      if ((object as THREE.Mesh).material) {
        if (Array.isArray((object as THREE.Mesh).material)) {
          ((object as THREE.Mesh).material as THREE.Material[]).forEach(
            (material: THREE.Material) => material.dispose()
          );
        } else {
          ((object as THREE.Mesh).material as THREE.Material).dispose();
        }
      }
      
      // Remove from scene
      scene.remove(object);
    };

    // First, do a full scene traversal to find ALL player-related objects
    const allPlayerObjects: THREE.Object3D[] = [];
    const playerIdToObjects = new Map<string, THREE.Object3D[]>();
    
    scene.traverse((object) => {
      // Check if this is a player mesh by checking for specific properties
      if (object.userData && object.userData.playerId) {
        const playerId = object.userData.playerId;
        allPlayerObjects.push(object);
        
        // Group by player ID
        if (!playerIdToObjects.has(playerId)) {
          playerIdToObjects.set(playerId, []);
        }
        playerIdToObjects.get(playerId)?.push(object);
      }
    });
    
    console.log(`Found ${allPlayerObjects.length} total player-related objects in scene`);
    
    // Process objects by player ID to handle cleanup
    playerIdToObjects.forEach((objects, playerId) => {
      // Check if player is our own player
      if (playerId === ownSocketId) {
        console.log(`Processing own player objects, found ${objects.length}`);
        
        // Keep only the original playerRef
        objects.forEach(obj => {
          if (obj !== playerRef.current) {
            console.log('Removing duplicate of own player');
            removePlayerObject(obj);
          }
        });
      } else {
        // This is another player, we should only have one main mesh per player
        console.log(`Processing player ${playerId}, found ${objects.length} objects`);
        
        // Keep only the one tracked in playersRef
        const trackedMesh = playersRef.current.get(playerId);
        if (trackedMesh) {
          objects.forEach(obj => {
            if (obj !== trackedMesh && obj.type === 'Mesh') {
              console.log(`Removing duplicate mesh for player ${playerId}`);
              removePlayerObject(obj);
            }
          });
        } else {
          // If not in our tracking map, remove all instances
          objects.forEach(obj => {
            console.log(`Removing untracked player ${playerId}`);
            removePlayerObject(obj);
          });
        }
      }
    });

    // Check for orphaned name labels (not attached to any player)
    nameLabelsRef.current.forEach((label, playerId) => {
      if (!playerIdToObjects.has(playerId)) {
        console.log(`Removing orphaned name label for player ${playerId}`);
        if (label.parent) {
          label.parent.remove(label);
        }
        scene.remove(label);
        nameLabelsRef.current.delete(playerId);
      }
    });

    // Also check for orphaned chat bubbles
    chatBubblesRef.current.forEach((bubble, playerId) => {
      if (!playerIdToObjects.has(playerId)) {
        console.log(`Removing orphaned chat bubble for player ${playerId}`);
        if (bubble.object.parent) {
          bubble.object.parent.remove(bubble.object);
        }
        scene.remove(bubble.object);
        chatBubblesRef.current.delete(playerId);
      }
    });
  }, [scene, playerRef, playersRef, nameLabelsRef, chatBubblesRef, ownSocketId]);

  // Expose all the functions and values we need
  return {
    createPlayer,
    createPlayerMesh,
    createNameLabel,
    createChatBubble,
    updatePlayerMovement,
    updateRemotePlayerPositions,
    cleanupPlayerMeshes
  };
};

export default usePlayerManager; 