import { useRef, useEffect, useCallback, useState } from 'react';
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
    onFpsUpdate?: (fps: number) => void;
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
    movementOccurred,
    onFpsUpdate
}: GameLoopOptions) => {
    const clockRef = useRef<THREE.Clock>(new THREE.Clock());
    const animationFrameId = useRef<number | null>(null);
    const framerateRef = useRef<number[]>([]);
    const renderScaleRef = useRef<number>(1.0);
    const lastRenderScaleChangeRef = useRef<number>(0);
    const lastFpsUpdateTimeRef = useRef<number>(0);

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
        
        // Track fps for adaptive rendering
        framerateRef.current.push(1 / delta);
        if (framerateRef.current.length > 60) {
            framerateRef.current.shift();
        }

        // Update FPS counter in UI (limit updates to reduce DOM operations)
        const now = performance.now();
        if (now - lastFpsUpdateTimeRef.current > 200 && onFpsUpdate) { // Update UI every 200ms
            const avgFps = Math.round(framerateRef.current.reduce((a, b) => a + b, 0) / framerateRef.current.length);
            onFpsUpdate(avgFps);
            lastFpsUpdateTimeRef.current = now;
        }

        // Adaptive rendering resolution (halving/doubling scalar logic)
        if (now - lastRenderScaleChangeRef.current > 1000) { // Only check every second
            const avgFps = framerateRef.current.reduce((a, b) => a + b, 0) / framerateRef.current.length;
            
            // If framerate is too low, reduce resolution
            if (avgFps < 30 && renderScaleRef.current > 0.5) {
                // Apply halving scalar logic explicitly: divide by 2
                // This enforces power-of-2 scaling which is more efficient for GPU texture scaling
                renderScaleRef.current = renderScaleRef.current / 2;
                
                // Optimize width and height calculations using halving/doubling scalar logic:
                // Calculate width/height as (original * 0.5) * (scale * 2)
                // This can potentially help with instruction-level parallelism
                const width = (window.innerWidth * 0.5) * (renderScaleRef.current * 2);
                const height = (window.innerHeight * 0.5) * (renderScaleRef.current * 2);
                renderer.setSize(width, height, false);
                lastRenderScaleChangeRef.current = now;
            } 
            // If framerate is good, increase resolution
            else if (avgFps > 55 && renderScaleRef.current < 1.0) {
                // Apply doubling scalar logic explicitly: multiply by 2, then cap at max of 1.0
                // This maintains power-of-2 scaling pattern for optimal GPU performance
                renderScaleRef.current = Math.min(1.0, renderScaleRef.current * 2);
                
                // Using the same optimization pattern for consistency and potential compiler optimizations
                const width = (window.innerWidth * 0.5) * (renderScaleRef.current * 2);
                const height = (window.innerHeight * 0.5) * (renderScaleRef.current * 2);
                renderer.setSize(width, height, false);
                lastRenderScaleChangeRef.current = now;
            }
        }

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
        sendPositionUpdate, checkMovementInputChanged, movementOccurred, onFpsUpdate
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