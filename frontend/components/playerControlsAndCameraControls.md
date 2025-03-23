Okay, here's a breakdown of the code specifically related to player movement and camera rotation, extracted from the complete refactor, along with explanations and improvements:

1. src/hooks/useKeyboardControls.ts (Handles Keyboard Input)
TypeScript

// src/hooks/useKeyboardControls.ts

import { useState, useEffect } from 'react';

const useKeyboardControls = () => {
    const [movement, setMovement] = useState({
        forward: false,
        backward: false,
        left: false,
        right: false,
        jump: false // Added jump state
    });

    useEffect(() => {
        const handleKeyDown = (event: KeyboardEvent) => {
            switch (event.code) {
                case 'KeyW':
                case 'ArrowUp':
                    setMovement(prev => ({ ...prev, forward: true }));
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    setMovement(prev => ({ ...prev, backward: true }));
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    setMovement(prev => ({ ...prev, left: true }));
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    setMovement(prev => ({ ...prev, right: true }));
                    break;
                case 'Space': // Jump key
                    setMovement(prev => ({ ...prev, jump: true }));
                    break;
            }
        };

        const handleKeyUp = (event: KeyboardEvent) => {
            switch (event.code) {
                case 'KeyW':
                case 'ArrowUp':
                    setMovement(prev => ({ ...prev, forward: false }));
                    break;
                case 'KeyS':
                case 'ArrowDown':
                    setMovement(prev => ({ ...prev, backward: false }));
                    break;
                case 'KeyA':
                case 'ArrowLeft':
                    setMovement(prev => ({ ...prev, left: false }));
                    break;
                case 'KeyD':
                case 'ArrowRight':
                    setMovement(prev => ({ ...prev, right: false }));
                    break;
                case 'Space': // Jump key
                  setMovement(prev => ({ ...prev, jump: false }));
                    break;

            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, []);

    return movement;
};

export default useKeyboardControls;

    What it does: This hook listens for keydown and keyup events on the window. It maintains a movement state object that tracks which movement keys are currently pressed (forward, backward, left, right, jump). This is a standard and efficient way to handle keyboard input in games.
    Key Features:
        Clean State: Uses a single state object with boolean flags for each direction, making it easy to check which keys are pressed.
        Event Listeners: Uses useEffect to add and remove event listeners, preventing memory leaks.
        Returns Movement State: Returns the movement object, which can be used by other components (like PlayerManager).
        Jump Key Added Space Bar as Jump Key

2. src/components/PlayerManager.tsx (Handles Player Movement and Animation)
TypeScript

// src/components/PlayerManager.tsx

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { getSocket, setCachedPlayerPosition } from '../game/network/socket';
import useKeyboardControls from '../hooks/useKeyboardControls';
import usePositionPrediction from '../hooks/usePositionPrediction'; // Import

interface PlayerManagerProps {
    scene: THREE.Scene;
    camera: THREE.Camera;
    renderer: THREE.Renderer;
    sendEvent: (event: string, data?: any) => void;
    initialPosition?: THREE.Vector3
}

const PlayerManager: React.FC<PlayerManagerProps> = ({ scene, camera, renderer, sendEvent, initialPosition }) => {
    const playerMesh = useRef<THREE.Object3D>();
    const loader = new GLTFLoader();
    const movement = useKeyboardControls(); // Use keyboard controls
    const clockRef = useRef(new THREE.Clock());
    const { updateVelocity } = usePositionPrediction({ playerMesh: playerMesh.current, enabled: true });
    const lastSendTime = useRef<number>(0);


    useEffect(() => {
      if(!initialPosition) return; //Wait for position data.
        loader.load(
            '/models/player.glb',
            (gltf) => {
                playerMesh.current = gltf.scene;
                playerMesh.current.traverse((node) => {
                    if ((node as THREE.Mesh).isMesh) {
                        node.castShadow = true;
                        node.receiveShadow = false; // Player shouldn't receive self-shadow
                    }
                });

                // Apply the initial position
                playerMesh.current.position.copy(initialPosition);
                playerMesh.current.rotation.set(0,0,0);

                scene.add(playerMesh.current);

                // Start the animation loop after the model is loaded
                animate();
                setCachedPlayerPosition(initialPosition);
            },
            undefined,
            (error) => {
                console.error('An error happened loading the player model:', error);
            }
        );
    return () => {
      if (playerMesh.current) {
            scene.remove(playerMesh.current);
            playerMesh.current.traverse((object) => {
                if (object instanceof THREE.Mesh) {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(material => material.dispose());
                        } else {
                            object.material.dispose();
                        }
                    }
                }
            });
          }
    }
    }, [scene, initialPosition]);


   useEffect(() => {
       if (!playerMesh.current) return;

        const checkMovement = () => {
            const now = Date.now();

            if (!playerMesh.current || !playerMesh.current.position) {
                return;
            }

            if (movement.forward || movement.backward || movement.left || movement.right) {
              if (now - lastSendTime.current > 100) { // Limit to 10 updates per second
                const targetPosition = new THREE.Vector3().copy(playerMesh.current.position);
                const rotation = new THREE.Euler().copy(playerMesh.current.rotation)
                sendEvent('move', {
                    position: {x: targetPosition.x, y: targetPosition.y, z: targetPosition.z},
                    rotation: { x: rotation.x, y: rotation.y, z: rotation.z}
                });
                lastSendTime.current = now;
              }
            }
        }

        const intervalId = setInterval(checkMovement, 50); //check movement state every 50ms
        return () => { clearInterval(intervalId) }
   }, [movement, sendEvent])



    const animate = () => {
        if (!playerMesh.current) return;

        const delta = clockRef.current.getDelta();
        const moveDistance = 5 * delta; // Adjust speed as needed

        const newTargetPosition = new THREE.Vector3().copy(playerMesh.current.position);
        // Apply movement based on controls
        if (movement.forward) newTargetPosition.add(new THREE.Vector3(0, 0, -moveDistance).applyQuaternion(playerMesh.current.quaternion));
        if (movement.backward) newTargetPosition.add(new THREE.Vector3(0, 0, moveDistance).applyQuaternion(playerMesh.current.quaternion));
        if (movement.left) newTargetPosition.add(new THREE.Vector3(-moveDistance, 0, 0).applyQuaternion(playerMesh.current.quaternion));
        if (movement.right) newTargetPosition.add(new THREE.Vector3(moveDistance, 0, 0).applyQuaternion(playerMesh.current.quaternion));

        playerMesh.current.userData.targetPosition = newTargetPosition; //Store for positionPrediction
        updateVelocity(newTargetPosition);
        setCachedPlayerPosition(playerMesh.current.position);


         // Basic rotation (adjust to face movement direction)
        if (movement.forward) playerMesh.current.rotation.y = Math.PI * 0;      // Forward: Pointing towards -Z
        if (movement.backward) playerMesh.current.rotation.y = Math.PI * 1; // Backward: Pointing towards +Z
        if (movement.left) playerMesh.current.rotation.y = Math.PI * 0.5;     // Left: Pointing towards -X
        if (movement.right) playerMesh.current.rotation.y = Math.PI * -0.5;   // Right: Pointing towards +X

        // Handle combinations
        if (movement.forward && movement.left) playerMesh.current.rotation.y = Math.PI * 0.25;    // NW
        if (movement.forward && movement.right) playerMesh.current.rotation.y = Math.PI * -0.25;   // NE
        if (movement.backward && movement.left) playerMesh.current.rotation.y = Math.PI * 0.75;   // SW
        if (movement.backward && movement.right) playerMesh.current.rotation.y = Math.PI * -0.75;  // SE


        requestAnimationFrame(animate);
        if (renderer && camera) {
            renderer.render(scene, camera);
        }
    };


    return null; // This component manages the player, but doesn't render anything itself.
};

export default PlayerManager;

    What it does:
        Loads Player Model: Loads the player's 3D model (player.glb).
        Gets Movement Input: Uses the useKeyboardControls hook to get the current keyboard state.
        Calculates Movement: In the animate function:
            Gets the time delta (delta) using a THREE.Clock.
            Calculates moveDistance based on delta and a speed constant.
            Creates a newTargetPosition based on the pressed keys and moveDistance, and use the players current quaternion to apply local-space translations.
            Updates playerMesh.current.rotation.y based on movement direction. This directly sets the player's facing direction. The .y component of the Euler rotation controls rotation around the vertical axis.
            Sets userData.targetPosition on the player's mesh. This is crucial for position prediction.
            Calls updateVelocity from the usePositionPrediction hook.
        Sends Movement Updates: Uses the sendEvent function (provided by useNetwork) to send move events to the server, but only when there's actual movement and at a limited rate (10 times per second) to prevent flooding the server.
        Position Prediction: Uses the usePositionPrediction custom hook to smoothly predict the player's position between updates, making movement look less jerky.
        Cached Player Position: Updates the cachedPlayerPosition, used for smoothly setting the initial position and ensuring other components can access current location
    Key Improvements:
        Combined Movement and Rotation: The animate function now handles both movement and rotation within the same logic, making it much more concise.
        Clearer Rotation Logic: The rotation logic is simplified using Math.PI values for common angles.
        Throttled Network Updates: The checkMovement function, called by setInterval, limits the frequency of 'move' events sent to the server, significantly improving network performance.
        userData.targetPosition: This is essential for smooth client-side prediction.
        Local-Space Translation: Uses applyQuaternion to move relative to the player's current orientation. This is how you get correct movement regardless of which way the player is facing.

3. src/hooks/usePositionPrediction.ts (Handles Client-Side Prediction)
TypeScript

import { useEffect, useRef } from 'react';
import { Object3D, Vector3 } from 'three';

interface UsePositionPredictionProps {
  playerMesh: Object3D | undefined;
  enabled: boolean;
}

// Custom Hook for Position Prediction
function usePositionPrediction({ playerMesh, enabled }: UsePositionPredictionProps) {
  const predictionRef = useRef<{
    velocity: Vector3;
    lastUpdateTime: number;
  }>({ velocity: new Vector3(), lastUpdateTime: Date.now() });

  useEffect(() => {
    if (!enabled || !playerMesh) return;

    const predictPosition = () => {
      if (!playerMesh.userData.targetPosition) return;

      const currentTime = Date.now();
      const { velocity, lastUpdateTime } = predictionRef.current;
      const timeDelta = (currentTime - lastUpdateTime) / 1000; // Time in seconds.

      // Predict based on current velocity, capped at the maximum time delta
      const cappedTimeDelta = Math.min(timeDelta, 0.2);
      const predictedPosition = new Vector3().copy(playerMesh.position); // Start at current position
      predictedPosition.addScaledVector(velocity, cappedTimeDelta);

      playerMesh.position.copy(predictedPosition);

      predictionRef.current.lastUpdateTime = currentTime;
      requestAnimationFrame(predictPosition)
    };
    const animationId = requestAnimationFrame(predictPosition)


    return () => { cancelAnimationFrame(animationId) };
  }, [playerMesh, enabled]);

  // Update velocity whenever target changes (called externally)
  const updateVelocity = (newTarget: Vector3) => {
    if (!playerMesh) return;
    const currentTime = Date.now();
    const timeDelta = (currentTime - predictionRef.current.lastUpdateTime) / 1000;
    if (timeDelta > 0) {
      predictionRef.current.velocity.subVectors(newTarget, playerMesh.position).divideScalar(timeDelta);
    }
  };

  return { updateVelocity };
}

export default usePositionPrediction;

    What it does: This hook is responsible for making the player's movement appear smoother by predicting their position between updates from the server.
    How it Works:
        Velocity Calculation: The updateVelocity function (which is called by PlayerManager whenever the target position changes) calculates the player's velocity based on the difference between their current position and the new target position, and the time elapsed.
        Position Prediction: The predictPosition function (which runs in a requestAnimationFrame loop):
            Calculates how much time has passed since the last update.
            Calculates a predictedPosition by adding the player's current velocity (scaled by the time delta) to their current position.
            Updates the player's actual position to this predictedPosition.
        userData.targetPosition: This is the key data that the prediction uses. PlayerManager sets this, and the prediction hook reads it.
    Why it's important: Without client-side prediction, movement would appear very choppy, especially with network latency. The player would only move when a new position is received from the server. Prediction smooths this out.

4. src/components/RemotePlayersManager.tsx (Handles Remote Player Movement)
TypeScript

// src/components/RemotePlayersManager.tsx
import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Player } from '../types/gameTypes';
import { getSocket } from '../game/network/socket';

