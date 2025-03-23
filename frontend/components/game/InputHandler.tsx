import { useRef, useCallback } from 'react';
import * as THREE from 'three';
import soundManager from '../../game/audio/soundManager';

interface UseInputHandlerProps {
  raycasterRef: React.MutableRefObject<THREE.Raycaster>;
  mouseRef: React.MutableRefObject<THREE.Vector2>;
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  resourceNodesRef: React.MutableRefObject<any[]>;
  worldItemsRef: React.MutableRefObject<any[]>;
  onGatherResource: (resourceId: string) => void;
  onPickupItem: (dropId: string) => void;
}

// Convert to a custom hook with the 'use' prefix naming convention
export const useInputHandler = ({
  raycasterRef,
  mouseRef,
  playerRef,
  resourceNodesRef,
  worldItemsRef,
  onGatherResource,
  onPickupItem
}: UseInputHandlerProps) => {
  // Store key states
  const keysPressed = useRef<Record<string, boolean>>({
    w: false,
    a: false,
    s: false,
    d: false,
    ArrowUp: false,
    ArrowLeft: false,
    ArrowDown: false,
    ArrowRight: false
  });
  
  // Keep track of gathering cooldown
  const isGathering = useRef(false);
  
  // Handle keyboard input
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    // Check if the key is one we track for movement
    if (keysPressed.current.hasOwnProperty(event.key)) {
      keysPressed.current[event.key] = true;
    }
  }, []);
  
  const handleKeyUp = useCallback((event: KeyboardEvent) => {
    // Check if the key is one we track for movement
    if (keysPressed.current.hasOwnProperty(event.key)) {
      keysPressed.current[event.key] = false;
    }
  }, []);
  
  // Handle mouse click for resource gathering and item pickup
  const handleMouseClick = useCallback((event: MouseEvent, renderer: THREE.WebGLRenderer, camera: THREE.Camera) => {
    // Get mouse position in normalized device coordinates (-1 to +1)
    const rect = renderer.domElement.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update the raycaster
    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    
    // Create a list of objects to check for intersection
    const interactables = [
      ...resourceNodesRef.current.map(node => node.mesh),
      ...worldItemsRef.current.map(item => item.mesh)
    ].filter(Boolean) as THREE.Object3D[];
    
    // Perform raycasting
    const intersects = raycasterRef.current.intersectObjects(interactables);
    
    if (intersects.length > 0) {
      const intersected = intersects[0].object;
      
      // Calculate distance to player
      const playerPosition = playerRef.current?.position || new THREE.Vector3();
      const distanceToPlayer = playerPosition.distanceTo(intersected.position);
      
      // Check if it's a resource node
      if (intersected.userData.resourceId && distanceToPlayer <= 5) {
        // Gather resource if not already gathering
        if (!isGathering.current) {
          console.log('Clicking resource:', intersected.userData.resourceId);
          isGathering.current = true;
          
          // Call the handler
          onGatherResource(intersected.userData.resourceId);
          
          // Reset gathering flag after cooldown
          setTimeout(() => {
            isGathering.current = false;
          }, 2000);
        }
      }
      // Check if it's a dropped item
      else if (intersected.userData.dropId && distanceToPlayer <= 5) {
        // Pick up item
        console.log('Clicking item:', intersected.userData.dropId);
        onPickupItem(intersected.userData.dropId);
      }
      // Too far away
      else if (distanceToPlayer > 5) {
        console.log('Too far away to interact!');
      }
    }
  }, [raycasterRef, mouseRef, playerRef, resourceNodesRef, worldItemsRef, onGatherResource, onPickupItem]);
  
  // Register event listeners
  const setupEventListeners = useCallback((renderer: THREE.WebGLRenderer, camera: THREE.Camera) => {
    // Add event listeners for keyboard
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Add event listener for mouse click
    const handleClick = (event: MouseEvent) => handleMouseClick(event, renderer, camera);
    renderer.domElement.addEventListener('click', handleClick);
    
    // Return cleanup function
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      renderer.domElement.removeEventListener('click', handleClick);
    };
  }, [handleKeyDown, handleKeyUp, handleMouseClick]);
  
  return {
    keysPressed,
    setupEventListeners
  };
};

// Export the custom hook as the default export
export default useInputHandler; 