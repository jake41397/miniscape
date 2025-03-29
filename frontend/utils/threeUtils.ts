import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { PLAYER_DEFAULT_Y, DEBUG } from '../constants';

/**
 * Creates a CSS2DObject name label for a given mesh.
 * Handles removing existing labels to prevent duplicates.
 * @param name The text content for the label.
 * @param mesh The THREE.Mesh to attach the label to.
 * @param scene The THREE.Scene to potentially remove old labels from.
 * @param nameLabelsRef A Ref containing a Map tracking existing labels by player ID.
 * @returns The created CSS2DObject label.
 */
export const createNameLabel = (
    name: string,
    mesh: THREE.Mesh,
    scene: THREE.Scene,
    nameLabelsRef: React.MutableRefObject<Map<string, CSS2DObject>>
): CSS2DObject => {
    const playerId = mesh.userData.playerId; // Assume playerId is stored in userData

    // --- Cleanup existing label ---
    // 1. Remove from tracking map and parent/scene if it exists
    if (playerId && nameLabelsRef.current.has(playerId)) {
        const existingLabel = nameLabelsRef.current.get(playerId);
        if (existingLabel) {
            if (existingLabel.parent) {
                existingLabel.parent.remove(existingLabel);
            }
            scene.remove(existingLabel); // Ensure removal from scene
            nameLabelsRef.current.delete(playerId);
        }
    }

    // 2. Remove any CSS2DObject children directly attached to the mesh
    const childrenToRemove: THREE.Object3D[] = [];
    mesh.children.forEach(child => {
        if ((child as any).isCSS2DObject) {
            childrenToRemove.push(child);
        }
    });
    childrenToRemove.forEach(child => {
        mesh.remove(child);
        // Optional: remove from scene as well, though parent removal should handle it
        scene.remove(child);
    });
    // --- End Cleanup ---

    // Create new label element
    const nameDiv = document.createElement('div');
    nameDiv.className = 'player-label';
    nameDiv.textContent = name;
    nameDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.6)';
    nameDiv.style.color = 'white';
    nameDiv.style.padding = '2px 6px';
    nameDiv.style.borderRadius = '3px';
    nameDiv.style.fontSize = '12px';
    nameDiv.style.fontFamily = 'Arial, sans-serif';
    nameDiv.style.fontWeight = 'bold';
    nameDiv.style.textAlign = 'center';
    nameDiv.style.userSelect = 'none';
    nameDiv.style.pointerEvents = 'none';

    const nameLabel = new CSS2DObject(nameDiv);
    nameLabel.position.set(0, 2.5, 0); // Position above the player mesh center
    nameLabel.userData.labelType = 'playerName';
    nameLabel.userData.forPlayer = playerId;

    // Add to tracking map if we have a playerId
    if (playerId) {
        nameLabelsRef.current.set(playerId, nameLabel);
    }

    // Add the new label to the mesh
    mesh.add(nameLabel);

    return nameLabel;
};

/**
 * Removes a specific name label associated with a player ID.
 * @param playerId The ID of the player whose label should be removed.
 * @param scene The THREE.Scene.
 * @param nameLabelsRef The Ref map tracking labels.
 */
export const removeNameLabel = (
    playerId: string,
    scene: THREE.Scene,
    nameLabelsRef: React.MutableRefObject<Map<string, CSS2DObject>>
) => {
    if (nameLabelsRef.current.has(playerId)) {
        const label = nameLabelsRef.current.get(playerId);
        if (label) {
            if (label.parent) {
                label.parent.remove(label);
            }
            scene.remove(label);
            nameLabelsRef.current.delete(playerId);
            console.log(`Removed name label for player ${playerId}`);
        }
    } else {
        console.warn(`Attempted to remove label for non-existent player ID: ${playerId}`);
    }
};

/**
 * Cleans up all tracked name labels.
 * @param scene The THREE.Scene.
 * @param nameLabelsRef The Ref map tracking labels.
 */