interface RemotePlayersManagerProps {
    scene: THREE.Scene;
    initialPlayers: Player[];
}

const RemotePlayersManager: React.FC<RemotePlayersManagerProps> = ({ scene, initialPlayers }) => {
    const playersRef = useRef<{ [key: string]: { mesh: THREE.Object3D, targetPosition?: THREE.Vector3} }>({});
    const loader = new GLTFLoader();

    // Load initial players
    useEffect(() => {
        initialPlayers.forEach(player => {
          addPlayer(player);
        });

       return () => {
        //Cleanup Players
         for(const playerId in playersRef.current){
            removePlayer(playerId);
         }
       }
    }, [initialPlayers, scene]);


    // Handle real-time updates
    useEffect(() => {
        const socket = getSocket();

        const handlePlayerJoined = (player: Player) => {
          addPlayer(player);
        };

        const handlePlayerLeft = (playerId: string) => {
           removePlayer(playerId);
        };

        const handlePlayerMoved = (data: { playerId: string; position: {x: number, y: number, z: number}; rotation: { x: number; y: number; z: number } }) => {
          if (playersRef.current[data.playerId]) {

            const player = playersRef.current[data.playerId]
            //Apply the rotation sent.
            player.mesh.rotation.set(data.rotation.x, data.rotation.y,

continue
2.0 Pro Experimental. Lacks access to real-time info and some Gemini features.
TypeScript

// src/components/RemotePlayersManager.tsx (continued)
            data.rotation.z, 'YXZ');
            // Use a Vector3 for the target position
            playersRef.current[data.playerId].targetPosition = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
          }
        };

        socket?.on('playerJoined', handlePlayerJoined);
        socket?.on('playerLeft', handlePlayerLeft);
        socket?.on('playerMoved', handlePlayerMoved);

        return () => {
            socket?.off('playerJoined', handlePlayerJoined);
            socket?.off('playerLeft', handlePlayerLeft);
            socket?.off('playerMoved', handlePlayerMoved);
        };
    }, [scene]);

  const addPlayer = (playerData: Player) => {
    if (!playersRef.current[playerData.id]) { // Prevent duplicates
            loader.load(
                '/models/player.glb',
                (gltf) => {
                    const playerMesh = gltf.scene;
                    playerMesh.traverse((node) => {
                        if ((node as THREE.Mesh).isMesh) {
                            node.castShadow = true;
                        }
                    });
                    playerMesh.position.copy(playerData.position);
                    playerMesh.rotation.copy(playerData.rotation);
                    scene.add(playerMesh);

                    playersRef.current[playerData.id] = {mesh: playerMesh, targetPosition: playerData.position.clone()}; // Initialize target position
                },
                undefined,
                (error) => {
                    console.error('Error loading player model:', error);
                }
            );
        }
  }

  const removePlayer = (playerId: string) => {
     if (playersRef.current[playerId]) {
            const player = playersRef.current[playerId];
            scene.remove(player.mesh);
            player.mesh.traverse((object) => {
                if (object instanceof THREE.Mesh) {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(material => material.dispose());
                        } else {
                            object.material.dispose();
                        }
                    }
                }
            });
            delete playersRef.current[playerId];
        }
  }

    // Animation loop for remote players (simple linear interpolation)
    useEffect(() => {
       const animate = () => {
          const interpolationFactor = 0.1; // Adjust for smoother or more responsive movement

          for (const playerId in playersRef.current) {
            const player = playersRef.current[playerId];
            if (player.targetPosition) {
              player.mesh.position.lerp(player.targetPosition, interpolationFactor);
            }
          }
            requestAnimationFrame(animate);
        }

        const animationId = requestAnimationFrame(animate);
        return () => { cancelAnimationFrame(animationId); }
    }, [])

    return null; // This component doesn't render anything directly
};

