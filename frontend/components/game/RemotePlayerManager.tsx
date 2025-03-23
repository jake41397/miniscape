import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Player } from '../../types/player';

interface PlayerMoveData {
  id: string;
  x: number;
  y: number;
  z: number;
  timestamp?: number;
}

export interface RemotePlayerManagerInterface {
  createPlayerMesh: (player: Player) => THREE.Mesh | null;
  updateRemotePlayerPositions: (delta: number) => void;
  handlePlayerMove: (moveData: PlayerMoveData) => void;
  cleanupPlayerMeshes: () => void;
}

interface RemotePlayerManagerProps {
  scene: THREE.Scene;
  playersRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  nameLabelsRef: React.MutableRefObject<Map<string, CSS2DObject>>;
  mySocketId: string;
  createNameLabel: (name: string, mesh: THREE.Mesh) => CSS2DObject;
  onInit: (manager: RemotePlayerManagerInterface) => void;
}

const RemotePlayerManager: React.FC<RemotePlayerManagerProps> = ({
  scene,
  playersRef,
  nameLabelsRef,
  mySocketId,
  createNameLabel,
  onInit
}) => {
  // Constants for position interpolation
  const INTERPOLATION_SPEED = 0.4;
  const POSITION_HISTORY_LENGTH = 5;
  const ENABLE_POSITION_PREDICTION = true;
  const POSITION_SNAP_THRESHOLD = 5.0;
  
  // Create player mesh for a remote player
  const createPlayerMesh = (player: Player) => {
    // Skip if this is the local player
    if (mySocketId === player.id) {
      return null;
    }
    
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
    
    // Add name label
    const nameLabel = createNameLabel(player.name, otherPlayerMesh);
    nameLabelsRef.current.set(player.id, nameLabel);
    
    // Add to scene and return
    scene.add(otherPlayerMesh);
    playersRef.current.set(player.id, otherPlayerMesh);
    
    return otherPlayerMesh;
  };
  
  // Update remote player positions
  const updateRemotePlayerPositions = (delta: number) => {
    playersRef.current.forEach((playerMesh, playerId) => {
      // Skip updating our own mesh
      if (playerId === mySocketId) return;
      
      // Check if this player is targeted for cleanup
      if (playerMesh.userData.markedForCleanup) {
        return;
      }
      
      // Get target and current positions
      const target = playerMesh.userData.targetPosition as THREE.Vector3;
      const current = playerMesh.position.clone();
      
      // Calculate distance to target
      const distance = current.distanceTo(target);
      
      // If we're far from target, interpolate toward it
      if (distance > 0.01) {
        // Calculate time delta since last update
        const timeDelta = delta;
        
        // Smooth position interpolation
        playerMesh.position.lerp(target, INTERPOLATION_SPEED * timeDelta);
        
        // Check if server provided velocity information
        if (playerMesh.userData.serverVelocity) {
          // Enhanced prediction logic
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
          }
        }
        
        // Update previous position
        if (!playerMesh.userData.prevPosition) {
          playerMesh.userData.prevPosition = new THREE.Vector3();
        }
        playerMesh.userData.prevPosition.copy(playerMesh.position);
        playerMesh.userData.prevUpdateTime = Date.now();
      }
    });
  };
  
  // Handle player movement updates from server
  const handlePlayerMove = (moveData: PlayerMoveData) => {
    // Don't process our own movement updates from the server
    if (moveData.id === mySocketId) return;
    
    // Get the player mesh or create it if it doesn't exist
    let playerMesh = playersRef.current.get(moveData.id);
    
    if (!playerMesh) {
      // If we don't have a mesh for this player, we need more data than just position
      // But we'll use what we have for now
      const tempPlayer: Player = {
        id: moveData.id,
        name: `Player-${moveData.id.slice(0, 4)}`,
        x: moveData.x,
        y: moveData.y,
        z: moveData.z
      };
      
      playerMesh = createPlayerMesh(tempPlayer);
      if (!playerMesh) return; // If creation failed, exit
    }
    
    // Reset cleanup timeout, as we got an update from this player
    if (playerMesh.userData.disappearanceTimeout) {
      clearTimeout(playerMesh.userData.disappearanceTimeout);
    }
    
    // Set new disappearance timeout
    playerMesh.userData.disappearanceTimeout = setTimeout(() => {
      playerMesh!.userData.markedForCleanup = true;
    }, 30000);
    
    // Remove cleanup flag if it exists
    if (playerMesh.userData.markedForCleanup) {
      playerMesh.userData.markedForCleanup = false;
    }
    
    // Calculate velocity for prediction
    const newPosition = new THREE.Vector3(moveData.x, moveData.y, moveData.z);
    const currentTime = Date.now();
    const timeSinceLastUpdate = (currentTime - playerMesh.userData.lastUpdateTime) / 1000;
    
    // Store previous position if we haven't already
    if (!playerMesh.userData.prevServerPosition) {
      playerMesh.userData.prevServerPosition = new THREE.Vector3(moveData.x, moveData.y, moveData.z);
      playerMesh.userData.prevServerTime = currentTime;
    }
    
    // Calculate server-reported velocity
    if (timeSinceLastUpdate > 0) {
      const serverVelocity = {
        x: (moveData.x - playerMesh.userData.prevServerPosition.x) / timeSinceLastUpdate,
        z: (moveData.z - playerMesh.userData.prevServerPosition.z) / timeSinceLastUpdate
      };
      
      // Store this velocity for prediction
      playerMesh.userData.serverVelocity = serverVelocity;
    }
    
    // Update previous server position
    playerMesh.userData.prevServerPosition = new THREE.Vector3(moveData.x, moveData.y, moveData.z);
    playerMesh.userData.prevServerTime = currentTime;
    
    // Check if we need to snap to new position (large change)
    const distanceDiff = playerMesh.position.distanceTo(newPosition);
    if (distanceDiff > POSITION_SNAP_THRESHOLD) {
      // Snap immediately to avoid huge interpolation lag
      playerMesh.position.copy(newPosition);
    }
    
    // Update target position for interpolation
    playerMesh.userData.targetPosition = newPosition;
    playerMesh.userData.lastUpdateTime = currentTime;
  };
  
  // Clean up player meshes that have been marked for removal
  const cleanupPlayerMeshes = () => {
    const removePlayerObject = (object: THREE.Object3D) => {
      // Remove timeout if it exists
      if (object.userData.disappearanceTimeout) {
        clearTimeout(object.userData.disappearanceTimeout);
      }
      
      // Remove from scene
      scene.remove(object);
      
      // Dispose geometry and materials
      if ((object as THREE.Mesh).geometry) {
        (object as THREE.Mesh).geometry.dispose();
      }
      
      if ((object as THREE.Mesh).material) {
        if (Array.isArray((object as THREE.Mesh).material)) {
          ((object as THREE.Mesh).material as THREE.Material[]).forEach(m => m.dispose());
        } else {
          ((object as THREE.Mesh).material as THREE.Material).dispose();
        }
      }
      
      // Remove name label if it exists
      if (object.userData.playerId) {
        if (nameLabelsRef.current.has(object.userData.playerId)) {
          const label = nameLabelsRef.current.get(object.userData.playerId);
          if (label) {
            if (label.parent) {
              label.parent.remove(label);
            }
            scene.remove(label);
            nameLabelsRef.current.delete(object.userData.playerId);
          }
        }
      }
    };
    
    // Check all player meshes for cleanup
    playersRef.current.forEach((playerMesh, playerId) => {
      if (playerMesh.userData.markedForCleanup) {
        removePlayerObject(playerMesh);
        playersRef.current.delete(playerId);
      }
    });
  };
  
  // Initialize the manager
  useEffect(() => {
    onInit({
      createPlayerMesh,
      updateRemotePlayerPositions,
      handlePlayerMove,
      cleanupPlayerMeshes
    });
  }, []);
  
  return null; // This component doesn't render anything visible
};

export default RemotePlayerManager; 