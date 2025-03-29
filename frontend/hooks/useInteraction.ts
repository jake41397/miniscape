import { useRef, useCallback, useEffect } from 'react';
import * as THREE from 'three';
import { getSocket } from '../game/network/socket';
import soundManager from '../game/audio/soundManager';
import { ResourceNode, WorldItem } from '../game/world/resources';
import { GATHERING_COOLDOWN } from '../constants';

interface InteractionOptions {
    sceneRef: React.RefObject<THREE.Scene | null>;
    cameraRef: React.RefObject<THREE.PerspectiveCamera | null>;
    resourceNodesRef: React.RefObject<ResourceNode[]>;
    worldItemsRef: React.RefObject<WorldItem[]>;
    canvasRef: React.RefObject<HTMLDivElement>;
}

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
    canvasRef
}: InteractionOptions) => {
    const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
    const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
    const isGathering = useRef(false);
    const gatheringTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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
                console.log(`Attempting to pick up item: ${itemType || 'Unknown'} (ID: ${dropId})`);
                getSocket().then(socket => {
                    if (socket) {
                        socket.emit('pickup', { dropId });
                        soundManager.play('itemPickup');
                    }
                }).catch(err => console.error("Error getting socket for pickup:", err));
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
                        socket.emit('gather', { resourceId, resourceType });

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
        }
    }, [sceneRef, cameraRef, canvasRef, resourceNodesRef, worldItemsRef]);

    // Cleanup effect for the timeout
    useEffect(() => {
        return () => {
            if (gatheringTimeoutRef.current) {
                clearTimeout(gatheringTimeoutRef.current);
            }
        };
    }, []);

    return { handleMouseClick };
}; 