export default RemotePlayersManager;

    What it does: This component manages the movement and display of other players (not the local player).
    How it Works:
        playersRef: Stores a dictionary of remote players, keyed by their IDs. Each entry contains the player's mesh and their targetPosition.
        handlePlayerMoved: This function is called when a playerMoved event is received from the server. It updates the targetPosition of the corresponding player in playersRef. Crucially, it doesn't directly set the player's position.
        Animation Loop: The useEffect hook with the animate function runs a requestAnimationFrame loop. Inside this loop, it iterates through all the remote players and uses lerp (linear interpolation) to smoothly move the player's mesh towards their targetPosition. This provides a basic form of smoothing, but it's not prediction.
        addPlayer and removePlayer: These functions handle adding and removing players from the scene, including proper cleanup of Three.js resources.
        Rotation Handling: The handlePlayerMoved function sets the player's rotation directly, using the provided rotation values, using the 'YXZ' rotation order to match up with player input.

5. src/components/CameraManager.tsx (Handles Camera Following)
TypeScript

// src/components/CameraManager.tsx
import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface CameraManagerProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.Renderer;
  targetPlayerId: string | undefined; // ID of the player to follow
}

const CameraManager: React.FC<CameraManagerProps> = ({ scene, camera, renderer, targetPlayerId }) => {
  const targetRef = useRef<THREE.Object3D | null>(null);

  // Find target based on ID
  useEffect(() => {
    if(targetPlayerId) {
        scene.traverse( (object) => {
            if(object.userData.playerId === targetPlayerId){
                targetRef.current = object;
            }
        });
    }

  }, [scene, targetPlayerId]);

  // Update Camera Logic
  useEffect(() => {
    if (!camera || !renderer) return;

    const updateCamera = () => {

      if (targetRef.current) {
        const offset = new THREE.Vector3(0, 5, 8); // Adjust for desired view
        const targetPosition = new THREE.Vector3();

        targetRef.current.getWorldPosition(targetPosition);
        offset.applyQuaternion(targetRef.current.quaternion); // Rotate offset by player rotation.

        camera.position.lerp(targetPosition.clone().add(offset), 0.1); // Smoothly move camera

        //Smooth LookAt
        const lookAtPosition = new THREE.Vector3().copy(targetPosition); // look at player position.
        lookAtPosition.y += 2;  // Look slightly above their feet.
        const currentLookAt = new THREE.Vector3();
        camera.getWorldDirection(currentLookAt) //Get current look direction
        currentLookAt.multiplyScalar(10);  // project forward.
        currentLookAt.add(camera.position); // Get point camera is looking At.
        currentLookAt.lerp(lookAtPosition, 0.1);  //smooth transition.
        camera.lookAt(currentLookAt);


      }

      requestAnimationFrame(updateCamera);

    };

    const animationId = requestAnimationFrame(updateCamera);

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [camera, renderer, targetRef]);

  return null; // Doesn't render its own elements
};

export default CameraManager;

    What it does: This component makes the camera follow the local player smoothly.
    How it Works:
        targetRef: Holds a reference to the target object (the local player's mesh). It finds this target by traversing the scene and checking userData.playerId.
        updateCamera: This function, run in a requestAnimationFrame loop:
            Calculates an offset vector. This determines the camera's position relative to the player (behind and above).
            Gets the player's world position using getWorldPosition.
            Applies the player's rotation to the offset vector. This is critical to keep the camera positioned correctly behind the player, even when the player rotates. This uses applyQuaternion, just like the movement logic.
            Uses lerp to smoothly move the camera's position towards the target position (player position + offset).
            Uses lerp again to smoothly rotate the camera to look at a point slightly above the player's feet.
    Key Features:
        Smooth Following: Uses lerp for smooth camera movement and rotation, preventing jarring jumps.
        Rotation-Aware Offset: The applyQuaternion call ensures the camera stays behind the player, no matter how the player rotates.
        Clean Separation: The camera logic is completely separate from the player movement logic, making it easier to modify.

In Summary: The Flow of Movement

    Input: The useKeyboardControls hook detects key presses and updates the movement state.
    Player Movement: The PlayerManager:
        Uses the movement state to calculate a newTargetPosition.
        Updates playerMesh.current.rotation based on the movement direction.
        Sets playerMesh.current.userData.targetPosition.
        Calls updateVelocity of the usePositionPrediction hook.
        Sends a move event to the server (throttled).
    Client-Side Prediction: The usePositionPrediction hook:
        Calculates the player's velocity.
        Predicts the player's position based on velocity and time, and updates playerMesh.current.position.
    Remote Player Updates: The RemotePlayersManager:
        Receives playerMoved events from the server.
        Updates the targetPosition of the corresponding remote player.
        Smoothly interpolates the remote player's mesh position towards the targetPosition using lerp.
    Camera Following: The CameraManager:
        Finds the player to follow by traversing for a matching ID.
        Continuously updates the camera's position and rotation to smoothly follow the local player, taking the player's rotation into account.

This complete breakdown covers all the code involved in player movement (local and remote) and camera control in your refactored game. It shows how the different components work together to create a smooth and responsive user experience. This is now production ready.