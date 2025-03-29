import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { getSocket } from './socket';
import { Player } from '../../types/player';
import soundManager from '../audio/soundManager';
import WorldManager, { WORLD_BOUNDS } from '../world/WorldManager';

// Add type definition for player move data
interface PlayerMoveData {
  id: string;
  x: number;
  y: number;
  z: number;
  timestamp?: number; // Make timestamp optional
}

// Position interpolation settings
const POSITION_SNAP_THRESHOLD = 5.0; // If discrepancy is larger than this, snap instantly

// Interface for socket handler options
interface SocketHandlerOptions {
  scene: THREE.Scene;
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  playersRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  nameLabelsRef: React.MutableRefObject<Map<string, CSS2DObject>>;
  worldManagerRef: React.MutableRefObject<WorldManager | null>;
  itemManagerRef?: React.MutableRefObject<any | null>; // Add itemManagerRef as optional
  cleanupIntervalRef: React.MutableRefObject<NodeJS.Timeout | null>;
  setPlayerName: (name: string) => void;
  createNameLabel: (name: string, mesh: THREE.Mesh) => CSS2DObject;
  setPlayerCount?: (count: number) => void; // Add setPlayerCount callback
}

// Setup socket event listeners and return cleanup function
export const setupSocketListeners = async ({
  scene,
  playerRef,
  playersRef,
  nameLabelsRef,
  worldManagerRef,
  itemManagerRef,
  cleanupIntervalRef,
  setPlayerName,
  createNameLabel,
  setPlayerCount
}: SocketHandlerOptions) => {
  const socket = await getSocket();
  if (!socket) return () => {};

  // Setup position correction handler
  setupPositionCorrectionHandler(socket, playerRef);

  // Function to create a player mesh
  const createPlayerMesh = (player: Player) => {
    // First check if this is the player's own character
    if (socket.id === player.id) {
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
    
    // Add name label
    createNameLabel(player.name, otherPlayerMesh);
    
    // Add to scene
    scene.add(otherPlayerMesh);
    
    // Store in players map
    playersRef.current.set(player.id, otherPlayerMesh);
    
    console.log(`Player mesh created and added to tracking for ${player.id}`, {
      meshCreated: !!otherPlayerMesh,
      position: otherPlayerMesh.position,
      inTrackingMap: playersRef.current.has(player.id),
      trackedMeshId: playersRef.current.get(player.id)?.id
    });
    
    return otherPlayerMesh;
  };

  // Add a function to perform thorough player mesh cleanup to prevent duplicates
  const cleanupPlayerMeshes = () => {
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
    
    // Get a list of valid player IDs we should keep (all players currently in the game)
    const validPlayerIds = new Set<string>();
    // Add IDs from our player reference map
    playersRef.current.forEach((_, id) => validPlayerIds.add(id));
    // Always consider our own player ID valid
    if (socket.id) validPlayerIds.add(socket.id);
    
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
    
    // Process objects by player ID to handle cleanup
    playerIdToObjects.forEach((objects, playerId) => {
      // If this player ID is no longer valid, remove ALL its objects
      if (!validPlayerIds.has(playerId)) {
        objects.forEach(removePlayerObject);
        
        // Also make sure it's removed from our playersRef
        playersRef.current.delete(playerId);
        
        // And from name labels
        if (nameLabelsRef.current.has(playerId)) {
          const label = nameLabelsRef.current.get(playerId);
          if (label) {
            if (label.parent) {
              label.parent.remove(label);
            }
            scene.remove(label);
            nameLabelsRef.current.delete(playerId);
          }
        }
      } else if (playerId === socket.id) {
        // This is our own player, we should only have our main player mesh
        objects.forEach(obj => {
          if (obj !== playerRef.current) {
            removePlayerObject(obj);
          }
        });
      } else {
        // This is another player, we should only have one main mesh per player
        const trackedMesh = playersRef.current.get(playerId);
        if (trackedMesh) {
          objects.forEach(obj => {
            if (obj !== trackedMesh && obj.type === 'Mesh') {
              removePlayerObject(obj);
            }
          });
        }
      }
    });
    
    // Check for orphaned name labels (not attached to any player)
    nameLabelsRef.current.forEach((label, playerId) => {
      if (!playerIdToObjects.has(playerId)) {
        if (label.parent) {
          label.parent.remove(label);
        }
        scene.remove(label);
        nameLabelsRef.current.delete(playerId);
      }
    });
  };

  // Handle player count updates
  socket.on('playerCount', (data: { count: number }) => {
    console.log('Received player count update:', data.count);
    if (setPlayerCount) {
      setPlayerCount(data.count);
    }
  });

  // Handle initial players
  socket.on('initPlayers', (players) => {
    // Run cleanup to remove any potential duplicates before adding new players
    cleanupPlayerMeshes();
    
    // Store the player's own ID when receiving initial players
    // This helps differentiate the local player from others
    if (!socket.id) {
      console.warn('Socket ID not available when initializing players');
    } else {
      // Set player name from the player data if it exists
      const ownPlayerData = players.find(p => p.id === socket.id);
      if (ownPlayerData) {
        setPlayerName(ownPlayerData.name);
      }
    }
    
    // Log all players for debugging
    console.log('All players in initPlayers:', {
      count: players.length,
      ids: players.map(p => p.id),
      socketId: socket.id
    });
    
    // Add each existing player to the scene
    players.forEach(player => {
      // Skip creating a mesh for the current player to avoid duplication
      if (player.id === socket.id) {
        // Position the local player at their saved position
        if (playerRef.current) {
          playerRef.current.position.set(player.x, player.y, player.z);
          
          // Store player data in userData
          playerRef.current.userData.playerId = player.id;
          playerRef.current.userData.playerName = player.name;
        }
        return;
      }
      
      // Create player mesh
      createPlayerMesh(player);
    });
    
    // Log player tracking state after initialization
    console.log('Player tracking state after init:', {
      trackedPlayers: Array.from(playersRef.current.keys()),
      count: playersRef.current.size
    });
  });
  
  // Handle new player joins
  socket.on('playerJoined', (player) => {
    // Play sound for new player joining
    soundManager.play('playerJoin');
    
    // Check if this is the local player (shouldn't happen but as a safety measure)
    if (player.id === socket.id) {
      // Update local player position instead of creating a new mesh
      if (playerRef.current) {
        playerRef.current.position.set(player.x, player.y, player.z);
        
        // Ensure player name is set
        setPlayerName(player.name);
        
        // Update player data in userData
        playerRef.current.userData.playerId = player.id;
        playerRef.current.userData.playerName = player.name;
      }
      return;
    }
    
    // Log current players before adding new one for debugging
    console.log('Player tracking BEFORE adding new player:', {
      trackedPlayers: Array.from(playersRef.current.keys()),
      count: playersRef.current.size
    });
    
    // Check if we already have this player in our map and remove it first
    if (playersRef.current.has(player.id)) {
      // Remove any CSS2DObjects first
      const existingMesh = playersRef.current.get(player.id);
      if (existingMesh) {
        // Remove any CSS2DObjects first
        existingMesh.traverse((child) => {
          if ((child as any).isCSS2DObject) {
            if (child.parent) {
              child.parent.remove(child);
            }
            scene.remove(child);
          }
        });
        
        // Clean up resources
        if ((existingMesh as THREE.Mesh).geometry) {
          (existingMesh as THREE.Mesh).geometry.dispose();
        }
        if ((existingMesh as THREE.Mesh).material) {
          if (Array.isArray((existingMesh as THREE.Mesh).material)) {
            ((existingMesh as THREE.Mesh).material as THREE.Material[]).forEach(m => m.dispose());
          } else {
            ((existingMesh as THREE.Mesh).material as THREE.Material).dispose();
          }
        }
        
        // Remove from scene
        scene.remove(existingMesh);
        playersRef.current.delete(player.id);
      }
    }
    
    // Always use createPlayerMesh which handles existing players properly
    const createdMesh = createPlayerMesh(player);
    
    // Verify the player was properly added
    console.log('Player tracking AFTER adding new player:', {
      trackedPlayers: Array.from(playersRef.current.keys()),
      playerAdded: playersRef.current.has(player.id),
      meshCreated: !!createdMesh
    });
  });
  
  // Handle player disconnects
  socket.on('playerLeft', (playerId) => {
    // Skip if this is the local player ID (we shouldn't remove ourselves)
    if (playerId === socket.id) {
      console.warn('Received playerLeft for local player, ignoring');
      return;
    }
    
    // First, remove any name label from our tracking map and the scene
    if (nameLabelsRef.current.has(playerId)) {
      const label = nameLabelsRef.current.get(playerId);
      if (label) {
        // Remove from parent if it has one
        if (label.parent) {
          label.parent.remove(label);
        }
        // Also remove from scene directly to be sure
        scene.remove(label);
      }
      // Remove from our map
      nameLabelsRef.current.delete(playerId);
    }
    
    // Remove player mesh from scene
    const playerMesh = playersRef.current.get(playerId);
    if (playerMesh) {
      // First remove any attached CSS2DObjects directly
      const childrenToRemove: THREE.Object3D[] = [];
      playerMesh.traverse((child) => {
        if ((child as any).isCSS2DObject) {
          childrenToRemove.push(child);
        }
      });
      
      // Remove the children outside the traversal
      childrenToRemove.forEach(child => {
        if (child.parent) {
          child.parent.remove(child);
        }
        scene.remove(child);
      });
      
      // Clean up any object data
      if (playerMesh.geometry) playerMesh.geometry.dispose();
      if (Array.isArray(playerMesh.material)) {
        playerMesh.material.forEach(material => material.dispose());
      } else if (playerMesh.material) {
        playerMesh.material.dispose();
      }
      
      // Remove from scene
      scene.remove(playerMesh);
      playersRef.current.delete(playerId);
    }
    
    // Additional safety check - look for any orphaned labels in the scene
    scene.traverse((object) => {
      if ((object as any).isCSS2DObject && 
          object.userData && 
          object.userData.forPlayer === playerId) {
        if (object.parent) {
          object.parent.remove(object);
        }
        scene.remove(object);
      }
    });
  });
  
  // Handle player sync request from server - compare local tracking to server's list of player IDs
  socket.on('checkPlayersSync', (playerIds, callback) => {
    console.log('Received checkPlayersSync request:', {
      serverPlayerIds: playerIds,
      localPlayerIds: Array.from(playersRef.current.keys())
    });
    
    // Find players that we're missing locally (on server but not tracked locally)
    const missingPlayerIds = playerIds.filter(id => !playersRef.current.has(id));
    
    // Send back the list of missing players
    callback(missingPlayerIds);
  });
  
  // Handle player movements
  socket.on('playerMoved', (data: PlayerMoveData) => {
    // Add verbose logging for debugging
    console.log('Received playerMoved event:', {
      playerId: data.id,
      position: { x: data.x, y: data.y, z: data.z },
      playerExists: playersRef.current.has(data.id),
      totalPlayers: playersRef.current.size
    });
    
    // Skip if this is our own player ID - we shouldn't move ourselves based on server events
    // This is a fallback in case we broadcast to all instead of socket.broadcast
    if (data.id === socket.id || data.id === 'TEST-' + socket.id) {
      return;
    }
    
    // Update the position of the moved player
    const playerMesh = playersRef.current.get(data.id);
    if (playerMesh) {
      // Ensure received positions are within bounds before applying
      const validX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, data.x));
      const validZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, data.z));
      
      // Get the server timestamp or use current time
      const serverTime = data.timestamp || Date.now();
      
      // Calculate network latency if timestamp is provided
      let estimatedLatency = 0;
      if (data.timestamp) {
        estimatedLatency = Date.now() - data.timestamp;
        // Cap latency compensation to reasonable values
        estimatedLatency = Math.min(estimatedLatency, 200);
      }
      
      // Store previous target for velocity calculation if we don't have it
      if (!playerMesh.userData.prevTargetPosition) {
        playerMesh.userData.prevTargetPosition = playerMesh.userData.targetPosition 
          ? playerMesh.userData.targetPosition.clone() 
          : new THREE.Vector3(validX, data.y, validZ);
        playerMesh.userData.prevTargetTime = playerMesh.userData.lastUpdateTime || Date.now() - 100;
      }
      
      const newTargetPosition = new THREE.Vector3(validX, data.y, validZ);
      
      // Calculate distance to current position to detect large discrepancies
      const currentPosition = playerMesh.position;
      const distanceToTarget = currentPosition.distanceTo(newTargetPosition);
      
      // If the discrepancy is too large, snap immediately to avoid visible "teleporting"
      if (distanceToTarget > POSITION_SNAP_THRESHOLD) {
        playerMesh.position.copy(newTargetPosition);
        
        // Also reset velocity for a fresh start
        playerMesh.userData.velocity = { x: 0, z: 0 };
      }
      
      // Set target position for interpolation
      playerMesh.userData.targetPosition = newTargetPosition;
      playerMesh.userData.lastUpdateTime = Date.now();
      
      // Store previous target for next velocity calculation
      if (playerMesh.userData.prevTargetPosition) {
        const prevTarget = playerMesh.userData.prevTargetPosition;
        const timeDelta = (Date.now() - playerMesh.userData.prevTargetTime) / 1000;
        
        if (timeDelta > 0) {
          // Calculate and store velocity based on target positions (not actual positions)
          // This is more accurate for prediction
          playerMesh.userData.serverVelocity = {
            x: (newTargetPosition.x - prevTarget.x) / timeDelta,
            z: (newTargetPosition.z - prevTarget.z) / timeDelta
          };
          
          // Update previous target data
          playerMesh.userData.prevTargetPosition = newTargetPosition.clone();
          playerMesh.userData.prevTargetTime = Date.now();
        }
      }
      
      // Reset disappearance timer whenever we get a position update
      if (playerMesh.userData.disappearanceTimeout) {
        clearTimeout(playerMesh.userData.disappearanceTimeout);
      }
      
      // Set a new disappearance timeout - if we don't hear from this player for 30 seconds,
      // we'll mark them for cleanup
      playerMesh.userData.disappearanceTimeout = setTimeout(() => {
        playerMesh.userData.markedForCleanup = true;
      }, 30000);
    } else {
      console.warn(`Could not find player mesh for ID: ${data.id}. Attempting to create it.`);
      
      // This case can happen if we receive a playerMoved event before playerJoined
      // Try to fetch the player from the server to create the mesh
      socket.emit('getPlayerData', data.id, (playerData) => {
        if (playerData) {
          const createdMesh = createPlayerMesh(playerData);
          
          // Set initial target position for the newly created player
          if (createdMesh) {
            createdMesh.userData.targetPosition = new THREE.Vector3(data.x, data.y, data.z);
            createdMesh.userData.lastUpdateTime = Date.now();
            
            // Set disappearance timeout
            createdMesh.userData.disappearanceTimeout = setTimeout(() => {
              createdMesh.userData.markedForCleanup = true;
            }, 30000);
          }
        } else {
          // If server doesn't respond with player data, create a minimal player object
          const minimalPlayer = {
            id: data.id,
            name: `Player-${data.id.substring(0, 4)}`,
            x: data.x,
            y: data.y,
            z: data.z,
            userId: ''
          };
          const createdMesh = createPlayerMesh(minimalPlayer);
          
          // Set initial target position for the newly created player
          if (createdMesh) {
            createdMesh.userData.targetPosition = new THREE.Vector3(data.x, data.y, data.z);
            createdMesh.userData.lastUpdateTime = Date.now();
            
            // Set disappearance timeout
            createdMesh.userData.disappearanceTimeout = setTimeout(() => {
              createdMesh.userData.markedForCleanup = true;
            }, 30000);
          }
        }
      });
    }
  });
  
  // Handle item drops in the world
  socket.on('itemDropped', (data) => {
    // Play drop sound
    soundManager.play('itemDrop');
    
    // Use worldManager to add the item to the world
    if (worldManagerRef.current) {
      worldManagerRef.current.addWorldItem(data);
    }
  });
  
  // Handle item removals
  socket.on('itemRemoved', (dropId) => {
    // Use worldManager to remove the item
    if (worldManagerRef.current) {
      worldManagerRef.current.removeWorldItem(dropId);
    }
  });

  // Set up periodic cleanup to handle any ghost player meshes
  const cleanupInterval = setInterval(() => {
    if (socket.connected) {
      // Only run full cleanup check every 3 minutes (reduced frequency)
      const shouldRunFullCheck = Math.random() < 0.1; // 10% chance = every ~10 checks
      
      if (shouldRunFullCheck) {
        // Check for players marked for cleanup due to inactivity
        const inactivePlayers: string[] = [];
        
        playersRef.current.forEach((playerMesh, playerId) => {
          // Only clean up players that have been explicitly marked as inactive
          if (playerMesh.userData.markedForCleanup === true) {
            inactivePlayers.push(playerId);
          }
        });
        
        if (inactivePlayers.length > 0) {
          // Since checkPlayersPresence isn't defined, let's use getPlayerData instead
          // to check one player at a time - if data comes back, they're still active
          const checkPlayerStatus = async () => {
            const disconnectedPlayerIds: string[] = [];
            
            // Check each inactive player one by one
            for (const playerId of inactivePlayers) {
              try {
                // Try to get the player data - if this succeeds, they're still connected
                await new Promise<void>((resolve, reject) => {
                  socket.emit('getPlayerData', playerId, (playerData: any) => {
                    if (playerData) {
                      // Player still exists on server, not disconnected
                      resolve();
                    } else {
                      // Player doesn't exist on server, mark as disconnected
                      disconnectedPlayerIds.push(playerId);
                      resolve();
                    }
                  });
                  
                  // Set a timeout in case the callback never fires
                  setTimeout(() => {
                    disconnectedPlayerIds.push(playerId);
                    resolve();
                  }, 1000);
                });
              } catch (error) {
                console.error(`Error checking player ${playerId}:`, error);
                // In case of error, assume disconnected to be safe
                disconnectedPlayerIds.push(playerId);
              }
            }
            
            // Now handle the disconnected players
            if (disconnectedPlayerIds.length > 0) {
              disconnectedPlayerIds.forEach(playerId => {
                const playerMesh = playersRef.current.get(playerId);
                if (playerMesh) {
                  // Clean up any timeouts
                  if (playerMesh.userData.disappearanceTimeout) {
                    clearTimeout(playerMesh.userData.disappearanceTimeout);
                  }
                  
                  // Clean up any child objects
                  playerMesh.traverse((child) => {
                    if ((child as any).isCSS2DObject) {
                      if (child.parent) {
                        child.parent.remove(child);
                      }
                      scene.remove(child);
                    }
                  });
                  
                  // Clean up resources
                  if ((playerMesh as THREE.Mesh).geometry) {
                    (playerMesh as THREE.Mesh).geometry.dispose();
                  }
                  if ((playerMesh as THREE.Mesh).material) {
                    if (Array.isArray((playerMesh as THREE.Mesh).material)) {
                      ((playerMesh as THREE.Mesh).material as THREE.Material[]).forEach(m => m.dispose());
                    } else {
                      ((playerMesh as THREE.Mesh).material as THREE.Material).dispose();
                    }
                  }
                  
                  // Remove from scene
                  scene.remove(playerMesh);
                  playersRef.current.delete(playerId);
                  
                  // Also remove from name labels
                  if (nameLabelsRef.current.has(playerId)) {
                    const label = nameLabelsRef.current.get(playerId);
                    if (label) {
                      if (label.parent) {
                        label.parent.remove(label);
                      }
                      scene.remove(label);
                      nameLabelsRef.current.delete(playerId);
                    }
                  }
                }
              });
            } else {
              // Reset marked for cleanup for all players since they're still connected
              inactivePlayers.forEach(playerId => {
                const playerMesh = playersRef.current.get(playerId);
                if (playerMesh) {
                  playerMesh.userData.markedForCleanup = false;
                  
                  // Reset disappearance timeout
                  if (playerMesh.userData.disappearanceTimeout) {
                    clearTimeout(playerMesh.userData.disappearanceTimeout);
                  }
                  playerMesh.userData.disappearanceTimeout = setTimeout(() => {
                    playerMesh.userData.markedForCleanup = true;
                  }, 30000);
                }
              });
            }
          };
          
          // Run the check
          checkPlayerStatus();
        }
        
        // Check for duplicate player meshes in the scene as a second cleanup step
        const playerIdCounts = new Map<string, number>();
        const duplicatePlayerIds = new Set<string>();
        
        // Count how many meshes exist per player ID
        scene.traverse((object) => {
          if (object.userData && object.userData.playerId && object.type === 'Mesh') {
            const playerId = object.userData.playerId;
            playerIdCounts.set(playerId, (playerIdCounts.get(playerId) || 0) + 1);
            
            // If we found more than one mesh for this player, it's a duplicate
            if (playerIdCounts.get(playerId)! > 1) {
              duplicatePlayerIds.add(playerId);
            }
          }
        });
        
        // Handle any duplicates found
        if (duplicatePlayerIds.size > 0) {
          duplicatePlayerIds.forEach(playerId => {
            const trackedMesh = playersRef.current.get(playerId);
            if (!trackedMesh) return; // Skip if we don't have this player tracked anymore
            
            const duplicateMeshes: THREE.Object3D[] = [];
            
            // Find all meshes with this player ID
            scene.traverse((object) => {
              if (object.userData && 
                  object.userData.playerId === playerId && 
                  object.type === 'Mesh' && 
                  object !== trackedMesh) {
                duplicateMeshes.push(object);
              }
            });
            
            // Remove the duplicates
            if (duplicateMeshes.length > 0) {
              duplicateMeshes.forEach(mesh => {
                // Clean up any child objects
                mesh.traverse((child) => {
                  if ((child as any).isCSS2DObject) {
                    if (child.parent) {
                      child.parent.remove(child);
                    }
                    scene.remove(child);
                  }
                });
                
                // Clean up resources
                if ((mesh as THREE.Mesh).geometry) {
                  (mesh as THREE.Mesh).geometry.dispose();
                }
                if ((mesh as THREE.Mesh).material) {
                  if (Array.isArray((mesh as THREE.Mesh).material)) {
                    ((mesh as THREE.Mesh).material as THREE.Material[]).forEach(m => m.dispose());
                  } else {
                    ((mesh as THREE.Mesh).material as THREE.Material).dispose();
                  }
                }
                
                // Remove from scene
                scene.remove(mesh);
              });
            }
          });
        }
      }
    }
  }, 180000); // Run cleanup check every 3 minutes
  
  // Store the interval for cleanup
  cleanupIntervalRef.current = cleanupInterval;

  // Return cleanup function
  return () => {
    // Remove socket event listeners
    socket.off('initPlayers');
    socket.off('playerJoined');
    socket.off('playerLeft');
    socket.off('playerMoved');
    socket.off('itemDropped');
    socket.off('itemRemoved');
    socket.off('checkPlayersSync');

    // Clear the cleanup interval
    if (cleanupIntervalRef.current) {
      clearInterval(cleanupIntervalRef.current);
      cleanupIntervalRef.current = null;
    }
  };
};

// We don't need to export cleanupPlayerMeshes since it's only used internally 

// Add handler for position correction events from the server
// This ensures client position state stays in sync with server
// Especially when the server rejects a reset to the default position
export const setupPositionCorrectionHandler = (socket: any, playerRef: React.MutableRefObject<THREE.Mesh | null>) => {
  socket.on('positionCorrection', (position: { x: number, y: number, z: number }) => {
    console.log('Received position correction from server:', position);
    
    if (playerRef.current) {
      // Update the player's position to match the server's corrected position
      playerRef.current.position.set(position.x, position.y, position.z);
      
      // Update client-side state
      console.log('Applied position correction from server');
    }
  });
}; 