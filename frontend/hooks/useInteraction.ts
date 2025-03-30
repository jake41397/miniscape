import { useRef, useCallback, useEffect, useState } from 'react';
import * as THREE from 'three';
import { getSocket } from '../game/network/socket';
import soundManager from '../game/audio/soundManager';
import { ResourceNode, WorldItem, ResourceType } from '../game/world/resources';
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
    const [nearbyResources, setNearbyResources] = useState<ResourceNode[]>([]);

    // Add state for pickup progress
    const [pickupInProgress, setPickupInProgress] = useState(false);
    const [pickupErrorMessage, setPickupErrorMessage] = useState<string | null>(null);

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
        setNearbyResources([]);
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
                                
                                // Send pickup request using both formats for maximum compatibility
                                socketPromise.then(socket => {
                                    if (socket) {
                                        console.log(`Sending pickupItem event with dropId: ${worldItem.dropId}`);
                                        
                                        // Format 1: Object format
                                        (socket as any).emit('pickupItem', {
                                            dropId: worldItem.dropId,
                                            timestamp: Date.now()
                                        });
                                        
                                        // Format 2: String format (legacy)
                                        console.log("Also sending legacy pickup event for compatibility");
                                        (socket as any).emit('pickup', worldItem.dropId);
                                        
                                        // Set up listeners for confirmation
                                        const inventoryUpdateHandler = (updatedInventory: any) => {
                                            console.log("%c ✅ Received inventory update:", "background: #4CAF50; color: white;", updatedInventory);
                                            // Play successful pickup sound
                                            soundManager.play('itemPickup' as any);
                                        };
                                        
                                        const errorHandler = (error: string) => {
                                            console.error(`Server error during pickup: ${error}`);
                                            if (error.includes('not found')) {
                                                refreshWorldItems();
                                            }
                                        };
                                        
                                        // Add handlers with timeouts to remove them
                                        (socket as any).once('inventoryUpdate', inventoryUpdateHandler);
                                        (socket as any).once('error', errorHandler);
                                        setTimeout(() => {
                                            (socket as any).off('inventoryUpdate', inventoryUpdateHandler);
                                            (socket as any).off('error', errorHandler);
                                        }, 3000);
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
        
        console.log(`%c 👁️ Checking ${resourceMeshes.length} resource meshes for intersection`, "color: #673AB7;");
        console.log(`Resource types:`, resourceNodesRef.current?.map(node => `${node.id}: ${node.type}`).slice(0, 5));
        
        // Set recursive to true to check children of meshes (important for fishing spots)
        const resourceIntersects = resourceMeshes.length > 0 ? 
            raycasterRef.current.intersectObjects(resourceMeshes, true) : [];
        
        console.log(`%c 🎯 Found ${resourceIntersects.length} resource intersections`, 
            resourceIntersects.length > 0 ? "color: #4CAF50; font-weight: bold;" : "color: #F44336;");
        
        // If directly clicking on a resource, find that specific resource
        if (resourceIntersects.length > 0) {
            const intersectedObject = resourceIntersects[0].object;
            console.log(`%c ✓ Hit detected on object:`, "color: #4CAF50;", {
                name: intersectedObject.name,
                id: intersectedObject.id,
                type: intersectedObject.type,
                userData: intersectedObject.userData,
                parent: intersectedObject.parent ? intersectedObject.parent.id : 'none'
            });
            
            // Find the resource node - this could be the top mesh or a child mesh
            const resourceNode = resourceNodesRef.current?.find(node => {
                // Direct match
                if (node.mesh === intersectedObject) return true;
                
                // Check if it's a child of the resource mesh
                if (node.mesh && intersectedObject.parent === node.mesh) return true;
                
                // For nested hierarchies
                let parent = intersectedObject.parent;
                while (parent) {
                    if (parent === node.mesh) return true;
                    parent = parent.parent;
                }
                
                return false;
            });
            
            if (resourceNode) {
                console.log("%c 🎯 Right-click hit on resource:", "background: #4CAF50; color: white;", {
                    resourceId: resourceNode.id,
                    resourceType: resourceNode.type,
                    metadata: resourceNode.metadata,
                    position: `(${resourceNode.x}, ${resourceNode.y}, ${resourceNode.z})`
                });
                
                // Show context menu with just this resource
                setNearbyResources([resourceNode]);
                setNearbyItems([]);
                setContextMenuPos({ x: e.clientX, y: e.clientY });
                return;
            } else {
                console.log("%c ❌ Could not find matching resource node for intersected object", 
                    "background: #F44336; color: white;");
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
        // Get all resource nodes
        const resourceNodes = resourceNodesRef.current || [];

        // Check if we're clicking on a resource node
        const resourceMeshes = resourceNodes
            .filter(node => node && node.mesh)
            .map(node => node.mesh) as THREE.Object3D[];
            
        console.log(`%c 👁️ Checking ${resourceMeshes.length} resource meshes for intersection`, "color: #673AB7;");
        console.log(`Resource types:`, resourceNodes.map(node => `${node.id}: ${node.type}`).slice(0, 5));
        
        // Set recursive to true to check children of meshes (important for fishing spots)
        const resourceIntersects = resourceMeshes.length > 0 ? 
            raycasterRef.current.intersectObjects(resourceMeshes, true) : [];
        
        console.log(`%c 🎯 Found ${resourceIntersects.length} resource intersections`, 
            resourceIntersects.length > 0 ? "color: #4CAF50; font-weight: bold;" : "color: #F44336;");
        
        // If directly clicking on a resource, find that specific resource
        if (resourceIntersects.length > 0) {
            const intersectedObject = resourceIntersects[0].object;
            console.log(`%c ✓ Hit detected on object:`, "color: #4CAF50;", {
                name: intersectedObject.name,
                id: intersectedObject.id,
                type: intersectedObject.type,
                userData: intersectedObject.userData,
                parent: intersectedObject.parent ? intersectedObject.parent.id : 'none'
            });
            
            // Find the resource node - this could be the top mesh or a child mesh
            const resourceNode = resourceNodes.find(node => {
                // Direct match
                if (node.mesh === intersectedObject) return true;
                
                // Check if it's a child of the resource mesh
                if (node.mesh && intersectedObject.parent === node.mesh) return true;
                
                // For nested hierarchies
                let parent = intersectedObject.parent;
                while (parent) {
                    if (parent === node.mesh) return true;
                    parent = parent.parent;
                }
                
                return false;
            });
            
            if (resourceNode) {
                console.log("%c 🎯 Right-click hit on resource:", "background: #4CAF50; color: white;", {
                    resourceId: resourceNode.id,
                    resourceType: resourceNode.type,
                    metadata: resourceNode.metadata,
                    position: `(${resourceNode.x}, ${resourceNode.y}, ${resourceNode.z})`
                });
                
                // Show context menu with just this resource
                setNearbyResources([resourceNode]);
                setNearbyItems([]);
                setContextMenuPos({ x: e.clientX, y: e.clientY });
                return;
            } else {
                console.log("%c ❌ Could not find matching resource node for intersected object", 
                    "background: #F44336; color: white;");
            }
        }

        // Check if we're directly clicking on an item
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
                setNearbyResources([]);
                setContextMenuPos({ x: e.clientX, y: e.clientY });
                return;
            }
        }
        
        // If not clicking directly on an item or resource, check for ground intersection
        // to find nearby items and resources relative to that point
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
        
        // Find resources within a certain radius of the ground click
        const nearbyWorldResources = resourceNodes.filter(resource => {
            if (!resource.mesh) return false;
            
            const resourcePos = new THREE.Vector3(resource.x, resource.y, resource.z);
            const horizontalDistSq = 
                Math.pow(resourcePos.x - targetPoint.x, 2) + 
                Math.pow(resourcePos.z - targetPoint.z, 2);
                
            return horizontalDistSq <= MAX_ITEM_RADIUS * MAX_ITEM_RADIUS;
        });
        
        // If there are nearby items or resources, show the context menu
        if (nearbyWorldItems.length > 0 || nearbyWorldResources.length > 0) {
            setNearbyItems(nearbyWorldItems);
            setNearbyResources(nearbyWorldResources);
            setContextMenuPos({ x: e.clientX, y: e.clientY });
            console.log(`Found ${nearbyWorldItems.length} nearby items and ${nearbyWorldResources.length} nearby resources`);
        } else {
            // No items or resources nearby, close any open context menu
            closeContextMenu();
        }
    }, [sceneRef, cameraRef, canvasRef, playerRef, worldItemsRef, resourceNodesRef, closeContextMenu]);
    
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
    const handlePickupItemFromMenu = useCallback(async (itemDropId: string) => {
        console.log(`%c 🖱️ Handling pickup from context menu for item: ${itemDropId}`, "background: #9C27B0; color: white; font-size: 14px;");
        
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
        
        try {
            if (distance <= 2) {
                // Within range - pickup immediately
                console.log("Item within range - attempting immediate pickup");
                
                // Use our new ItemManager pickup method
                if (itemManagerRef?.current) {
                    console.log(`Using ItemManager.pickupItem method for ${itemDropId}`);
                    await itemManagerRef.current.pickupItem(itemDropId);
                    
                    // Play successful pickup sound
                    soundManager.play('itemPickup' as any);
                } else {
                    console.error("ItemManager ref not available for pickup");
                    
                    // Fall back to socket method
                    const socket = await getSocket();
                    if (!socket) {
                        console.error("Failed to get socket for item pickup");
                        return;
                    }
                    
                    console.log(`%c 📡 Falling back to direct socket emission for pickupItem: ${itemDropId}`, "color: #FF9800;");
                    (socket as any).emit('pickupItem', {
                        dropId: itemDropId,
                        timestamp: Date.now()
                    });
                }
                
                // Close menu
                closeContextMenu();
            } else {
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
                
                // Move to the item and then pick it up
                try {
                    await controller.moveToPosition(itemPosition);
                    console.log("Reached item position, attempting pickup");
                    
                    // After reaching the item, try to pick it up
                    const updatedWorldItem = worldItemsRef.current?.find(item => item.dropId === itemDropId);
                    if (updatedWorldItem) {
                        // Use our new ItemManager pickup method
                        if (itemManagerRef?.current) {
                            console.log(`Using ItemManager.pickupItem method for ${itemDropId} after movement`);
                            await itemManagerRef.current.pickupItem(itemDropId);
                            
                            // Play successful pickup sound
                            soundManager.play('itemPickup' as any);
                        } else {
                            console.error("ItemManager ref not available for pickup after movement");
                            
                            // Fall back to socket method
                            const socket = await getSocket();
                            if (socket) {
                                console.log(`%c 📡 Falling back to direct socket emission for pickupItem: ${itemDropId}`, "color: #FF9800;");
                                (socket as any).emit('pickupItem', {
                                    dropId: itemDropId,
                                    timestamp: Date.now()
                                });
                            }
                        }
                    } else {
                        console.log("Item no longer exists after reaching it");
                    }
                } catch (err) {
                    console.error("Error walking to item:", err);
                } finally {
                    removeClickIndicator();
                    closeContextMenu();
                }
            }
        } catch (error) {
            console.error("Error in item pickup process:", error);
            removeClickIndicator();
            closeContextMenu();
        }
    }, [playerRef, worldItemsRef, sceneRef, playerControllerRef, removeClickIndicator, closeContextMenu, refreshWorldItems, itemManagerRef]);
    
    // Add cleanup for context menu when component unmounts
    useEffect(() => {
        return () => {
            closeContextMenu();
        };
    }, [closeContextMenu]);

    // Handle resource interaction from context menu
    const handleResourceInteraction = useCallback(async (resourceId: string, action: string) => {
        console.log(`%c 🪓 Handling ${action} action for resource: ${resourceId}`, "background: #4CAF50; color: white; font-size: 14px;");
        console.log(`Available resources: ${resourceNodesRef.current?.length || 0}`);
        
        // List all available resources for debugging
        if (resourceNodesRef.current && resourceNodesRef.current.length > 0) {
            console.table(resourceNodesRef.current.map(r => ({
                id: r.id,
                type: r.type,
                has_mesh: !!r.mesh,
                position: r.mesh ? `(${r.mesh.position.x.toFixed(1)}, ${r.mesh.position.z.toFixed(1)})` : 'N/A'
            })));
        } else {
            console.error("No resources available in resourceNodesRef");
        }
        
        // Find the resource in resourceNodes
        const resourceNode = resourceNodesRef.current?.find(node => node.id === resourceId);
        
        if (!resourceNode) {
            console.error(`%c ❌ Resource not found:`, "background: red; color: white; font-size: 14px;", {
                lookingFor: resourceId,
                availableResources: resourceNodesRef.current?.map(r => ({ id: r.id, type: r.type }))
            });
            return;
        }
        
        if (!resourceNode.mesh) {
            console.error(`%c ❌ Resource has no mesh:`, "background: red; color: white; font-size: 14px;", resourceNode);
            return;
        }
        
        if (!playerRef.current) {
            console.error("Player mesh not available for resource interaction");
            return;
        }
        
        // Check if player is close enough to the resource
        const playerPos = playerRef.current.position;
        const resourcePos = resourceNode.mesh.position;
        const distance = Math.sqrt(
            Math.pow(playerPos.x - resourcePos.x, 2) +
            Math.pow(playerPos.z - resourcePos.z, 2)
        );
        
        console.log(`%c 📏 Distance to resource: ${distance.toFixed(2)}`, "color: #2196F3;");
        
        if (distance > 5) {
            console.log(`%c 🚶 Moving to resource before interacting...`, "color: #FF9800;");
            
            // First move close to the resource
            const movePos = new THREE.Vector3(
                resourcePos.x + (Math.random() - 0.5) * 2, // Random position near the resource
                playerPos.y,
                resourcePos.z + (Math.random() - 0.5) * 2
            );
            
            // Ensure we're not too close
            const dirToResource = new THREE.Vector3().subVectors(movePos, resourcePos).normalize();
            movePos.copy(resourcePos).addScaledVector(dirToResource, 2);
            
            try {
                // Use the player controller to move to the position
                if (playerControllerRef && playerControllerRef.current) {
                    await playerControllerRef.current.moveToPosition(movePos);
                    console.log(`%c ✅ Arrived at resource ${resourceId}. Ready to interact.`, "color: #4CAF50;");
                    
                    // Now that we're close, send the interaction event
                    const socket = await getSocket();
                    if (socket) {
                        console.log(`%c 🔄 Sending ${action} action to server for resource: ${resourceId}`, "color: #2196F3;");
                        // Use appropriate event based on the action type
                        if (action === 'fish' && resourceNode.type === ResourceType.FISHING_SPOT) {
                            (socket as any).emit('interactWithResource', { resourceId });
                        } else {
                            (socket as any).emit('gatherWithTool', { resourceId, action });
                        }
                    } else {
                        console.error("Failed to get socket for resource interaction");
                    }
                } else {
                    console.error("No player controller available for movement");
                }
            } catch (err) {
                console.error("Error moving to resource:", err);
            }
        } else {
            console.log(`%c ✅ Already close to resource. Sending interaction directly.`, "color: #4CAF50;");
            
            // We're already close, just send the interaction event
            const socket = await getSocket();
            if (socket) {
                console.log(`%c 🔄 Sending ${action} action to server for resource: ${resourceId}`, "color: #2196F3;");
                // Use appropriate event based on the action type
                if (action === 'fish' && resourceNode.type === ResourceType.FISHING_SPOT) {
                    (socket as any).emit('interactWithResource', { resourceId });
                } else {
                    (socket as any).emit('gatherWithTool', { resourceId, action });
                }
            } else {
                console.error("Failed to get socket for resource interaction");
            }
        }
    }, [resourceNodesRef, playerRef, playerControllerRef]);

    // Return the handlers and context menu state
    return { 
        handleMouseClick,
        handleRightClick,
        contextMenuPos,
        nearbyItems,
        nearbyResources,
        closeContextMenu,
        handlePickupItemFromMenu,
        handleResourceInteraction
    };
}; 