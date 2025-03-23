import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface CameraManagerProps {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  targetPlayerId: string | undefined; // ID of the player to follow
}

const CameraManager: React.FC<CameraManagerProps> = ({ scene, camera, renderer, targetPlayerId }) => {
  const targetRef = useRef<THREE.Object3D | null>(null);
  // Default camera offset values
  const defaultOffset = new THREE.Vector3(0, 5, 8);
  const cameraOffset = useRef(new THREE.Vector3(0, 5, 8));
  // Flag to track if animation frame is active
  const animationFrameRef = useRef<number | null>(null);
  // Previous camera position for smoothing
  const prevCameraPosition = useRef<THREE.Vector3 | null>(null);
  // Previous player position for detecting real movement vs jitter
  const prevPlayerPosition = useRef<THREE.Vector3 | null>(null);
  // Flag to indicate if camera is currently following a player
  const isFollowingPlayer = useRef(false);
  
  // Add camera control state for orbital camera movement
  const isMiddleMouseDown = useRef(false);
  const lastMousePosition = useRef({ x: 0, y: 0 });
  const cameraDistance = useRef(8);  // Start with default distance from defaultOffset
  const cameraAngle = useRef(0);     // Horizontal angle around player
  const cameraTilt = useRef(0.5);    // Vertical tilt (0 to 1, where 0.5 is horizontal)
  
  // Debug ref to track if events are firing
  const eventDebugRef = useRef({ lastEvent: '', mouseDown: false });

  // Check for custom camera settings
  useEffect(() => {
    if (scene && scene.userData) {
      // Update camera settings if they exist in scene.userData
      if (scene.userData.cameraHeight !== undefined) {
        cameraOffset.current.y = scene.userData.cameraHeight;
      }
      if (scene.userData.cameraDistance !== undefined) {
        cameraOffset.current.z = scene.userData.cameraDistance;
        cameraDistance.current = scene.userData.cameraDistance;
      }
      
      // Listen for changes to camera settings
      const checkCameraSettings = () => {
        let changed = false;
        
        if (scene.userData.cameraHeight !== undefined && 
            cameraOffset.current.y !== scene.userData.cameraHeight) {
          cameraOffset.current.y = scene.userData.cameraHeight;
          changed = true;
        }
        
        if (scene.userData.cameraDistance !== undefined &&
            cameraOffset.current.z !== scene.userData.cameraDistance) {
          cameraOffset.current.z = scene.userData.cameraDistance;
          cameraDistance.current = scene.userData.cameraDistance;
          changed = true;
        }
        
        if (changed) {
          console.log("Camera settings updated:", cameraOffset.current);
        }
      };
      
      const intervalId = setInterval(checkCameraSettings, 500);
      return () => clearInterval(intervalId);
    }
  }, [scene]);

  // Add mouse event handlers for camera control
  useEffect(() => {
    // Mouse down - start tracking for camera rotation
    const handleMouseDown = (event: MouseEvent) => {
      if (event.button === 1) { // Middle mouse button
        event.preventDefault(); // Prevent default behavior
        isMiddleMouseDown.current = true;
        lastMousePosition.current = { x: event.clientX, y: event.clientY };
        // Debug output
        console.log('CameraManager: Middle mouse button DOWN');
        eventDebugRef.current = { 
          lastEvent: 'mousedown', 
          mouseDown: true 
        };
      }
    };

    // Mouse up - stop tracking
    const handleMouseUp = (event: MouseEvent) => {
      if (event.button === 1) { // Middle mouse button
        isMiddleMouseDown.current = false;
        // Debug output
        console.log('CameraManager: Middle mouse button UP');
        eventDebugRef.current.mouseDown = false;
        eventDebugRef.current.lastEvent = 'mouseup';
      }
    };

    // Mouse move - update camera angle and tilt
    const handleMouseMove = (event: MouseEvent) => {
      if (isMiddleMouseDown.current) {
        const deltaX = event.clientX - lastMousePosition.current.x;
        const deltaY = event.clientY - lastMousePosition.current.y;
        
        // Update camera angle based on horizontal mouse movement
        cameraAngle.current += deltaX * 0.01;

        // Update camera tilt based on vertical mouse movement
        cameraTilt.current = Math.max(0.1, Math.min(0.9, cameraTilt.current + deltaY * 0.005));

        lastMousePosition.current = { x: event.clientX, y: event.clientY };
        
        // Debug output for significant movement
        if (Math.abs(deltaX) > 5 || Math.abs(deltaY) > 5) {
          console.log('CameraManager: Camera orbit - angle:', cameraAngle.current, 'tilt:', cameraTilt.current);
          eventDebugRef.current.lastEvent = 'mousemove';
        }
      }
    };

    // Mouse wheel - zoom in/out
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault(); // Prevent page scrolling
      // Update camera distance based on wheel movement
      const zoomFactor = 0.005;
      cameraDistance.current = Math.max(5, Math.min(20, cameraDistance.current + (event.deltaY * zoomFactor)));
      
      // Also update the offset z for internal calculations
      cameraOffset.current.z = cameraDistance.current;
      
      console.log('Camera zoom adjusted:', cameraDistance.current);
    };

    // Add event listeners
    window.addEventListener('mousedown', handleMouseDown, { capture: true });
    window.addEventListener('mouseup', handleMouseUp, { capture: true });
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('wheel', handleWheel, { passive: false }); // Need passive: false to use preventDefault

    // Cleanup event listeners
    return () => {
      window.removeEventListener('mousedown', handleMouseDown, { capture: true });
      window.removeEventListener('mouseup', handleMouseUp, { capture: true });
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('wheel', handleWheel);
    };
  }, []);

  // Find target based on ID
  useEffect(() => {
    // Don't proceed if scene is undefined
    if (!scene) {
      console.warn("CameraManager: Scene is undefined, cannot find player");
      return;
    }
    
    // Function to find player in scene
    const findPlayerInScene = () => {
      if (!isFollowingPlayer.current) {
        console.log("Searching for player in scene with ID:", targetPlayerId || 'localPlayer');
      }
      
      // First look for objects with explicit player markers
      let foundPlayer = false;
      
      scene.traverse((object) => {
        if (foundPlayer) return; // Skip if we already found it
        
        if (object.userData && object.userData.isPlayer === true) {
          if (!isFollowingPlayer.current) {
            console.log("Found player object:", object.userData);
          }
          
          if ((targetPlayerId && object.userData.playerId === targetPlayerId) || 
              (!targetPlayerId && object.userData.isPlayer === true)) {
            if (!isFollowingPlayer.current) {
              console.log("Target player found for camera to follow:", object.position);
            }
            targetRef.current = object;
            foundPlayer = true;
            
            // Only set initial camera position if we weren't already following a player
            if (!isFollowingPlayer.current && camera) {
              const playerPosition = new THREE.Vector3();
              object.getWorldPosition(playerPosition);
              
              // Create initial camera offset
              const initialOffset = new THREE.Vector3(
                cameraOffset.current.x,
                cameraOffset.current.y, 
                cameraOffset.current.z
              );
              
              // Apply player's rotation to offset if available
              if (object.rotation) {
                const tempRotation = new THREE.Euler(0, object.rotation.y, 0);
                initialOffset.applyEuler(tempRotation);
              }
              
              // Set camera position directly
              camera.position.copy(playerPosition).add(initialOffset);
              
              // Make camera look at player
              const lookTarget = new THREE.Vector3(
                playerPosition.x,
                playerPosition.y + 1.5,
                playerPosition.z
              );
              camera.lookAt(lookTarget);
              
              // Initialize the previous camera position
              prevCameraPosition.current = camera.position.clone();
              prevPlayerPosition.current = playerPosition.clone();
              
              console.log("Camera initial position set:", camera.position);
              isFollowingPlayer.current = true;
            }
            
            return;
          }
        }
      });
      
      // If we still haven't found a target, look for any object that could be a player
      if (!targetRef.current) {
        if (!isFollowingPlayer.current) {
          console.log("No player with matching ID found, looking for ANY mesh in scene");
        }
        
        scene.traverse((object) => {
          if (foundPlayer) return; // Skip if we already found it
          
          // Check for any object that might be our player (fallback)
          if ((object instanceof THREE.Mesh || object instanceof THREE.Group)) {
            if (!object.userData.isRemotePlayer && 
                object.name !== "ground" && 
                object.name !== "skybox" && 
                !object.userData.isResource &&
                !object.userData.isDebugCube) {
              
              if (!isFollowingPlayer.current) {
                console.log("Using potential player object for camera:", object);
              }
              
              targetRef.current = object;
              foundPlayer = true;
              
              // Tag it as player for future
              object.userData.isPlayer = true;
              object.userData.playerId = 'localPlayer';
              
              // Only set initial camera position if we weren't already following a player
              if (!isFollowingPlayer.current && camera) {
                const playerPosition = new THREE.Vector3();
                object.getWorldPosition(playerPosition);
                camera.position.copy(playerPosition).add(cameraOffset.current);
                camera.lookAt(playerPosition);
                
                // Initialize the previous camera position
                prevCameraPosition.current = camera.position.clone();
                prevPlayerPosition.current = playerPosition.clone();
                
                console.log("Camera positioned with fallback object:", camera.position);
                isFollowingPlayer.current = true;
              }
              
              return;
            }
          }
        });
      }
      
      return foundPlayer;
    };
    
    // Try to find player immediately
    const found = findPlayerInScene();
    
    // Set up less aggressive polling to find the player once per second
    // This is sufficient to ensure the camera finds the player without causing churn
    const pollingInterval = setInterval(() => {
      if (!targetRef.current) {
        if (!isFollowingPlayer.current) {
          console.log("Camera polling: Searching for player...");
        }
        findPlayerInScene();
      } else {
        // If we have a target, periodically verify it's still valid
        if (!scene.getObjectById(targetRef.current.id)) {
          console.log("Camera target is no longer in scene, resetting");
          targetRef.current = null;
          isFollowingPlayer.current = false;
          findPlayerInScene();
        }
      }
    }, 1000); // Poll once per second - less aggressive to reduce churn
    
    return () => clearInterval(pollingInterval);
  }, [scene, camera, targetPlayerId, cameraOffset]);

  // Cancel animation frame on unmount
  useEffect(() => {
    return () => {
      console.log("CameraManager unmounting - cleaning up animation frame");
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, []);

  // Update Camera Logic - with a stabilized approach to prevent jiggling
  useEffect(() => {
    if (!camera || !scene) return;

    // Create a function to update camera position with stabilization
    const updateCamera = () => {
      // If we don't have a target, don't update camera
      if (!targetRef.current) {
        // Schedule next frame and return
        animationFrameRef.current = requestAnimationFrame(updateCamera);
        return;
      }

      // Get player's current position
      const playerPosition = new THREE.Vector3();
      targetRef.current.getWorldPosition(playerPosition);
      
      // Skip if player position is exactly at origin (0,0,0) - likely not initialized yet
      if (playerPosition.length() < 0.001) {
        animationFrameRef.current = requestAnimationFrame(updateCamera);
        return;
      }
      
      // Initialize previous player position if not set
      if (!prevPlayerPosition.current) {
        prevPlayerPosition.current = playerPosition.clone();
      }
      
      // Calculate movement distance since last frame
      const movementDistance = prevPlayerPosition.current.distanceTo(playerPosition);
      
      // Debug the camera orbit state
      if (isMiddleMouseDown.current) {
        console.log('Camera orbit active - angle:', cameraAngle.current, 'tilt:', cameraTilt.current);
      }
      
      // Always update camera when in orbital mode (middle mouse down)
      // or on meaningful player movement, or on first position setup
      if (movementDistance > 0.01 || !prevCameraPosition.current || isMiddleMouseDown.current) {
        // ORBITAL CAMERA MODE
        // Calculate horizontal distance based on tilt
        const horizontalDistance = cameraDistance.current * Math.cos(Math.PI * cameraTilt.current);
        const verticalDistance = cameraDistance.current * Math.sin(Math.PI * cameraTilt.current);
        
        // Calculate camera position with trigonometry for orbit
        const cameraX = playerPosition.x + horizontalDistance * Math.sin(cameraAngle.current);
        const cameraY = playerPosition.y + verticalDistance;
        const cameraZ = playerPosition.z + horizontalDistance * Math.cos(cameraAngle.current);
        
        // Create the target camera position
        const targetCameraPosition = new THREE.Vector3(cameraX, cameraY, cameraZ);
        
        // Use smooth interpolation to update camera position
        if (prevCameraPosition.current) {
          // Adjust lerp factor based on movement distance for smooth following
          // Use a faster lerp for orbital movements
          const lerpFactor = isMiddleMouseDown.current ? 0.3 : Math.min(0.1, movementDistance * 0.5);
          camera.position.lerp(targetCameraPosition, lerpFactor);
        } else {
          // First time setting position - set directly
          camera.position.copy(targetCameraPosition);
        }
        
        // Store current camera position for next frame
        prevCameraPosition.current = camera.position.clone();
        
        // Make camera look at player position, slightly above feet
        const lookTarget = new THREE.Vector3(
          playerPosition.x,
          playerPosition.y + 1.5,  // Look at upper body/head level
          playerPosition.z
        );
        camera.lookAt(lookTarget);
        
        // Update previous player position
        prevPlayerPosition.current.copy(playerPosition);
      }
      
      // Schedule next frame
      animationFrameRef.current = requestAnimationFrame(updateCamera);
    };

    // Start animation loop
    animationFrameRef.current = requestAnimationFrame(updateCamera);

    // Cleanup on unmount or dependency change
    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
    };
  }, [camera, scene]);

  return null; // Doesn't render its own elements
};

export default CameraManager; 