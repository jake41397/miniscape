import { useRef, useEffect, useCallback } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer';
import ItemManager from '../game/world/ItemManager';
import { PlayerController } from '../components/game/PlayerController';

interface GameLoopOptions {
    scene: THREE.Scene | null;
    camera: THREE.Camera | null;
    renderer: THREE.WebGLRenderer | null;
    labelRenderer: CSS2DRenderer | null;
    itemManagerRef: React.RefObject<ItemManager | null>;
    playerRef: React.RefObject<THREE.Mesh | null>;
    playersRef: React.RefObject<Map<string, THREE.Mesh>>;
    updatePlayerMovement: () => void;
    updateCameraPosition: () => void;
    updateRemotePlayerPositions: (delta: number) => void;
    sendPositionUpdate: (force?: boolean) => void;
    checkMovementInputChanged: () => boolean;
    movementOccurred: React.RefObject<boolean>;
    resetMovementFlag?: () => void;
    onFpsUpdate?: (fps: number) => void;
    playerController?: React.RefObject<PlayerController | null>;
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
    resetMovementFlag,
    onFpsUpdate,
    playerController
}: GameLoopOptions) => {
    const clockRef = useRef<THREE.Clock>(new THREE.Clock());
    const frameIdRef = useRef<number | null>(null);

    const animate = useCallback(() => {
        frameIdRef.current = requestAnimationFrame(animate);
        
        // Skip if renderer, scene, camera, or labelRenderer isn't set up yet
        if (!renderer || !scene || !camera || !labelRenderer) {
            return;
        }
        
        // Update delta time for timing
        const delta = clockRef.current.getDelta();
        
        // Simple FPS calculation - done directly without updating refs
        if (onFpsUpdate) {
            const currentFps = Math.round(1 / delta);
            onFpsUpdate(currentFps);
        }
        
        // Update player position using the enhanced PlayerController if available
        if (playerController?.current) {
            // Use the new update method that handles both keyboard and point-to-click movement
            // This returns true if movement occurred
            const movementOccurred = playerController.current.update(delta);
            
            // Only send position updates if movement actually occurred
            if (movementOccurred && sendPositionUpdate) {
                sendPositionUpdate(false);
            }
        } else {
            // Fallback to old movement logic
            if (updatePlayerMovement) {
                updatePlayerMovement();
                
                // Check if movement occurred
                if (movementOccurred.current && sendPositionUpdate) {
                    sendPositionUpdate(false);
                    // Reset movement flag
                    if (resetMovementFlag) {
                        resetMovementFlag();
                    }
                }
            } else {
                // No player movement method available at all!
            }
        }
        
        // Update camera position
        updateCameraPosition?.();
        
        // Update remote players' positions
        updateRemotePlayerPositions?.(delta);
        
        // Update item animations if ItemManager is available
        if (itemManagerRef?.current) {
            itemManagerRef.current.updateItems(delta);
        }
        
        // Render scene
        renderer.render(scene, camera);
        
        // Render labels
        if (labelRenderer) {
            labelRenderer.render(scene, camera);
        }
    },
        [renderer, scene, camera, labelRenderer, 
        updatePlayerMovement, updateCameraPosition, updateRemotePlayerPositions,
        sendPositionUpdate, checkMovementInputChanged, movementOccurred,
        itemManagerRef, onFpsUpdate, playerController, resetMovementFlag]
    );

    // Start and stop the loop
    useEffect(() => {
        // Reset clock when starting
        clockRef.current.start();
        // Start the loop
        frameIdRef.current = requestAnimationFrame(animate);

        return () => {
            if (frameIdRef.current !== null) {
                cancelAnimationFrame(frameIdRef.current);
            }
            clockRef.current.stop();
            frameIdRef.current = null;
        };
    }, [animate]);
}; 