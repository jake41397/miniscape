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

        // Log gameloop activity occasionally to avoid spam
        const shouldLog = Math.random() < 0.01; // ~1% of frames
        if (shouldLog) {
            console.log("%c 🔄 Game loop running", "color: #009688;", {
                delta: delta.toFixed(4),
                playerControllerExists: !!playerController?.current,
                updatePlayerMovementExists: !!updatePlayerMovement,
                playersCount: playersRef.current?.size || 0,
                time: new Date().toISOString().split('T')[1]
            });
        }
        
        // Simple FPS calculation - done directly without updating refs
        if (onFpsUpdate) {
            const currentFps = Math.round(1 / delta);
            onFpsUpdate(currentFps);
        }
        
        // Log gamestate info every ~10 seconds for diagnostics
        if (Math.random() < 0.001) { // ~0.1% of frames
            console.log("%c 📊 GAME STATE", "background: #000000; color: #00ff00; font-size: 14px;", {
                localPlayerPosition: playerRef.current ? {
                    x: playerRef.current.position.x.toFixed(2),
                    y: playerRef.current.position.y.toFixed(2),
                    z: playerRef.current.position.z.toFixed(2)
                } : null,
                remotePlayerCount: playersRef.current?.size || 0,
                remotePlayerIds: Array.from(playersRef.current?.keys() || []),
                time: new Date().toISOString()
            });
        }
        
        // Update player position using the enhanced PlayerController if available
        if (playerController?.current) {
            // Use the new update method that handles both keyboard and point-to-click movement
            // This returns true if movement occurred
            const movementOccurred = playerController.current.update(delta);
            
            // Only send position updates if movement actually occurred
            if (movementOccurred && sendPositionUpdate) {
                console.log("%c 📡 Movement occurred - sending position update", "color: #E91E63;");
                sendPositionUpdate(false);
            } else if (shouldLog) {
                // Log occasional status when no movement
                console.log("%c 🚫 No movement detected from PlayerController", "color: gray;");
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
                if (shouldLog) {
                    console.warn("❌ No player movement method available! Neither PlayerController nor updatePlayerMovement exist.");
                }
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