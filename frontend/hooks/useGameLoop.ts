import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import ItemManager from '../game/world/ItemManager';
import { updateDebugVisuals } from '../utils/threeUtils';
import { DEBUG } from '../constants';

interface GameLoopOptions {
    scene: THREE.Scene | null;
    camera: THREE.PerspectiveCamera | null;
    renderer: THREE.WebGLRenderer | null;
    labelRenderer: CSS2DRenderer | null;
    itemManagerRef: React.RefObject<ItemManager | null>;
    playerRef: React.RefObject<THREE.Mesh | null>;
    playersRef: React.RefObject<Map<string, THREE.Mesh>>;
    updatePlayerMovement: () => void;
    updateCameraPosition: () => void;
    updateRemotePlayerPositions: (delta: number) => void;
    sendPositionUpdate: (movementOccurred: boolean) => void;
    checkMovementInputChanged: () => boolean;
    movementOccurred: React.RefObject<boolean>;
}

/**
 * Hook to manage the main game loop using requestAnimationFrame.
 * Orchestrates updates for movement, camera, remote players, items, and rendering.
 * @param options Configuration object with required components and update functions.
 */
export const useGameLoop = ({
    scene,
    camera,
    renderer,
    labelRenderer,
    itemManagerRef,
    playerRef,
    playersRef,
    updatePlayerMovement,
    updateCameraPosition,
    updateRemotePlayerPositions,
    sendPositionUpdate,
    checkMovementInputChanged,
    movementOccurred
}: GameLoopOptions) => {
    const clockRef = useRef<THREE.Clock>(new THREE.Clock());
    const animationFrameId = useRef<number | null>(null);

    const animate = useCallback(() => {
        // Ensure core components are ready
        if (!scene || !camera || !renderer || !labelRenderer || !playerRef || !playersRef) {
            console.warn("Game loop skipped: Core components not ready.");
            animationFrameId.current = requestAnimationFrame(animate); // Continue trying
            return;
        }

        animationFrameId.current = requestAnimationFrame(animate);

        const delta = clockRef.current.getDelta();
        // Cap delta to prevent huge jumps after inactivity
        const cappedDelta = Math.min(delta, 0.1);

        // --- Core Updates ---
        // 1. Check for input changes (affects if we *consider* sending network update)
        const inputChanged = checkMovementInputChanged();

        // 2. Update local player movement (updates playerRef.current.position/rotation)
        // This also sets movementOccurred.current internally if movement happened.
        updatePlayerMovement();

        // 3. Update remote player positions (interpolation/prediction)
        updateRemotePlayerPositions(cappedDelta);

        // 4. Send network update if movement occurred (either from input or physics like falling)
        // Pass the movementOccurred flag from the movement hook.
        sendPositionUpdate(movementOccurred.current || inputChanged);

        // 5. Update camera position to follow player
        updateCameraPosition();

        // 6. Update world items (animations, etc.)
        itemManagerRef.current?.updateItems(cappedDelta);

        // --- Rendering ---
        renderer.render(scene, camera);
        labelRenderer.render(scene, camera);

        // --- Debug Visuals ---
        if (DEBUG.showPositionMarkers || DEBUG.showVelocityVectors) {
           updateDebugVisuals(scene, playerRef, playersRef);
        }

        // --- Update data attribute for external access (e.g., UI) ---
        const positionEl = document.querySelector('[data-player-position]');
        if (playerRef.current && positionEl) {
            const pos = playerRef.current.position;
            // Only update attribute if position actually changed to reduce DOM manipulation
            const currentAttr = positionEl.getAttribute('data-position');
            const newAttrValue = JSON.stringify({ x: pos.x, y: pos.y, z: pos.z });
            if(currentAttr !== newAttrValue){
               positionEl.setAttribute('data-position', newAttrValue);
            }
        }
    }, [
        scene, camera, renderer, labelRenderer, itemManagerRef, playerRef, playersRef,
        updatePlayerMovement, updateCameraPosition, updateRemotePlayerPositions,
        sendPositionUpdate, checkMovementInputChanged, movementOccurred
    ]);

    // Start and stop the loop
    useEffect(() => {
        console.log("Starting game loop...");
        // Reset clock when starting
        clockRef.current.start();
        // Start the loop
        animationFrameId.current = requestAnimationFrame(animate);

        return () => {
            console.log("Stopping game loop...");
            if (animationFrameId.current !== null) {
                cancelAnimationFrame(animationFrameId.current);
            }
            clockRef.current.stop();
            animationFrameId.current = null;
        };
    }, [animate]);
}; 