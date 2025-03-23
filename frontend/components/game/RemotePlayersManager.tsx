import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { Player } from '../../types/player';
import { getSocket } from '../../game/network/socket';

interface RemotePlayersManagerProps {
    scene: THREE.Scene;
    initialPlayers: Player[];
}

const RemotePlayersManager: React.FC<RemotePlayersManagerProps> = ({ scene, initialPlayers }) => {
    const playersRef = useRef<{ [key: string]: { mesh: THREE.Object3D, targetPosition?: THREE.Vector3} }>({});
    const loader = new GLTFLoader();

    // Create a fallback player mesh (simple cube)
    const createFallbackMesh = (playerData: Player) => {
        console.log("Creating fallback remote player mesh (cube)");
        const geometry = new THREE.BoxGeometry(1, 2, 1);
        const material = new THREE.MeshStandardMaterial({ color: 0xFFA500 });
        const mesh = new THREE.Group();
        
        const playerCube = new THREE.Mesh(geometry, material);
        playerCube.castShadow = true;
        playerCube.receiveShadow = false;
        playerCube.position.y = 1; // Adjust to stand on ground
        
        mesh.add(playerCube);
        
        // Add user data for identification
        mesh.userData = { 
            isPlayer: true,
            playerId: playerData.id,
            playerName: playerData.name
        };
        
        return mesh;
    };

    // Load initial players
    useEffect(() => {
        if (!scene) {
            console.warn("RemotePlayersManager: Scene is undefined, cannot add players");
            return;
        }
        
        initialPlayers.forEach(player => {
          addPlayer(player);
        });

       return () => {
        //Cleanup Players
         for(const playerId in playersRef.current){
            removePlayer(playerId);
         }
       }
    }, [initialPlayers, scene]);


    // Handle real-time updates
    useEffect(() => {
        let socket: any = null;
        
        // Need to use async/await since getSocket returns a Promise
        const setupSocketListeners = async () => {
            socket = await getSocket();
            if (!socket) return;

            socket.on('playerJoined', handlePlayerJoined);
            socket.on('playerLeft', handlePlayerLeft);
            socket.on('playerMoved', handlePlayerMoved);
        };
        
        setupSocketListeners();

        const handlePlayerJoined = (player: Player) => {
          addPlayer(player);
        };

        const handlePlayerLeft = (playerId: string) => {
           removePlayer(playerId);
        };

        const handlePlayerMoved = (data: { playerId: string; position: {x: number, y: number, z: number}; rotation: { x: number; y: number; z: number } }) => {
          if (playersRef.current[data.playerId]) {
            const player = playersRef.current[data.playerId];
            //Apply the rotation sent.
            player.mesh.rotation.set(data.rotation.x, data.rotation.y, data.rotation.z, 'YXZ');
            // Use a Vector3 for the target position
            playersRef.current[data.playerId].targetPosition = new THREE.Vector3(data.position.x, data.position.y, data.position.z);
          }
        };

        return () => {
            if (socket) {
                socket.off('playerJoined', handlePlayerJoined);
                socket.off('playerLeft', handlePlayerLeft);
                socket.off('playerMoved', handlePlayerMoved);
            }
        };
    }, [scene]);

  const addPlayer = (playerData: Player) => {
    if (!playersRef.current[playerData.id]) { // Prevent duplicates
            loader.load(
                '/models/player.glb',
                (gltf) => {
                    const playerMesh = gltf.scene;
                    playerMesh.traverse((node) => {
                        if ((node as THREE.Mesh).isMesh) {
                            node.castShadow = true;
                        }
                    });
                    // Create position and rotation vectors from player data
                    const position = new THREE.Vector3(playerData.x, playerData.y, playerData.z);
                    const rotation = new THREE.Euler(0, 0, 0); // Default rotation
                    
                    // Add user data for identification
                    playerMesh.userData = { 
                        isPlayer: true,
                        playerId: playerData.id,
                        playerName: playerData.name
                    };
                    
                    playerMesh.position.copy(position);
                    playerMesh.rotation.copy(rotation);
                    scene.add(playerMesh);

                    playersRef.current[playerData.id] = {mesh: playerMesh, targetPosition: position.clone()}; // Initialize target position
                },
                undefined,
                (error) => {
                    console.error('Error loading player model:', error);
                    
                    // Use fallback player mesh
                    const playerMesh = createFallbackMesh(playerData);
                    const position = new THREE.Vector3(playerData.x, playerData.y, playerData.z);
                    
                    playerMesh.position.copy(position);
                    scene.add(playerMesh);
                    
                    playersRef.current[playerData.id] = {mesh: playerMesh, targetPosition: position.clone()};
                }
            );
        }
  }

  const removePlayer = (playerId: string) => {
     if (playersRef.current[playerId]) {
            const player = playersRef.current[playerId];
            scene.remove(player.mesh);
            player.mesh.traverse((object) => {
                if (object instanceof THREE.Mesh) {
                    if (object.geometry) object.geometry.dispose();
                    if (object.material) {
                        if (Array.isArray(object.material)) {
                            object.material.forEach(material => material.dispose());
                        } else {
                            object.material.dispose();
                        }
                    }
                }
            });
            delete playersRef.current[playerId];
        }
  }

    // Animation loop for remote players (simple linear interpolation)
    useEffect(() => {
       const animate = () => {
          const interpolationFactor = 0.1; // Adjust for smoother or more responsive movement

          for (const playerId in playersRef.current) {
            const player = playersRef.current[playerId];
            if (player.targetPosition) {
              player.mesh.position.lerp(player.targetPosition, interpolationFactor);
            }
          }
            requestAnimationFrame(animate);
        }

        const animationId = requestAnimationFrame(animate);
        return () => { cancelAnimationFrame(animationId); }
    }, [])

    return null; // This component doesn't render anything directly
};

export default RemotePlayersManager; 