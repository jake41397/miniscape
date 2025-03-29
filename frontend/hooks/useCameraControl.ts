import { useRef, useEffect, useCallback, useState } from 'react';
import * as THREE from 'three';
import {
    CAMERA_ZOOM_SPEED, CAMERA_MIN_DISTANCE, CAMERA_MAX_DISTANCE,
    CAMERA_ROTATION_SPEED, CAMERA_TILT_SPEED, CAMERA_MIN_TILT, CAMERA_MAX_TILT
} from '../constants';

interface CameraControlOptions {
    camera: THREE.PerspectiveCamera | null;
    playerRef: React.RefObject<THREE.Mesh | null>;
    isEnabled: boolean; // Allow enabling/disabling control
    isHorizontalInvertedRef: React.RefObject<boolean>; // Use ref for instant updates
}

interface CameraState {
    distance: number;
    angle: number; // Horizontal angle
    tilt: number;   // Vertical tilt (0.1 to 0.9)
}

/**
 * Hook to manage camera controls (rotation via middle mouse, zoom via wheel).
 * Updates the camera position based on the player's position.
 * @param options Configuration object including camera, playerRef, and enabled status.
 * @returns The current camera state (distance, angle, tilt).
 */
export const useCameraControl = ({ 
    camera, 
    playerRef, 
    isEnabled, 
    isHorizontalInvertedRef 
}: CameraControlOptions) => {
    const [cameraState, setCameraState] = useState<CameraState>({
        distance: 10,
        angle: 0,
        tilt: 0.5, // Start horizontal
    });

    const isMiddleMouseDown = useRef(false);
    const lastMousePosition = useRef({ x: 0, y: 0 });

    const handleMouseDown = useCallback((e: MouseEvent) => {
        if (!isEnabled || e.button !== 1) return; // Middle mouse button
        isMiddleMouseDown.current = true;
        lastMousePosition.current = { x: e.clientX, y: e.clientY };
        e.preventDefault(); // Prevent default browser middle-click behavior
    }, [isEnabled]);

    const handleMouseUp = useCallback((e: MouseEvent) => {
        if (!isEnabled || e.button !== 1) return;
        isMiddleMouseDown.current = false;
    }, [isEnabled]);

    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (!isEnabled || !isMiddleMouseDown.current) return;

        const deltaX = e.clientX - lastMousePosition.current.x;
        const deltaY = e.clientY - lastMousePosition.current.y;

        setCameraState(prevState => {
            let newAngle = prevState.angle;
            // Apply horizontal rotation (invert based on ref value)
            const inversionFactor = isHorizontalInvertedRef.current ? 1 : -1;
            newAngle += deltaX * CAMERA_ROTATION_SPEED * inversionFactor;

            // Apply vertical tilt (limited range)
            let newTilt = prevState.tilt + deltaY * CAMERA_TILT_SPEED;
            newTilt = Math.max(CAMERA_MIN_TILT, Math.min(CAMERA_MAX_TILT, newTilt));

            return { ...prevState, angle: newAngle, tilt: newTilt };
        });

        lastMousePosition.current = { x: e.clientX, y: e.clientY };
    }, [isEnabled, isHorizontalInvertedRef]);

    const handleMouseWheel = useCallback((e: WheelEvent) => {
        if (!isEnabled) return;
        setCameraState(prevState => {
            const newDistance = Math.max(
                CAMERA_MIN_DISTANCE,
                Math.min(CAMERA_MAX_DISTANCE, prevState.distance + Math.sign(e.deltaY) * CAMERA_ZOOM_SPEED)
            );
            return { ...prevState, distance: newDistance };
        });
        e.preventDefault(); // Prevent page scrolling
    }, [isEnabled]);

    // Effect to add/remove global mouse listeners
    useEffect(() => {
        if (!isEnabled) return; // Don't attach listeners if not enabled

        window.addEventListener('mousedown', handleMouseDown);
        window.addEventListener('mouseup', handleMouseUp);
        window.addEventListener('mousemove', handleMouseMove);
        // Add passive: false to allow preventDefault in wheel listener
        window.addEventListener('wheel', handleMouseWheel, { passive: false });

        return () => {
            isMiddleMouseDown.current = false;
            window.removeEventListener('mousedown', handleMouseDown);
            window.removeEventListener('mouseup', handleMouseUp);
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('wheel', handleMouseWheel);
        };
    }, [isEnabled, handleMouseDown, handleMouseUp, handleMouseMove, handleMouseWheel]);

    // Effect to update camera position in the animation loop (called externally)
    const updateCameraPosition = useCallback(() => {
        if (camera && playerRef.current) {
            const playerPosition = playerRef.current.position;
            const { distance, angle, tilt } = cameraState;

            // Calculate camera position based on state
            const cameraX = playerPosition.x + Math.sin(angle) * distance;
            const cameraZ = playerPosition.z + Math.cos(angle) * distance;
            // Adjust height based on tilt (maps 0.1-0.9 tilt to ~2-8 units above player)
            const cameraY = playerPosition.y + (tilt * 6 + 2);

            // Update camera position and look at player
            camera.position.set(cameraX, cameraY, cameraZ);
            camera.lookAt(playerPosition);
        }
    }, [camera, playerRef, cameraState]);

    return { cameraState, updateCameraPosition };
}; 