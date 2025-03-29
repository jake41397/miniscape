import { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { getSocket } from '../game/network/socket';
import soundManager from '../game/audio/soundManager';
import { ResourceNode, WorldItem } from '../game/world/resources';
import { GATHERING_COOLDOWN } from '../constants';
import { PlayerController } from '../components/game/PlayerController';

interface InteractionOptions {
    sceneRef: React.RefObject<THREE.Scene | null>;
    cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
    resourceNodesRef: React.RefObject<ResourceNode[]>;
    worldItemsRef: React.RefObject<WorldItem[]>;
    canvasRef: React.RefObject<HTMLDivElement>;
    playerRef: React.RefObject<THREE.Mesh | null>;
    playerController?: PlayerController;
}

/**
 * Creates a click indicator at the specified position
 * @param scene The scene to add the indicator to
 * @param position The position to place the indicator
 * @returns The created indicator mesh
 */
const createClickIndicator = (scene: THREE.Scene, position: THREE.Vector3): THREE.Mesh => {
    // Create a circular indicator
    const geometry = new THREE.CircleGeometry(0.8, 24); // Make it slightly larger and smoother
    // Rotate it to be horizontal (facing up)
    geometry.rotateX(-Math.PI / 2);
    
    // Create a material with opacity for the indicator
    const material = new THREE.MeshBasicMaterial({
        color: 0xffcc00, // Brighter yellow color for better visibility
        transparent: true,
        opacity: 0.9, // Start more visible
        side: THREE.DoubleSide,
        depthWrite: false // Prevent z-fighting issues
    });
    
    // Create the mesh and position it
    const indicator = new THREE.Mesh(geometry, material);
    indicator.position.copy(position);
    // Lift it slightly higher above the ground to prevent z-fighting and ensure visibility
    indicator.position.y += 0.05;
    
    // Add a ring around the main indicator for better visibility
    const ringGeometry = new THREE.RingGeometry(0.8, 1.0, 24);
    ringGeometry.rotateX(-Math.PI / 2);
    
    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xff9900, // Orange tint for the ring
        transparent: true,
        opacity: 0.7,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.copy(position);
    ring.position.y += 0.04; // Slightly below the main indicator
    
    // Add both to the scene
    scene.add(indicator);
    scene.add(ring);
    
    // Add ring as a child of the indicator for easier management
    indicator.add(ring);
    ring.position.set(0, -0.01, 0); // Relative to the parent
    
    // Add animation to make it more noticeable
    // We'll use a simple scaling effect
    const scaleFactor = 1.2;
    const duration = 800; // ms
    const startTime = Date.now();
    
    function animate() {
        const elapsed = Date.now() - startTime;
        const phase = (elapsed % duration) / duration; // 0 to 1
        
        // Sinusoidal scaling 
        const scale = 1 + 0.2 * Math.sin(phase * Math.PI * 2);
        indicator.scale.set(scale, 1, scale);
        
        // Rotate the ring
        ring.rotation.y += 0.01;
        
        // Also gradually fade out the indicator
        const lifetime = 10000; // 10 seconds
        const fadeStart = 7000; // Start fading after 7 seconds
        const opacity = elapsed < fadeStart ? 
            0.9 : // Full opacity before fade start
            0.9 * (1 - (elapsed - fadeStart) / (lifetime - fadeStart)); // Linear fade
        
        material.opacity = Math.max(0, opacity);
        ringMaterial.opacity = Math.max(0, opacity * 0.8);
        
        if (elapsed < lifetime && indicator.parent) {
            requestAnimationFrame(animate);
        } else if (indicator.parent) {
            // Remove from scene after lifetime
            scene.remove(indicator);
            // Cleanup geometry and materials
            geometry.dispose();
            material.dispose();
            ringGeometry.dispose();
            ringMaterial.dispose();
        }
    }
    
    // Start animation
    animate();
    
    return indicator;
};

/**
 * Hook to handle mouse click interactions for gathering resources and picking up items.
 * Performs raycasting and sends network events.
 * @param options Configuration object with necessary refs.
 * @returns A function to handle mouse click events.
 */
export const useInteraction = ({
    sceneRef,
    cameraRef,
    resourceNodesRef,
    worldItemsRef,
    canvasRef,
    playerRef,
    playerController
}: InteractionOptions) => {
    const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
    const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
    const isGathering = useRef(false);
    const gatheringTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isWalkingToItem = useRef(false);
    const isWalkingToLocation = useRef(false);
    // Create a ground plane for intersection testing
    const groundPlaneRef = useRef<THREE.Plane>(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0));
    // Reference to the current click indicator
    const clickIndicatorRef = useRef<THREE.Mesh | null>(null);

    // Clean up any existing click indicator
    const removeClickIndicator = useCallback(() => {
        if (clickIndicatorRef.current && sceneRef.current) {
            // Get a reference to the scene
            const scene = sceneRef.current;
            
            // Get the indicator and find any child objects
            const indicator = clickIndicatorRef.current;
            
            // Remove all children first (like the ring)
            while (indicator.children.length > 0) {
                const child = indicator.children[0];
                
                // Dispose of geometry and materials if they exist
                if ((child as THREE.Mesh).geometry) {
                    (child as THREE.Mesh).geometry.dispose();
                }
                
                if ((child as THREE.Mesh).material) {
                    const material = (child as THREE.Mesh).material;
                    if (Array.isArray(material)) {
                        material.forEach(m => m.dispose());
                    } else {
                        material.dispose();
                    }
                }
                
                // Remove from parent
                indicator.remove(child);
            }
            
            // Now remove the main indicator from the scene
            scene.remove(indicator);
            
            // Dispose of main indicator's geometry and material
            if (indicator.geometry) {
                indicator.geometry.dispose();
            }
            
            if (indicator.material) {
                const material = indicator.material;
                if (Array.isArray(material)) {
                    material.forEach(m => m.dispose());
                } else {
                    material.dispose();
                }
            }
            
            // Clear the reference
            clickIndicatorRef.current = null;
            
            console.log('Click indicator successfully removed and cleaned up');
        }
    }, [sceneRef]);

    const handleMouseClick = useCallback((e: MouseEvent) => {
        // Ensure refs are available and it's a left click
        if (e.button !== 0 || !sceneRef.current || !cameraRef.current || !canvasRef.current) {
            return;
        }

        // Calculate normalized device coordinates (NDC) from click event
        const rect = canvasRef.current.getBoundingClientRect();
        mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        // Update raycaster
        raycasterRef.current.setFromCamera(mouseRef.current, cameraRef.current);

        // 1. Check for intersections with World Items (dropped items)
        const itemMeshes = worldItemsRef.current?.map(item => item.mesh).filter(Boolean) as THREE.Object3D[] || [];
        const itemIntersects = itemMeshes.length > 0 ? raycasterRef.current.intersectObjects(itemMeshes) : [];

        if (itemIntersects.length > 0) {
            const intersectedItem = itemIntersects[0].object;
            const dropId = intersectedItem.userData?.dropId;
            const itemType = intersectedItem.userData?.itemType;

            if (dropId) {
                // Get current player position
                const player = playerRef.current;
                if (!player || !playerController) {
                    return; // Player not available
                }

                console.log(`Clicked on item: ${itemType || 'Unknown'} (ID: ${dropId})`);

                // Get item position to walk to
                const itemPosition = intersectedItem.position.clone();
                
                // If already walking, interrupt the current movement immediately
                if (isWalkingToLocation.current || isWalkingToItem.current) {
                    // Interrupt the current movement
                    playerController.interruptMovement();
                    
                    // Reset flags immediately to allow the new movement to start
                    isWalkingToLocation.current = false;
                    isWalkingToItem.current = false;
                    
                    // Remove any existing click indicator
                    removeClickIndicator();
                }
                
                // Create click indicator at the item
                if (sceneRef.current) {
                    clickIndicatorRef.current = createClickIndicator(sceneRef.current, itemPosition);
                }

                // Start walking to the item
                isWalkingToItem.current = true;
                
                // Walk to the item
                playerController.moveToPosition(itemPosition)
                    .then(() => {
                        // Only proceed if we're still walking to this item
                        // (prevents issues if multiple clicks happened)
                        if (isWalkingToItem.current) {
                            // After reaching the item, attempt to pick it up
                            console.log(`Reached item: ${itemType || 'Unknown'} (ID: ${dropId}), attempting to pick up`);
                            getSocket().then(socket => {
                                if (socket) {
                                    socket.emit('pickup', dropId);
                                    soundManager.play('itemPickup');
                                }
                            }).catch(err => console.error("Error getting socket for pickup:", err));
                            
                            // Remove the click indicator
                            removeClickIndicator();
                            isWalkingToItem.current = false;
                        }
                    })
                    .catch(err => {
                        console.error("Error walking to item:", err);
                        // Only clean up if this is still the active movement
                        if (isWalkingToItem.current) {
                            removeClickIndicator();
                            isWalkingToItem.current = false;
                        }
                    });

                return; // Stop processing if an item was clicked
            } else {
                console.warn("Clicked item mesh without dropId in userData:", intersectedItem);
            }
        }

        // 2. Check for intersections with Resource Nodes (if no item was clicked)
        if (isGathering.current) {
            console.log("Interaction blocked: Still on gathering cooldown.");
            return;
        }

        const resourceMeshes = resourceNodesRef.current?.map(node => node.mesh).filter(Boolean) as THREE.Object3D[] || [];
        const resourceIntersects = resourceMeshes.length > 0 ? raycasterRef.current.intersectObjects(resourceMeshes) : [];

        if (resourceIntersects.length > 0) {
            const intersectedResource = resourceIntersects[0].object;
            const resourceId = intersectedResource.userData?.resourceId;
            const resourceType = intersectedResource.userData?.resourceType;

            if (resourceId && resourceType) {
                console.log(`Attempting to gather resource: ${resourceType} (ID: ${resourceId})`);
                isGathering.current = true; // Set cooldown flag

                getSocket().then(socket => {
                    if (socket) {
                        socket.emit('gather', resourceId);

                        // Play sound based on type
                        switch (resourceType) {
                            case 'TREE': soundManager.play('woodcutting'); break;
                            case 'ROCK': soundManager.play('mining'); break;
                            case 'FISH': soundManager.play('fishing'); break;
                            default: console.warn(`No gather sound for resource type: ${resourceType}`);
                        }
                    }
                }).catch(err => console.error("Error getting socket for gather:", err));

                // Clear existing timeout if any
                if (gatheringTimeoutRef.current) clearTimeout(gatheringTimeoutRef.current);

                // Set cooldown timer
                gatheringTimeoutRef.current = setTimeout(() => {
                    isGathering.current = false;
                    gatheringTimeoutRef.current = null;
                    console.log("Gathering cooldown finished.");
                }, GATHERING_COOLDOWN);
            } else {
                console.warn("Clicked resource mesh missing resourceId or resourceType in userData:", intersectedResource);
            }
            
            // Don't proceed with ground click if we clicked a resource
            return;
        }
        
        // 3. If we didn't click on an item or resource, check for ground click
        if (!playerController || !playerRef.current) {
            return; // Exit if no player controller or player mesh
        }
        
        // Check if the ray intersects with the ground plane
        const ray = raycasterRef.current.ray;
        const targetPoint = new THREE.Vector3();
        
        // Create a ground plane at y=0 with normal pointing up
        // This assumes the ground is at y=0 in your world. Adjust if needed.
        if (ray.intersectPlane(groundPlaneRef.current, targetPoint)) {
            console.log(`Moving to location: (${targetPoint.x.toFixed(2)}, ${targetPoint.z.toFixed(2)})`);
            
            // Keep the player at the correct Y height
            const yPosition = playerRef.current.position.y;
            targetPoint.y = yPosition;
            
            // If already walking, interrupt the current movement immediately
            if (isWalkingToLocation.current || isWalkingToItem.current) {
                // Interrupt the current movement
                playerController.interruptMovement();
                
                // Reset flags immediately to allow the new movement to start
                isWalkingToLocation.current = false;
                isWalkingToItem.current = false;
                
                // Remove any existing click indicator
                removeClickIndicator();
            }
            
            // Create new click indicator at the target location
            if (sceneRef.current) {
                clickIndicatorRef.current = createClickIndicator(sceneRef.current, targetPoint);
            }
            
            // Set walking flag
            isWalkingToLocation.current = true;
            
            // Play a sound for location click
            soundManager.play('itemDrop');
            
            // Move to the target location
            playerController.moveToPosition(targetPoint)
                .then(() => {
                    // Only remove the indicator if we're still walking to this location
                    // (prevents removing a newer indicator if multiple clicks happened)
                    if (isWalkingToLocation.current) {
                        removeClickIndicator();
                        isWalkingToLocation.current = false;
                    }
                })
                .catch(err => {
                    console.error("Error walking to location:", err);
                    // Only clean up if this is still the active movement
                    if (isWalkingToLocation.current) {
                        removeClickIndicator();
                        isWalkingToLocation.current = false;
                    }
                });
        }
    }, [sceneRef, cameraRef, canvasRef, resourceNodesRef, worldItemsRef, playerRef, playerController, removeClickIndicator]);

    // Cleanup effect for the timeout and click indicator
    useEffect(() => {
        return () => {
            if (gatheringTimeoutRef.current) {
                clearTimeout(gatheringTimeoutRef.current);
            }
            // Clean up click indicator on unmount
            removeClickIndicator();
        };
    }, [removeClickIndicator]);

    return { handleMouseClick };
}; 