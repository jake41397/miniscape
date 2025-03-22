import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { initializeSocket, getSocket } from '../game/network/socket';
import { Player } from '../types/player';
import ChatPanel from './ui/ChatPanel';
import InventoryPanel from './ui/InventoryPanel';
import soundManager from '../game/audio/soundManager';
import { 
  ResourceNode, 
  ResourceType, 
  WorldItem, 
  createResourceMesh, 
  createItemMesh,
  updateDroppedItems
} from '../game/world/resources';

// Player movement speed
const MOVEMENT_SPEED = 0.15;

// Ensure movement speed remains constant
Object.freeze(MOVEMENT_SPEED);

// World boundaries
const WORLD_BOUNDS = {
  minX: -50, 
  maxX: 50,
  minZ: -50,
  maxZ: 50
};

const GameCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<THREE.Mesh | null>(null);
  const playersRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const resourceNodesRef = useRef<ResourceNode[]>([]);
  const worldItemsRef = useRef<WorldItem[]>([]);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);
  
  const [playerName, setPlayerName] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [currentZone, setCurrentZone] = useState<string>('Lumbridge');
  
  // Store key states
  const keysPressed = useRef<Record<string, boolean>>({
    w: false,
    a: false,
    s: false,
    d: false,
    ArrowUp: false,
    ArrowLeft: false,
    ArrowDown: false,
    ArrowRight: false
  });
  
  // Track the player's last sent position to avoid spamming movement updates
  const lastSentPosition = useRef({ x: 0, y: 1, z: 0 });
  const lastSendTime = useRef(0);
  const SEND_INTERVAL = 100; // Send updates at most every 100ms
  
  // Track if player movement has changed since last send
  const movementChanged = useRef(false);
  
  // Keep track of gathering cooldown
  const isGathering = useRef(false);
  
  // Add sound toggle state
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Create a ref to store the createNameLabel function
  const createNameLabelRef = useRef<((name: string, mesh: THREE.Mesh) => void) | null>(null);
  
  useEffect(() => {
    // Init socket on component mount
    const socket = initializeSocket();
    
    // Track socket connection state
    socket.on('connect', () => {
      setIsConnected(true);
      
      // Ask for player name
      const name = prompt('Enter your name:') || `Player${socket.id?.substring(0, 4)}`;
      setPlayerName(name);
      
      // Send join message with name
      socket.emit('join', name);
    });
    
    socket.on('disconnect', () => {
      setIsConnected(false);
    });
    
    return () => {
      // Disconnect socket on unmount
      socket.disconnect();
    };
  }, []);
  
  // Update sound manager when sound enabled state changes
  useEffect(() => {
    soundManager.setEnabled(soundEnabled);
  }, [soundEnabled]);
  
  // Add name label to player when name is set
  useEffect(() => {
    if (playerRef.current && playerName && createNameLabelRef.current) {
      createNameLabelRef.current(playerName, playerRef.current);
    }
  }, [playerName]);
  
  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Initialize Three.js scene
    const scene = new THREE.Scene();
    
    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75, 
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    camera.position.set(0, 10, 10);
    camera.lookAt(0, 0, 0);
    
    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(new THREE.Color('#87CEEB')); // Sky blue color
    
    // Create CSS2D renderer for name labels
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    canvasRef.current.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;
    
    // Append canvas to DOM
    canvasRef.current.appendChild(renderer.domElement);
    
    // Handle window resize
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      
      renderer.setSize(width, height);
      labelRenderer.setSize(width, height);
    };
    window.addEventListener('resize', handleResize);
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    // Add directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);
    
    // Create a ground plane
    const groundGeometry = new THREE.PlaneGeometry(100, 100);
    const groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x4caf50,  // Green color for grass
      roughness: 0.8,
      metalness: 0.2
    });
    const ground = new THREE.Mesh(groundGeometry, groundMaterial);
    
    // Rotate the ground to be horizontal (x-z plane)
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    scene.add(ground);
    
    // Create a simple grid for reference
    const gridHelper = new THREE.GridHelper(100, 20);
    scene.add(gridHelper);
    
    // Create player avatar (a simple box for now)
    const playerGeometry = new THREE.BoxGeometry(1, 2, 1);
    const playerMaterial = new THREE.MeshStandardMaterial({
      color: 0x2196f3, // Blue color for player
    });
    const playerMesh = new THREE.Mesh(playerGeometry, playerMaterial);
    
    // Position player slightly above ground to avoid z-fighting
    playerMesh.position.set(0, 1, 0);
    
    // Save player mesh to ref for later access
    playerRef.current = playerMesh;
    
    // Also update lastSentPosition to match initial player position
    lastSentPosition.current = { 
      x: playerMesh.position.x, 
      y: playerMesh.position.y, 
      z: playerMesh.position.z 
    };
    
    // Add player to scene
    scene.add(playerMesh);
    
    // Create name label for player
    const createNameLabel = (name: string, mesh: THREE.Mesh) => {
      // Remove existing label if there is one
      mesh.children.forEach(child => {
        if ((child as any).isCSS2DObject) {
          mesh.remove(child);
        }
      });
      
      // Create new label
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
      
      const nameLabel = new CSS2DObject(nameDiv);
      nameLabel.position.set(0, 2.5, 0); // Position above the player
      
      mesh.add(nameLabel);
      return nameLabel;
    };
    
    // Store the createNameLabel function in the ref so it can be used by other useEffect hooks
    createNameLabelRef.current = createNameLabel;
    
    // Make camera follow player
    camera.position.set(
      playerMesh.position.x, 
      playerMesh.position.y + 8, 
      playerMesh.position.z + 10
    );
    camera.lookAt(playerMesh.position);
    
    // Create resource nodes in the world
    const createWorldResources = () => {
      // Clear existing resources
      resourceNodesRef.current.forEach(node => {
        if (node.mesh) {
          scene.remove(node.mesh);
        }
      });
      resourceNodesRef.current = [];
      
      // Define resource nodes
      const resources: ResourceNode[] = [
        // Trees in Lumbridge area
        { id: 'tree-1', type: ResourceType.TREE, x: 10, y: 0, z: 10 },
        { id: 'tree-2', type: ResourceType.TREE, x: 15, y: 0, z: 15 },
        { id: 'tree-3', type: ResourceType.TREE, x: 20, y: 0, z: 10 },
        
        // Rocks in Barbarian Village
        { id: 'rock-1', type: ResourceType.ROCK, x: -20, y: 0, z: -20 },
        { id: 'rock-2', type: ResourceType.ROCK, x: -25, y: 0, z: -15 },
        
        // Fishing spots
        { id: 'fish-1', type: ResourceType.FISH, x: 30, y: 0, z: -30 },
      ];
      
      // Create meshes for each resource and add to scene
      resources.forEach(resource => {
        const mesh = createResourceMesh(resource.type);
        mesh.position.set(resource.x, resource.y, resource.z);
        
        // Store resource ID in userData for raycasting identification
        mesh.userData.resourceId = resource.id;
        mesh.userData.resourceType = resource.type;
        
        scene.add(mesh);
        
        // Store reference to mesh in resource node
        resourceNodesRef.current.push({
          ...resource,
          mesh: mesh as THREE.Mesh
        });
      });
    };
    
    // Initialize resources
    createWorldResources();
    
    // Set up socket event listeners
    const socket = getSocket();
    
    // Function to create a player mesh
    const createPlayerMesh = (player: Player) => {
      const otherPlayerGeometry = new THREE.BoxGeometry(1, 2, 1);
      const otherPlayerMaterial = new THREE.MeshStandardMaterial({
        color: 0xff5722, // Orange color for other players
      });
      const otherPlayerMesh = new THREE.Mesh(otherPlayerGeometry, otherPlayerMaterial);
      
      // Set position from player data
      otherPlayerMesh.position.set(player.x, player.y, player.z);
      
      // Store player data in userData
      otherPlayerMesh.userData.playerId = player.id;
      otherPlayerMesh.userData.playerName = player.name;
      
      // Add name label
      createNameLabel(player.name, otherPlayerMesh);
      
      // Add to scene
      scene.add(otherPlayerMesh);
      
      // Store in players map
      playersRef.current.set(player.id, otherPlayerMesh);
      
      return otherPlayerMesh;
    };
    
    // Handle initial players
    socket.on('initPlayers', (players) => {
      console.log('Received initial players:', players);
      
      // Add each existing player to the scene
      players.forEach(player => {
        if (!playersRef.current.has(player.id)) {
          createPlayerMesh(player);
        }
      });
    });
    
    // Handle new player joins
    socket.on('playerJoined', (player) => {
      console.log('Player joined:', player);
      
      // Play sound for new player joining
      soundManager.play('playerJoin');
      
      // Add the new player to the scene if not exists
      if (!playersRef.current.has(player.id)) {
        createPlayerMesh(player);
      } else {
        // Update existing player (might be a name change)
        const existingMesh = playersRef.current.get(player.id);
        if (existingMesh) {
          existingMesh.position.set(player.x, player.y, player.z);
          existingMesh.userData.playerName = player.name;
        }
      }
    });
    
    // Handle player disconnects
    socket.on('playerLeft', (playerId) => {
      console.log('Player left:', playerId);
      
      // Remove player from scene
      const playerMesh = playersRef.current.get(playerId);
      if (playerMesh) {
        scene.remove(playerMesh);
        playersRef.current.delete(playerId);
      }
    });
    
    // Handle player movements - Fix the issue with position resets
    socket.on('playerMoved', (data) => {
      // Only update other players' positions, not our own player
      if (data.id === socket.id) {
        console.log('Ignoring position update for our own player');
        return; // Skip position updates for our own player
      }
      
      // Update the position of other players
      const playerMesh = playersRef.current.get(data.id);
      if (playerMesh) {
        playerMesh.position.set(data.x, data.y, data.z);
      }
    });
    
    // Handle item drops in the world
    socket.on('itemDropped', (data) => {
      console.log('Item dropped:', data);
      
      // Play drop sound
      soundManager.play('itemDrop');
      
      // Create a mesh for the dropped item
      const itemMesh = createItemMesh(data.itemType);
      itemMesh.position.set(data.x, data.y, data.z);
      
      // Store the item ID in userData for raycasting identification
      itemMesh.userData.dropId = data.dropId;
      
      // Add to scene
      scene.add(itemMesh);
      
      // Store reference in worldItems
      worldItemsRef.current.push({
        ...data,
        mesh: itemMesh
      });
    });
    
    // Handle item removals
    socket.on('itemRemoved', (dropId) => {
      console.log('Item removed:', dropId);
      
      // Find the item in our world items
      const itemIndex = worldItemsRef.current.findIndex(item => item.dropId === dropId);
      
      if (itemIndex !== -1) {
        const item = worldItemsRef.current[itemIndex];
        
        // Remove from scene if it has a mesh
        if (item.mesh) {
          scene.remove(item.mesh);
          if (item.mesh.geometry) item.mesh.geometry.dispose();
          if (Array.isArray(item.mesh.material)) {
            item.mesh.material.forEach(material => material.dispose());
          } else if (item.mesh.material) {
            item.mesh.material.dispose();
          }
        }
        
        // Remove from our list
        worldItemsRef.current.splice(itemIndex, 1);
      }
    });
    
    // Handle keyboard input
    const handleKeyDown = (event: KeyboardEvent) => {
      // Check if the key is one we track for movement
      if (keysPressed.current.hasOwnProperty(event.key)) {
        keysPressed.current[event.key] = true;
      }
    };
    
    const handleKeyUp = (event: KeyboardEvent) => {
      // Check if the key is one we track for movement
      if (keysPressed.current.hasOwnProperty(event.key)) {
        keysPressed.current[event.key] = false;
      }
    };
    
    // Handle mouse click for resource gathering and item pickup
    const handleMouseClick = (event: MouseEvent) => {
      // Get mouse position in normalized device coordinates (-1 to +1)
      const rect = renderer.domElement.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      
      // Update the raycaster
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      
      // Create a list of objects to check for intersection
      const interactables = [
        ...resourceNodesRef.current.map(node => node.mesh),
        ...worldItemsRef.current.map(item => item.mesh)
      ].filter(Boolean) as THREE.Object3D[];
      
      // Perform raycasting
      const intersects = raycasterRef.current.intersectObjects(interactables);
      
      if (intersects.length > 0) {
        const intersected = intersects[0].object;
        
        // Calculate distance to player
        const playerPosition = playerRef.current?.position || new THREE.Vector3();
        const distanceToPlayer = playerPosition.distanceTo(intersected.position);
        
        // Check if it's a resource node
        if (intersected.userData.resourceId && distanceToPlayer <= 5) {
          // Gather resource if not already gathering
          if (!isGathering.current) {
            gatherResource(intersected.userData.resourceId);
          }
        }
        // Check if it's a dropped item
        else if (intersected.userData.dropId && distanceToPlayer <= 5) {
          // Pick up item
          pickupItem(intersected.userData.dropId);
        }
        // Too far away
        else if (distanceToPlayer > 5) {
          console.log('Too far away to interact!');
        }
      }
    };
    
    // Function to handle resource gathering
    const gatherResource = (resourceId: string) => {
      console.log('Gathering resource:', resourceId);
      
      // Set gathering flag to prevent spam
      isGathering.current = true;
      
      // Find the resource to play appropriate sound
      const resourceNode = resourceNodesRef.current.find(node => node.id === resourceId);
      if (resourceNode) {
        // Play sound based on resource type
        switch (resourceNode.type) {
          case ResourceType.TREE:
            soundManager.play('woodcutting');
            break;
          case ResourceType.ROCK:
            soundManager.play('mining');
            break;
          case ResourceType.FISH:
            soundManager.play('fishing');
            break;
        }
      }
      
      // Send gather event to server
      socket.emit('gather', resourceId);
      
      // Visual feedback (could be improved)
      if (resourceNode && resourceNode.mesh) {
        const originalColor = (resourceNode.mesh.material as THREE.MeshStandardMaterial).color.clone();
        
        // Flash the resource
        (resourceNode.mesh.material as THREE.MeshStandardMaterial).color.set(0xffff00);
        
        // Reset after delay
        setTimeout(() => {
          if (resourceNode.mesh) {
            (resourceNode.mesh.material as THREE.MeshStandardMaterial).color.copy(originalColor);
          }
          // Reset gathering flag after cooldown
          isGathering.current = false;
        }, 2000);
      } else {
        // Reset gathering flag after cooldown if no resource found
        setTimeout(() => {
          isGathering.current = false;
        }, 2000);
      }
    };
    
    // Function to handle item pickup
    const pickupItem = (dropId: string) => {
      console.log('Picking up item:', dropId);
      
      // Play pickup sound
      soundManager.play('itemPickup');
      
      // Send pickup event to server
      socket.emit('pickup', dropId);
    };
    
    // Function to update player position based on key presses
    const updatePlayerMovement = () => {
      if (!playerRef.current) return;
      
      const player = playerRef.current;
      let moveX = 0;
      let moveZ = 0;
      
      // Forward (W or Up arrow)
      if (keysPressed.current.w || keysPressed.current.ArrowUp) {
        moveZ -= MOVEMENT_SPEED;
      }
      
      // Left (A or Left arrow)
      if (keysPressed.current.a || keysPressed.current.ArrowLeft) {
        moveX -= MOVEMENT_SPEED;
      }
      
      // Backward (S or Down arrow)
      if (keysPressed.current.s || keysPressed.current.ArrowDown) {
        moveZ += MOVEMENT_SPEED;
      }
      
      // Right (D or Right arrow)
      if (keysPressed.current.d || keysPressed.current.ArrowRight) {
        moveX += MOVEMENT_SPEED;
      }
      
      // Only update if there's actual movement
      if (moveX !== 0 || moveZ !== 0) {
        // Apply movement with bounds checking
        const newX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, player.position.x + moveX));
        const newZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, player.position.z + moveZ));
        
        // Update player position
        player.position.x = newX;
        player.position.z = newZ;
        
        // Flag that movement has changed
        movementChanged.current = true;
        
        // Update current zone based on position
        updatePlayerZone(newX, newZ);
      }
    };
    
    // Update the player's current zone
    const updatePlayerZone = (x: number, z: number) => {
      // Simple zone detection based on position
      let newZone = 'Lumbridge';
      
      if (x < -10 && z < -10) {
        newZone = 'Barbarian Village';
      } else if (x > 25 && z < 0) {
        newZone = 'Fishing Spot';
      } else if (x > 0 && z > 25) {
        newZone = 'Grand Exchange';
      } else if (x < -30 || z < -30 || x > 30 || z > 30) {
        newZone = 'Wilderness';
      }
      
      if (newZone !== currentZone) {
        setCurrentZone(newZone);
      }
    };
    
    // Function to send position updates to server
    const sendPositionUpdate = () => {
      if (!playerRef.current || !isConnected || !movementChanged.current) return;
      
      const now = Date.now();
      // Check if we should send an update (throttle)
      if (now - lastSendTime.current >= SEND_INTERVAL) {
        const position = {
          x: playerRef.current.position.x,
          y: playerRef.current.position.y,
          z: playerRef.current.position.z
        };
        
        // Check if position has changed significantly
        const dx = Math.abs(position.x - lastSentPosition.current.x);
        const dz = Math.abs(position.z - lastSentPosition.current.z);
        
        if (dx > 0.01 || dz > 0.01) {
          // Send position to server
          socket.emit('playerMove', position);
          
          // Update last sent position and time
          lastSentPosition.current = { ...position };
          lastSendTime.current = now;
        }
        
        // Reset movement flag
        movementChanged.current = false;
      }
    };
    
    // Add event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    renderer.domElement.addEventListener('click', handleMouseClick);
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Get delta time for animations
      const delta = clockRef.current.getDelta();
      
      // Update player movement
      updatePlayerMovement();
      
      // Send position updates
      sendPositionUpdate();
      
      // Update camera to follow player
      if (playerRef.current) {
        camera.position.x = playerRef.current.position.x;
        camera.position.y = playerRef.current.position.y + 8;
        camera.position.z = playerRef.current.position.z + 10;
        camera.lookAt(playerRef.current.position);
      }
      
      // Animate dropped items
      updateDroppedItems(worldItemsRef.current, delta);
      
      // Render scene and labels
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
    };
    animate();
    
    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      renderer.domElement.removeEventListener('click', handleMouseClick);
      
      // Remove socket event listeners
      socket.off('initPlayers');
      socket.off('playerJoined');
      socket.off('playerLeft');
      socket.off('playerMoved');
      socket.off('itemDropped');
      socket.off('itemRemoved');
      
      // Dispose of geometries and materials
      groundGeometry.dispose();
      groundMaterial.dispose();
      playerGeometry.dispose();
      playerMaterial.dispose();
      
      // Dispose of other player meshes
      playersRef.current.forEach((mesh) => {
        scene.remove(mesh);
        if (mesh.geometry) mesh.geometry.dispose();
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach(material => material.dispose());
        } else if (mesh.material) {
          mesh.material.dispose();
        }
      });
      
      // Dispose of resource meshes
      resourceNodesRef.current.forEach((node) => {
        if (node.mesh) {
          scene.remove(node.mesh);
          if (node.mesh.geometry) node.mesh.geometry.dispose();
          if (Array.isArray(node.mesh.material)) {
            node.mesh.material.forEach(material => material.dispose());
          } else if (node.mesh.material) {
            node.mesh.material.dispose();
          }
        }
      });
      
      // Dispose of world item meshes
      worldItemsRef.current.forEach((item) => {
        if (item.mesh) {
          scene.remove(item.mesh);
          if (item.mesh.geometry) item.mesh.geometry.dispose();
          if (Array.isArray(item.mesh.material)) {
            item.mesh.material.forEach(material => material.dispose());
          } else if (item.mesh.material) {
            item.mesh.material.dispose();
          }
        }
      });
      
      // Clear references
      playersRef.current.clear();
      resourceNodesRef.current = [];
      worldItemsRef.current = [];
      
      canvasRef.current?.removeChild(renderer.domElement);
      if (labelRendererRef.current) {
        canvasRef.current?.removeChild(labelRendererRef.current.domElement);
      }
      renderer.dispose();
    };
  }, [isConnected, currentZone, soundEnabled]);
  
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      {/* Zone indicator */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '50%',
        transform: 'translateX(-50%)',
        padding: '5px 15px',
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        color: 'white',
        borderRadius: '20px',
        fontFamily: 'sans-serif',
        fontSize: '14px',
        fontWeight: 'bold',
        zIndex: 100
      }}>
        {currentZone}
      </div>

      {/* Sound toggle button */}
      <button
        onClick={() => setSoundEnabled(!soundEnabled)}
        style={{
          position: 'absolute',
          top: '10px',
          right: '10px',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          padding: '5px 10px',
          cursor: 'pointer',
          fontSize: '12px',
          zIndex: 100
        }}
      >
        {soundEnabled ? '🔊 Sound On' : '🔇 Sound Off'}
      </button>
      
      <ChatPanel />
      <InventoryPanel />
    </div>
  );
};

export default GameCanvas; 