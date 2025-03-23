import { useRef, useCallback } from 'react';
import * as THREE from 'three';

interface CameraControllerProps {
  camera: THREE.PerspectiveCamera;
  isHorizontalInvertedRef: React.MutableRefObject<boolean>;
}

export const useCameraController = ({ 
  camera: initialCamera,
  isHorizontalInvertedRef
}: CameraControllerProps) => {
  // Camera control state
  const isMiddleMouseDown = useRef(false);
  const lastMousePosition = useRef({ x: 0, y: 0 });
  const cameraDistance = useRef(10);
  const cameraAngle = useRef(0);
  const cameraTilt = useRef(0.5); // 0 to 1, where 0.5 is horizontal
  const cameraRef = useRef(initialCamera);
  
  // Set initial camera position
  const initCamera = useCallback(() => {
    cameraRef.current.position.set(0, 10, 10);
    cameraRef.current.lookAt(0, 0, 0);
  }, []);
  
  // Set a new camera instance
  const setCamera = useCallback((newCamera: THREE.PerspectiveCamera) => {
    cameraRef.current = newCamera;
  }, []);
  
  // Update camera position to follow a target
  const updateCameraPosition = useCallback((target: THREE.Vector3) => {
    // Calculate camera position based on angle, tilt, and distance
    const cameraX = target.x + Math.sin(cameraAngle.current) * cameraDistance.current;
    const cameraZ = target.z + Math.cos(cameraAngle.current) * cameraDistance.current;
    // Use cameraTilt to adjust height (0.1 to 0.9 maps to roughly 2 to 8 units above player)
    const cameraY = target.y + (cameraTilt.current * 6 + 2);

    // Update camera position and look at target
    cameraRef.current.position.set(cameraX, cameraY, cameraZ);
    cameraRef.current.lookAt(target);
    cameraRef.current.updateProjectionMatrix();
  }, []);
  
  // Event handler for middle mouse button
  const handleMouseDown = useCallback((event: MouseEvent) => {
    if (event.button === 1) { // Middle mouse button
      console.log('Middle mouse button pressed');
      isMiddleMouseDown.current = true;
      lastMousePosition.current = { x: event.clientX, y: event.clientY };
    }
  }, []);

  // Event handler for releasing middle mouse button
  const handleMouseUp = useCallback((event: MouseEvent) => {
    if (event.button === 1) { // Middle mouse button
      console.log('Middle mouse button released');
      isMiddleMouseDown.current = false;
    }
  }, []);

  // Event handler for mouse movement
  const handleMouseMove = useCallback((event: MouseEvent) => {
    if (isMiddleMouseDown.current) {
      const deltaX = event.clientX - lastMousePosition.current.x;
      const deltaY = event.clientY - lastMousePosition.current.y;
      
      // Update camera angle based on horizontal mouse movement
      // Positive deltaX (moving right) rotates clockwise
      // Negative deltaX (moving left) rotates counter-clockwise
      const invertFactor = isHorizontalInvertedRef.current ? -1 : 1;
      const angleChange = invertFactor * deltaX * 0.01;
      cameraAngle.current += angleChange;
      
      // Update camera tilt based on vertical mouse movement
      // Positive deltaY (moving down) increases tilt
      // Negative deltaY (moving up) decreases tilt
      cameraTilt.current = Math.max(0.1, Math.min(0.9, cameraTilt.current + deltaY * 0.01));

      lastMousePosition.current = { x: event.clientX, y: event.clientY };
    }
  }, [isHorizontalInvertedRef]);

  // Event handler for mouse wheel to control zoom
  const handleMouseWheel = useCallback((event: WheelEvent) => {
    // Update camera distance based on wheel movement
    cameraDistance.current = Math.max(5, Math.min(20, cameraDistance.current + event.deltaY * 0.1));
  }, []);
  
  // Register and unregister event listeners
  const setupEventListeners = useCallback(() => {
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('wheel', handleMouseWheel);
    
    return () => {
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('wheel', handleMouseWheel);
    };
  }, [handleMouseDown, handleMouseUp, handleMouseMove, handleMouseWheel]);
  
  // Handle window resize
  const handleResize = useCallback(() => {
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    cameraRef.current.aspect = width / height;
    cameraRef.current.updateProjectionMatrix();
  }, []);

  // Setup resize handler
  const setupResizeHandler = useCallback(() => {
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, [handleResize]);

  return {
    cameraAngle,
    cameraDistance,
    cameraTilt,
    initCamera,
    setCamera,
    updateCameraPosition,
    setupEventListeners,
    setupResizeHandler
  };
};

export default useCameraController; 