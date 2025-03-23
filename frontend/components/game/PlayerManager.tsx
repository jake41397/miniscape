import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
// import { useKeyboardControls } from '../../hooks/useKeyboardControls';
// Disable position prediction as it causes conflicts
// import { usePositionPrediction } from '../../hooks/usePositionPrediction';

interface PlayerManagerProps {
    scene: THREE.Scene;
    camera?: THREE.PerspectiveCamera;
    renderer?: THREE.WebGLRenderer;
    initialPosition?: THREE.Vector3;
    sendEvent?: (event: string, data: any) => void;
}

const PlayerManager: React.FC<PlayerManagerProps> = ({ scene, camera, renderer, initialPosition = new THREE.Vector3(0, 0, 0), sendEvent }) => {
    const loader = useRef(new GLTFLoader());
    const playerMesh = useRef<THREE.Group | null>(null);
    // Ref to track if player mesh is ready and active
    const playerReady = useRef(false);
    
    // IMPORTANT: Comment this out to avoid duplicate keyboard controls
    // const movement = useKeyboardControls(); 
    const clockRef = useRef(new THREE.Clock());
    // Disable position prediction as it may be causing movement issues
    // const { updateVelocity } = usePositionPrediction({ playerMesh: playerMesh.current, enabled: true });
    const lastSendTime = useRef<number>(0);
    // Track if animation is active
    const animationFrameId = useRef<number | null>(null);

    // More robustly expose the player mesh to the parent component
    useEffect(() => {
        if (playerMesh.current && typeof sendEvent === 'function') {
            // Add a custom property to the sendEvent function to provide the mesh reference
            (sendEvent as any).playerMeshRef = playerMesh;
            
            // Ensure the player mesh has the correct userData for identification
            playerMesh.current.userData = {
                ...playerMesh.current.userData,
                isPlayer: true,
                playerId: 'localPlayer'
            };
            
            // Move the player to the initial position if it's at origin
            if (playerMesh.current.position.distanceTo(new THREE.Vector3(0, 0, 0)) < 0.1) {
                playerMesh.current.position.copy(initialPosition);
                console.log("PlayerManager: Moved player to initial position:", initialPosition);
            }
            
            // Mark the player as ready for movement
            playerReady.current = true;
            console.log("PlayerManager: Player mesh is ready and exposed to controller", {
                position: playerMesh.current.position.clone(),
                userData: playerMesh.current.userData
            });
        }
    }, [playerMesh.current, sendEvent, initialPosition]);

    useEffect(() => {
        if(!initialPosition || !scene) {
            console.warn("PlayerManager: Scene or initialPosition is undefined, cannot create player");
            return;
        }
        
        // Create a fallback player mesh (simple cube)
        const createFallbackMesh = () => {
            console.log("Creating fallback player mesh (cube)");
            const geometry = new THREE.BoxGeometry(1, 2, 1);
            const material = new THREE.MeshStandardMaterial({ color: 0x1E90FF });
            const mesh = new THREE.Group();
            
            const playerCube = new THREE.Mesh(geometry, material);
            playerCube.castShadow = true;
            playerCube.receiveShadow = false;
            playerCube.position.y = 1; // Adjust to stand on ground
            
            mesh.add(playerCube);
            
            // Add user data for identification
            mesh.userData = { 
                isPlayer: true,
                playerId: 'localPlayer'
            };
            
            return mesh;
        };
        
        // Try to load the model, but use fallback if it fails
        loader.current.load(
            '/models/player.glb',
            (gltf: { scene: THREE.Group }) => {
                console.log("Player model loaded successfully");
                const model = gltf.scene;
                
                // Set up the model
                model.traverse((child: THREE.Object3D) => {
                    if (child instanceof THREE.Mesh) {
                        child.castShadow = true;
                        child.receiveShadow = false;
                    }
                });
                
                // Set the player's initial position
                model.position.copy(initialPosition);
                
                // Add user data for identification
                model.userData = { 
                    isPlayer: true,
                    playerId: 'localPlayer'
                };
                
                // Set the ref and add to scene
                playerMesh.current = model;
                scene.add(model);
                
                console.log("Player model added to scene at position:", model.position);
            },
            undefined,
            (error: unknown) => {
                console.error("Error loading player model:", error);
                const fallbackMesh = createFallbackMesh();
                fallbackMesh.position.copy(initialPosition);
                playerMesh.current = fallbackMesh;
                scene.add(fallbackMesh);
                console.log("Fallback player added to scene at position:", fallbackMesh.position);
            }
        );
        
        // Animation loop for player updates
        const animate = () => {
            if (playerMesh.current && playerReady.current) {
                // Any player-specific animations would go here
                // Note: We're no longer using position prediction as it conflicts with direct movement
                
                // Log position periodically for debugging
                const now = Date.now();
                if (now - lastSendTime.current > 5000) { // Log every 5 seconds
                    console.log("Player position:", playerMesh.current.position);
                    lastSendTime.current = now;
                }
            }
            
            // Continue animation loop
            animationFrameId.current = requestAnimationFrame(animate);
        };
        
        // Start animation if it's not already running
        if (animationFrameId.current === null) {
            animationFrameId.current = requestAnimationFrame(animate);
        }
        
        // Clean up on unmount
        return () => {
            console.log("PlayerManager unmounting - cleaning up");
            
            // Cancel animation frame
            if (animationFrameId.current !== null) {
                cancelAnimationFrame(animationFrameId.current);
                animationFrameId.current = null;
            }
            
            // Remove player from scene
            if (playerMesh.current && scene) {
                scene.remove(playerMesh.current);
                
                // Properly dispose of geometries and materials
                playerMesh.current.traverse((child) => {
                    if (child instanceof THREE.Mesh) {
                        if (child.geometry) child.geometry.dispose();
                        
                        if (child.material) {
                            if (Array.isArray(child.material)) {
                                child.material.forEach(material => material.dispose());
                            } else {
                                child.material.dispose();
                            }
                        }
                    }
                });
                
                playerMesh.current = null;
                playerReady.current = false;
            }
        };
    }, [scene, initialPosition]);
    
    // The component doesn't render anything itself
    return null;
};

export default PlayerManager; 