export const cleanupAllNameLabels = (
    scene: THREE.Scene,
    nameLabelsRef: React.MutableRefObject<Map<string, CSS2DObject>>
) => {
    nameLabelsRef.current.forEach((label, playerId) => {
        removeNameLabel(playerId, scene, nameLabelsRef);
    });
    nameLabelsRef.current.clear();

    // Do an additional traversal to catch any remaining CSS2DObjects
    scene.traverse((object) => {
        if ((object as any).isCSS2DObject) {
            if (object.parent) {
                object.parent.remove(object);
            }
            scene.remove(object);
            console.warn("Removed untracked CSS2DObject during final cleanup.");
        }
    });
};

/**
 * Safely disposes of a THREE.Mesh and its geometry/material(s).
 * @param scene The THREE.Scene to remove the mesh from.
 * @param mesh The THREE.Mesh to dispose.
 */
export const disposeMesh = (scene: THREE.Scene, mesh: THREE.Mesh) => {
    if (!mesh) return;
    scene.remove(mesh);
    if (mesh.geometry) mesh.geometry.dispose();
    if (mesh.material) {
        if (Array.isArray(mesh.material)) {
            mesh.material.forEach(material => material.dispose());
        } else {
            mesh.material.dispose();
        }
    }
};

/**
 * Sets up basic lighting for the scene.
 * @param scene The THREE.Scene to add lights to.
 */
export const setupLights = (scene: THREE.Scene) => {
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    // Add directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    return { ambientLight, directionalLight }; // Return if needed for cleanup
};

/**
 * Creates the initial player mesh.
 * @returns The player THREE.Mesh object.
 */
export const createPlayerMesh = (): THREE.Mesh => {
    const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
    const playerMaterial = new THREE.MeshStandardMaterial({
        color: 0x2196f3, // Blue color for player
    });
    const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
    playerMesh.position.set(0, PLAYER_DEFAULT_Y, 0); // Use constant
    return playerMesh;
};

/**
 * Renders debug visuals like position markers or velocity vectors.
 * @param scene The THREE.Scene.
 * @param playerRef Ref to the local player mesh.
 * @param playersRef Ref to the map of remote player meshes.
 */
export const updateDebugVisuals = (
    scene: THREE.Scene,
    playerRef: React.RefObject<THREE.Mesh | null>,
    playersRef: React.RefObject<Map<string, THREE.Mesh>>
) => {
    if (!scene || (!DEBUG.showPositionMarkers && !DEBUG.showVelocityVectors)) return;

    // Clear existing debug visuals first
    const objectsToRemove: THREE.Object3D[] = [];
    scene.children.forEach(child => {
        if (child.userData?.isDebugObject) {
            objectsToRemove.push(child);
        }
    });
    objectsToRemove.forEach(obj => scene.remove(obj));

    // Add Position Markers
    if (DEBUG.showPositionMarkers) {
        const markerGeometry = new THREE.SphereGeometry(0.1);
        const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });

        // Local player marker
        if (playerRef.current) {
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.copy(playerRef.current.position);
            marker.position.y += 2.5; // Offset above player
            marker.userData.isDebugObject = true;
            scene.add(marker);
        }

        // Remote players markers
        playersRef.current?.forEach(playerMesh => {
            const marker = new THREE.Mesh(markerGeometry, markerMaterial);
            marker.position.copy(playerMesh.position);
            marker.position.y += 2.5; // Offset above player
            marker.userData.isDebugObject = true;
            scene.add(marker);
        });
    }

    // Add Velocity Vectors
    if (DEBUG.showVelocityVectors) {
        const arrowMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });

        playersRef.current?.forEach(playerMesh => {
            const velocity = playerMesh.userData?.velocity || playerMesh.userData?.serverVelocity;
            if (velocity) {
                const velocityVec = new THREE.Vector3(velocity.x, 0, velocity.z);
                if (velocityVec.lengthSq() > 0.0001) {
                    const scale = 2.0;
                    const origin = playerMesh.position.clone().add(new THREE.Vector3(0, 1.5, 0));
                    const end = origin.clone().add(velocityVec.clone().multiplyScalar(scale));

                    const arrowGeometry = new THREE.BufferGeometry().setFromPoints([origin, end]);
                    const arrow = new THREE.Line(arrowGeometry, arrowMaterial);
                    arrow.userData.isDebugObject = true;
                    scene.add(arrow);
                }
            }
        });
    }
}; 