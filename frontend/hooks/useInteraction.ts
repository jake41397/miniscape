import { useRef, useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';
import { getSocket } from '../game/network/socket';
import soundManager from '../game/audio/soundManager';
import { ResourceNode, WorldItem } from '../game/world/resources';
import { GATHERING_COOLDOWN } from '../constants';
import { PlayerController } from '../components/game/PlayerController';
import ItemManager from '../game/world/ItemManager';

// Since we don't have access to the actual SoundType, we'll use strings directly
// This avoids the type error with the soundManager.play calls

export interface InteractionOptions {
    sceneRef: React.RefObject<THREE.Scene | null>;
    cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
    resourceNodesRef: React.RefObject<ResourceNode[]>;
    worldItemsRef: React.RefObject<WorldItem[]>;
    canvasRef: React.RefObject<HTMLDivElement>;
    playerRef: React.RefObject<THREE.Mesh | null>;
    playerControllerRef?: React.RefObject<PlayerController | null>;
    itemManagerRef?: React.RefObject<ItemManager | null>;
}

/**
 * Creates and manages a visual click indicator in the scene.
 * Includes creation, animation, and automatic cleanup.
 */
const createClickIndicator = (scene: THREE.Scene, position: THREE.Vector3): THREE.Mesh => {
    // Main indicator circle
    const geometry = new THREE.CircleGeometry(0.6, 24); // Slightly smaller radius
    geometry.rotateX(-Math.PI / 2); // Orient horizontally

    const material = new THREE.MeshBasicMaterial({
        color: 0xffcc00, // Bright yellow
        transparent: true,
        opacity: 0.8,
        side: THREE.DoubleSide,
        depthWrite: false, // Prevent Z-fighting
    });

    const indicator = new THREE.Mesh(geometry, material);
    indicator.position.copy(position);
    indicator.position.y += 0.05; // Lift slightly above ground

    // Outer ring effect
    const ringGeometry = new THREE.RingGeometry(0.6, 0.8, 24); // Match inner radius
    ringGeometry.rotateX(-Math.PI / 2);

    const ringMaterial = new THREE.MeshBasicMaterial({
        color: 0xff9900, // Orange tint
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
    });

    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    // Position ring relative to the indicator center (slightly below main circle)
    ring.position.set(0, -0.01, 0);
    indicator.add(ring); // Add ring as child for easier management

    scene.add(indicator);

    // Animation and cleanup logic
    const startTime = Date.now();
    const lifetime = 3000; // ms - Reduce lifetime for less clutter
    const pulseDuration = 500; // ms for one pulse cycle

    function animateIndicator() {
        const elapsed = Date.now() - startTime;

        if (elapsed < lifetime && indicator.parent) { // Check if still attached to scene
            // Pulsing scale effect
            const pulsePhase = (elapsed % pulseDuration) / pulseDuration; // 0 to 1
            const scale = 1 + 0.15 * Math.sin(pulsePhase * Math.PI * 2); // Gentle pulse
            indicator.scale.set(scale, 1, scale);

            // Fading out effect (start fading halfway through lifetime)
            const fadeStart = lifetime / 2;
            let opacity = 0.8;
            if (elapsed > fadeStart) {
                opacity = 0.8 * (1 - (elapsed - fadeStart) / (lifetime - fadeStart));
            }

            material.opacity = Math.max(0, opacity);
            ringMaterial.opacity = Math.max(0, opacity * 0.75);

            // Keep requesting frames
            requestAnimationFrame(animateIndicator);
        } else if (indicator.parent) {
            // Lifetime ended or detached, start cleanup
            scene.remove(indicator);
            // Dispose of geometries and materials
            geometry.dispose();
            material.dispose();
            ringGeometry.dispose();
            ringMaterial.dispose();
            // console.log('Auto-cleaned click indicator.');
        }
    }

    // Start the animation loop
    animateIndicator();

    // Add a name for easier debugging if needed
    indicator.name = "ClickIndicator";
    ring.name = "ClickIndicatorRing";

    return indicator;
};

/**
 * Hook to handle mouse click interactions for movement, gathering, and item pickups.
 */
export const useInteraction = ({
    sceneRef,
    cameraRef,
    resourceNodesRef,
    worldItemsRef,
    canvasRef,
    playerRef,
    playerControllerRef,
    itemManagerRef
}: InteractionOptions) => {
    const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
    const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
    const isGathering = useRef(false);
    const gatheringTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    // References to track current interaction state and the indicator mesh
    const currentInteractionPromise = useRef<Promise<void> | null>(null);
    const clickIndicatorRef = useRef<THREE.Mesh | null>(null);
    
    // Ref to track movement completion
    const movementCompletedRef = useRef(false);
    
    // Add state for context menu
    const [contextMenuPos, setContextMenuPos] = useState<{ x: number, y: number } | null>(null);
    const [nearbyItems, setNearbyItems] = useState<WorldItem[]>([]);

    // --- Cleanup Function for Indicator ---
    const removeClickIndicator = useCallback(() => {
        if (clickIndicatorRef.current && sceneRef.current) {
            const indicator = clickIndicatorRef.current;
            const scene = sceneRef.current;

            // Stop any ongoing animation related to this specific indicator if possible
            // (The 'animateIndicator' function above handles detachment check)

            scene.remove(indicator); // Remove from scene

            // Dispose children (ring) first
            indicator.children.forEach((child) => {
                if (child instanceof THREE.Mesh) {
                    child.geometry?.dispose();
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material?.dispose();
                    }
                }
            });
            indicator.clear(); // Remove children from the indicator object itself

            // Dispose main indicator resources
            indicator.geometry?.dispose();
             if (Array.isArray(indicator.material)) {
                indicator.material.forEach(m => m.dispose());
            } else {
                indicator.material?.dispose();
            }

            clickIndicatorRef.current = null;
            // console.log('Manually removed click indicator and resources.');
        }
    }, [sceneRef]);

    // Function to close the context menu
    const closeContextMenu = useCallback(() => {
        setContextMenuPos(null);
        setNearbyItems([]);
    }, []);

    // --- Main Click Handler ---
    const handleMouseClick = useCallback((e: MouseEvent) => {
        console.log("%c 🖱️ handleMouseClick CALLED", "background: purple; color: white; font-size: 16px;", {
            eventType: e.type,
            button: e.button,
            clientX: e.clientX,
            clientY: e.clientY,
            target: e.target
        });
        
        // Log references to help debug
        console.log("%c 🛠️ INTERACTION DEPENDENCIES", "background: blue; color: white;", {
            sceneExists: !!sceneRef.current,
            cameraExists: !!cameraRef.current,
            canvasExists: !!canvasRef.current,
            playerExists: !!playerRef.current,
            controllerExists: !!playerControllerRef?.current
        });
        
        // Check basic requirements first
        if (e.button !== 0 || !sceneRef.current || !cameraRef.current || !canvasRef.current || !playerRef.current) {
            console.warn("%c ⚠️ Early return - missing basic dependencies", "color: orange;", {
                button: e.button,
                scene: !!sceneRef.current,
                camera: !!cameraRef.current,
                canvas: !!canvasRef.current,
                player: !!playerRef.current
            });
            return;
        }
        
        // Check PlayerController separately - for better debug info
        if (!playerControllerRef?.current) {
            console.warn("%c ⚠️ PlayerController not available yet - will try to continue with limited functionality", "color: orange; font-weight: bold;");
            // Continue execution - we'll handle the controller absence later
        }
        
        // Even if the controller is null, we can still set up the interaction state
        // so we're ready when it becomes available
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const canvas = canvasRef.current;
        const player = playerRef.current;
        
        // Get socket - need to handle as async 
        const socketPromise = getSocket();

        // If we have playerController, interrupt any previous movement
        const controller = playerControllerRef?.current;
        if (controller) {
            controller.interruptMovement();
        }
        
        // Always remove previous click indicator
        removeClickIndicator();

        // Calculate mouse NDC
        const rect = canvas.getBoundingClientRect();
        mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        // Update raycaster
        raycasterRef.current.setFromCamera(mouseRef.current, camera);

        // --- Interaction Priority: Items > Resources > Ground ---

        // 1. Check World Items
        const itemMeshes = worldItemsRef.current?.map(item => {
            if (item && item.mesh) return item.mesh;
            return null;
        }).filter(Boolean) as THREE.Object3D[] || [];
        
        const itemIntersects = itemMeshes.length > 0 ? raycasterRef.current.intersectObjects(itemMeshes) : [];

        if (itemIntersects.length > 0) {
            const intersectedItemMesh = itemIntersects[0].object;
            const worldItem = worldItemsRef.current?.find(item => item.mesh === intersectedItemMesh);

            if (worldItem && worldItem.dropId) {
                console.log(`Clicked on item: ${worldItem.itemType || 'Unknown'} (ID: ${worldItem.dropId})`);
                soundManager.play('uiSelect' as any);

                // Make sure we have a valid mesh with a position
                if (!worldItem.mesh || !worldItem.mesh.position) {
                    console.error("Item has no valid mesh position");
                    return;
                }

                const itemPosition = worldItem.mesh.position.clone();
                itemPosition.y = player.position.y; // Target position at player's height

                // Create new indicator at item location
                clickIndicatorRef.current = createClickIndicator(scene, itemPosition);

                // Reset movement completion flag
                movementCompletedRef.current = false;

                // Continue only if controller is available
                if (controller) {
                    // Start moving towards the item
                    currentInteractionPromise.current = controller.moveToPosition(itemPosition);
                    if (currentInteractionPromise.current) {
                        currentInteractionPromise.current.then(() => {
                            // Movement finished
                            movementCompletedRef.current = true;
                            
                            // Check if the item still exists
                            const latestWorldItem = worldItemsRef.current?.find(item => item.dropId === worldItem.dropId);
                            if (latestWorldItem && movementCompletedRef.current) {
                                console.log(`Arrived at item ${worldItem.dropId}. Sending pickup request.`);
                                
                                // Send pickup request
                                socketPromise.then(socket => {
                                    if (socket) {
                                        socket.emit('pickup', worldItem.dropId);
                                    }
                                });
                            }
                            removeClickIndicator(); // Clean up indicator on arrival/cancellation
                        }).catch(err => {
                            console.error("Error during walk-to-item:", err);
                            removeClickIndicator();
                        });
                    }
                } else {
                    console.warn("%c ⏳ Cannot move to item - PlayerController not available", "color: orange; font-weight: bold;");
                }
                return; // Stop further processing
            }
        }

        // 2. Check Resource Nodes
        const resourceMeshes = resourceNodesRef.current?.map(node => {
            if (node && node.mesh) return node.mesh;
            return null;
        }).filter(Boolean) as THREE.Object3D[] || [];
        
        const resourceIntersects = resourceMeshes.length > 0 ? raycasterRef.current.intersectObjects(resourceMeshes) : [];

        if (resourceIntersects.length > 0) {
            const intersectedResourceMesh = resourceIntersects[0].object;
            const resourceNode = resourceNodesRef.current?.find(node => node.mesh === intersectedResourceMesh);

            if (resourceNode && resourceNode.id) {
                const resourceType = resourceNode.type || 'Unknown';
                console.log(`Clicked on resource: ${resourceType} (ID: ${resourceNode.id})`);
                soundManager.play('uiSelect' as any); // Use a consistent select sound

                // Make sure we have a valid mesh with a position
                if (!resourceNode.mesh || !resourceNode.mesh.position) {
                    console.error("Resource has no valid mesh position");
                    return;
                }

                const resourcePosition = resourceNode.mesh.position;
                const distance = player.position.distanceTo(resourcePosition);
                const interactionRange = 2.5; // How close player needs to be

                if (distance <= interactionRange) {
                    // Already in range - interact immediately
                    if (!isGathering.current) {
                        isGathering.current = true;
                        console.log(`Gathering resource ${resourceNode.id} (already in range).`);
                        
                        socketPromise.then(socket => {
                            if (socket) {
                                socket.emit('gather', resourceNode.id);
                            }
                        });
                        
                        soundManager.play('resourceGather' as any); // Play gathering sound
                        gatheringTimeoutRef.current = setTimeout(() => {
                            isGathering.current = false;
                        }, GATHERING_COOLDOWN);
                    }
                } else {
                    // Out of range - move closer, but only if controller is available
                    if (controller) {
                        const direction = new THREE.Vector3().subVectors(resourcePosition, player.position).normalize();
                        // Target position slightly away from the node center
                        const targetPosition = new THREE.Vector3()
                            .copy(resourcePosition)
                            .addScaledVector(direction, -interactionRange * 0.8); // Move to edge of range
                        targetPosition.y = player.position.y; // Maintain player height

                        // Create new indicator near the resource
                        clickIndicatorRef.current = createClickIndicator(scene, targetPosition);

                        // Reset movement completion flag
                        movementCompletedRef.current = false;

                        // Start moving towards the resource edge
                        currentInteractionPromise.current = controller.moveToPosition(targetPosition);
                        if (currentInteractionPromise.current) {
                            currentInteractionPromise.current.then(() => {
                                // Movement finished
                                movementCompletedRef.current = true;
                                
                                // Check if movement completed naturally & still out of gather cooldown
                                if (!isGathering.current && movementCompletedRef.current) {
                                    const currentDistance = player.position.distanceTo(resourcePosition);
                                    if (currentDistance <= interactionRange) {
                                        isGathering.current = true;
                                        console.log(`Arrived at resource ${resourceNode.id}. Sending gather request.`);
                                        
                                        socketPromise.then(socket => {
                                            if (socket) {
                                                socket.emit('gather', resourceNode.id);
                                            }
                                        });
                                        
                                        soundManager.play('resourceGather' as any);
                                        gatheringTimeoutRef.current = setTimeout(() => {
                                            isGathering.current = false;
                                        }, GATHERING_COOLDOWN);
                                    } else {
                                        console.warn("Arrived near resource but still out of range.");
                                    }
                                }
                                removeClickIndicator(); // Clean up indicator
                            }).catch(err => {
                                console.error("Error during walk-to-resource:", err);
                                removeClickIndicator();
                            });
                        }
                    } else {
                        console.warn("%c ⏳ Cannot move to resource - PlayerController not available", "color: orange; font-weight: bold;");
                    }
                }
                return; // Stop further processing
            }
        }

        // 3. Handle Ground Click (if no items or resources were hit)
        // CRITICAL FIX: Create ground plane at Y=0 instead of player's Y level
        // For stability in intersection testing
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const targetPoint = new THREE.Vector3();

        console.log("%c 🌎 CHECKING GROUND CLICK", "background: #009688; color: white;", {
            rayOrigin: raycasterRef.current.ray.origin,
            rayDirection: raycasterRef.current.ray.direction,
            groundPlaneNormal: groundPlane.normal,
            groundPlaneConstant: groundPlane.constant,
            mouseX: mouseRef.current.x,
            mouseY: mouseRef.current.y
        });

        // FALLBACK: Try a direct approach if normal raycasting fails
        const intersectionResult = raycasterRef.current.ray.intersectPlane(groundPlane, targetPoint);
        let groundIntersectionSuccessful = !!intersectionResult;
        
        if (!groundIntersectionSuccessful) {
            console.warn("🔄 Primary ground intersection failed, trying alternative approach");
            
            // Calculate intersection with a fixed plane at Y=0
            const origin = raycasterRef.current.ray.origin.clone();
            const direction = raycasterRef.current.ray.direction.clone();
            
            // If the ray is not pointing downward enough, it won't hit the plane
            if (direction.y > -0.1) {
                // Force direction to point slightly downward
                direction.y = -0.1;
                direction.normalize();
            }
            
            // t = -(origin.y) / direction.y
            const t = -(origin.y) / direction.y;
            targetPoint.copy(origin).addScaledVector(direction, t);
            
            groundIntersectionSuccessful = true;
            console.log("🎯 Alternative ground intersection succeeded:", targetPoint);
        }

        if (groundIntersectionSuccessful) {
            console.log("%c 🎯 GROUND INTERSECTION SUCCESSFUL! Target:", "background: #4CAF50; color: white; font-size: 16px;", {
                x: targetPoint.x.toFixed(2),
                y: targetPoint.y.toFixed(2),
                z: targetPoint.z.toFixed(2)
            });
            soundManager.play('itemDrop' as any); // A subtle "step" or "move command" sound

            // Reset movement completion flag
            movementCompletedRef.current = false;

            // Create new indicator at the ground click location
            console.log("%c 🔍 Creating click indicator", "color: #ff9800;");
            clickIndicatorRef.current = createClickIndicator(scene, targetPoint);
            console.log("%c ✓ Click indicator created:", "color: #ff9800;", !!clickIndicatorRef.current);

            // Start moving to the location only if controller is available
            if (controller) {
                console.log("%c 🚶 Calling controller.moveToPosition()", "background: #009688; color: white;");
                try {
                    currentInteractionPromise.current = controller.moveToPosition(targetPoint);
                    if (currentInteractionPromise.current) {
                        console.log("%c ✓ moveToPosition promise created successfully", "color: #4CAF50;");
                        currentInteractionPromise.current.then(() => {
                            // Movement finished naturally
                            console.log("%c ✓ Movement completed", "color: #4CAF50;");
                            movementCompletedRef.current = true;
                            removeClickIndicator(); // Clean up indicator on arrival
                        }).catch(err => {
                            console.error("%c ❌ Movement error:", "color: red;", err);
                            removeClickIndicator(); // Clean up indicator on error/cancellation
                        });
                    } else {
                        console.warn("%c ⚠️ moveToPosition did not return a promise", "color: orange;");
                    }
                } catch (err) {
                    console.error("%c ❌ Error calling moveToPosition:", "background: red; color: white;", err);
                }

                // Debug log to verify ground click handling
                console.log("%c 🎯 GROUND CLICK - MOVING PLAYER", "background: #4CAF50; color: white;", {
                    playerController: !!controller,
                    playerPosition: playerRef.current.position,
                    targetPoint,
                    indicator: !!clickIndicatorRef.current
                });
            } else {
                console.warn("%c ⏳ Cannot move to ground location - PlayerController not available", "color: orange; font-weight: bold;");
            }
        }

    }, [sceneRef, cameraRef, canvasRef, resourceNodesRef, worldItemsRef, playerRef, playerControllerRef, removeClickIndicator]); // Added removeClickIndicator dependency

    // --- Effect for Cleanup ---
    useEffect(() => {
        return () => {
            console.log("Cleaning up interaction resources");
            removeClickIndicator();
            // Interrupt any active player movement on unmount
            if (playerControllerRef?.current) {
                playerControllerRef.current.interruptMovement();
            }
        };
    }, [removeClickIndicator, playerControllerRef]); // Ensure cleanup runs if removeClickIndicator changes

    // Handle right click for context menu
    const handleRightClick = useCallback((e: MouseEvent) => {
        console.log("%c 🖱️ handleRightClick CALLED", "background: green; color: white; font-size: 16px;", {
            eventType: e.type,
            button: e.button,
            clientX: e.clientX,
            clientY: e.clientY,
            target: e.target
        });
        
        // Prevent default browser context menu
        e.preventDefault();
        
        // Check basic requirements first
        if (!sceneRef.current || !cameraRef.current || !canvasRef.current || !playerRef.current) {
            console.warn("Missing necessary refs for right-click interaction");
            return;
        }
        
        const scene = sceneRef.current;
        const camera = cameraRef.current;
        const canvas = canvasRef.current;
        const player = playerRef.current;
        
        // Calculate mouse NDC for raycasting
        const rect = canvas.getBoundingClientRect();
        mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
        
        // Update raycaster
        raycasterRef.current.setFromCamera(mouseRef.current, camera);
        
        // Get all world items
        const worldItems = worldItemsRef.current || [];

        // Check if we're directly clicking on an item first
        const itemMeshes = worldItems
            .filter(item => item && item.mesh)
            .map(item => item.mesh) as THREE.Object3D[];
            
        const itemIntersects = itemMeshes.length > 0 ? raycasterRef.current.intersectObjects(itemMeshes) : [];
        
        // If directly clicking on an item, find that specific item
        if (itemIntersects.length > 0) {
            const intersectedItemMesh = itemIntersects[0].object;
            const worldItem = worldItems.find(item => item.mesh === intersectedItemMesh);
            
            if (worldItem) {
                // Show context menu with just this item
                setNearbyItems([worldItem]);
                setContextMenuPos({ x: e.clientX, y: e.clientY });
                return;
            }
        }
        
        // If not clicking directly on an item, check for ground intersection
        // to find nearby items relative to that point
        const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const targetPoint = new THREE.Vector3();
        raycasterRef.current.ray.intersectPlane(groundPlane, targetPoint);
        
        // Find items within a certain radius of the ground click
        const MAX_ITEM_RADIUS = 3; // Items within 3 units of the click
        const nearbyWorldItems = worldItems.filter(item => {
            if (!item.mesh) return false;
            
            const itemPos = new THREE.Vector3(item.x, item.y, item.z);
            const horizontalDistSq = 
                Math.pow(itemPos.x - targetPoint.x, 2) + 
                Math.pow(itemPos.z - targetPoint.z, 2);
                
            return horizontalDistSq <= MAX_ITEM_RADIUS * MAX_ITEM_RADIUS;
        });
        
        // If there are nearby items, show the context menu
        if (nearbyWorldItems.length > 0) {
            setNearbyItems(nearbyWorldItems);
            setContextMenuPos({ x: e.clientX, y: e.clientY });
            console.log(`Found ${nearbyWorldItems.length} nearby items`, nearbyWorldItems);
        } else {
            // No items nearby, close any open context menu
            closeContextMenu();
        }
    }, [sceneRef, cameraRef, canvasRef, playerRef, worldItemsRef, closeContextMenu]);
    
    // After a failed pickup attempt, refresh the world items list
    const refreshWorldItems = useCallback(() => {
        console.log("Refreshing world items list after failed pickup attempt");
        
        // Use the itemManager if available (more direct)
        if (itemManagerRef?.current) {
            console.log("Using itemManager to request fresh world items");
            itemManagerRef.current.requestWorldItems();
            return;
        }
        
        // Fallback - using raw socket emit
        getSocket().then(socket => {
            if (socket) {
                // Using raw emit since type checking would require adding this to the interface
                // The server definitely supports this event, we just need to cast to any
                (socket as any).emit('getWorldItems');
                console.log("Requested fresh world items from server (fallback method)");
            }
        });
    }, [itemManagerRef]);

    // Handle item pickup from context menu
    const handlePickupItemFromMenu = useCallback((itemDropId: string) => {
        console.log(`%c 🔍 CONTEXT MENU PICKUP: ${itemDropId}`, "background: #4CAF50; color: white; font-size: 14px;");
        closeContextMenu();
        
        // Find the item in worldItems
        const worldItem = worldItemsRef.current?.find(item => item.dropId === itemDropId);
        console.log("World items:", worldItemsRef.current?.length, "Looking for item with ID:", itemDropId);
        
        if (!worldItem) {
            console.error("Item not found in worldItems:", itemDropId);
            refreshWorldItems();
            return;
        }
        
        if (!worldItem.mesh) {
            console.error("Item has no mesh:", worldItem);
            return;
        }
        
        if (!playerRef.current) {
            console.error("Player ref is null");
            return;
        }
        
        if (!sceneRef.current) {
            console.error("Scene ref is null");
            return;
        }
        
        console.log("Found world item:", {
            type: worldItem.itemType,
            dropId: worldItem.dropId,
            position: `(${worldItem.x}, ${worldItem.y}, ${worldItem.z})`
        });
        
        const scene = sceneRef.current;
        const player = playerRef.current;
        const controller = playerControllerRef?.current;
        
        // Calculate distance to the item
        const itemPosition = worldItem.mesh.position.clone();
        const distance = player.position.distanceTo(itemPosition);
        console.log(`Distance to item: ${distance.toFixed(2)} units (pickup range: 2 units)`);
        
        // Set the item position to player height for movement
        itemPosition.y = player.position.y;
        
        // TESTING WORKAROUND: Simulate left-click on item
        console.log(`%c 🧪 SIMULATING LEFT-CLICK ON ITEM`, "background: red; color: white; font-size: 14px;");
        
        if (distance <= 2) {
            // Within range - pickup immediately
            console.log("Item within range - attempting immediate pickup via simulated left-click");
            
            // Direct socket call
            getSocket().then(socket => {
                if (socket) {
                    console.log(`Emitting 'pickup' event with string dropId: "${itemDropId}"`);
                    // Try sending as a plain string, not an object
                    socket.emit('pickup', String(itemDropId));
                    
                    // Set up temporary error listener for this pickup attempt
                    const errorHandler = (error: string) => {
                        console.error(`Server error during pickup: ${error}`);
                        if (error.includes('not found')) {
                            refreshWorldItems();
                        }
                    };
                    
                    // Add and then remove error handler after a delay
                    socket.once('error', errorHandler);
                    setTimeout(() => {
                        socket.off('error', errorHandler);
                    }, 3000);
                    
                    // Log what we're sending
                    console.log("Sent pickup event with payload:", itemDropId, "Type:", typeof itemDropId);
                    
                    soundManager.play('itemPickup' as any);
                } else {
                    console.error("Failed to get socket for item pickup");
                }
            }).catch(err => {
                console.error("Socket error:", err);
            });
        } else {
            // SAME CODE FOR MOVING TO ITEM
            // Too far - need to move closer
            console.log(`Item too far away (${distance.toFixed(2)} units) - need to move closer`);
            
            if (!controller) {
                console.error("PlayerController not available for movement");
                return;
            }
            
            console.log("Starting movement to item position:", itemPosition);
            
            // Remove previous indicator and create a new one
            removeClickIndicator();
            clickIndicatorRef.current = createClickIndicator(scene, itemPosition);
            
            // Reset movement flag
            movementCompletedRef.current = false;
            
            // Store the itemId for use after movement completes
            const pickupItemId = itemDropId;
            
            // Move to the item using a different movement approach
            console.log("Using modified movement approach for right-click pickup");
            controller.moveToPosition(itemPosition)
                .then(() => {
                    console.log("Reached item position, attempting pickup");
                    
                    // After reaching the item, try to pick it up
                    const updatedWorldItem = worldItemsRef.current?.find(item => item.dropId === pickupItemId);
                    if (updatedWorldItem) {
                        getSocket().then(socket => {
                            if (socket) {
                                console.log(`Emitting 'pickup' event with string dropId: "${pickupItemId}"`);
                                // Try sending as a plain string, not an object
                                socket.emit('pickup', String(pickupItemId));
                                
                                // Set up temporary error listener for this pickup attempt
                                const errorHandler = (error: string) => {
                                    console.error(`Server error during pickup after movement: ${error}`);
                                    if (error.includes('not found')) {
                                        refreshWorldItems();
                                    }
                                };
                                
                                // Add and then remove error handler after a delay
                                socket.once('error', errorHandler);
                                setTimeout(() => {
                                    socket.off('error', errorHandler);
                                }, 3000);
                                
                                console.log("Sent pickup event with payload:", pickupItemId, "Type:", typeof pickupItemId);
                                soundManager.play('itemPickup' as any);
                            } else {
                                console.error("Failed to get socket for item pickup after movement");
                            }
                        });
                    } else {
                        console.log("Item no longer exists after reaching it");
                    }
                    removeClickIndicator();
                })
                .catch(err => {
                    console.error("Error walking to item:", err);
                    removeClickIndicator();
                });
        }
    }, [playerRef, worldItemsRef, sceneRef, playerControllerRef, removeClickIndicator, closeContextMenu, refreshWorldItems]);
    
    // Add cleanup for context menu when component unmounts
    useEffect(() => {
        return () => {
            closeContextMenu();
        };
    }, [closeContextMenu]);

    // Return the handlers and context menu state
    return { 
        handleMouseClick,
        handleRightClick,
        contextMenuPos,
        nearbyItems,
        closeContextMenu,
        handlePickupItemFromMenu
    };
}; 