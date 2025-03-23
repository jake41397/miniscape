import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { 
  initializeSocket, 
  disconnectSocket, 
  getSocket, 
  isSocketReady, 
  getSocketStatus, 
  cachePlayerPosition, 
  getCachedPlayerPosition 
} from '../game/network/socket';
import { setupSocketListeners } from '../game/network/gameSocketHandler';
import { Player } from '../types/player';
import InventoryPanel from './ui/InventoryPanel';
import soundManager from '../game/audio/soundManager';
import { 
  ResourceNode, 
  ResourceType, 
  WorldItem
} from '../game/world/resources';
import Chat, { ChatRefHandle } from './chat/Chat';
import WorldManager, { WORLD_BOUNDS } from '../game/world/WorldManager';

// Player movement speed
const MOVEMENT_SPEED = 0.02; // Reduced from 0.0375 (nearly 50% reduction again)
// Define a constant speed factor to prevent accumulation
const FIXED_SPEED_FACTOR = 0.02; // Reduced from 0.0375
// Network settings
const SEND_INTERVAL = 20; // Reduced from 30ms to 20ms for more frequent updates
// Position interpolation settings
const INTERPOLATION_SPEED = 0.4; // Increased from 0.3 for faster position syncing

// Add position prediction settings
const POSITION_HISTORY_LENGTH = 5; // How many positions to keep for prediction
const ENABLE_POSITION_PREDICTION = true; // Whether to use prediction for remote players
// Add a snap threshold for large position discrepancies
const POSITION_SNAP_THRESHOLD = 5.0; // If discrepancy is larger than this, snap instantly

// Add type definition for player move data
interface PlayerMoveData {
  id: string;
  x: number;
  y: number;
  z: number;
  timestamp?: number; // Make timestamp optional
}

// Add debug configuration
const DEBUG = {
  showPositionMarkers: false,   // Disable markers for now to fix errors 
  showVelocityVectors: false,   // Show velocity prediction vectors
  logNetworkStats: false        // Log network stats periodically
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
  const cleanupIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Add ref for zone update debouncing
  const zoneUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Add a ref for cleanup functions so they can be accessed outside useEffect
  const cleanupFunctionsRef = useRef<{
    initialCleanup?: () => void;
    cleanupPlayerMeshes?: () => void;
  }>({});
  
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
  
  // Add camera control state
  const isMiddleMouseDown = useRef(false);
  const lastMousePosition = useRef({ x: 0, y: 0 });
  const cameraDistance = useRef(10);
  const cameraAngle = useRef(0);
  const cameraTilt = useRef(0.5); // Add camera tilt angle (0 to 1, where 0.5 is horizontal)
  
  // Track the player's last sent position to avoid spamming movement updates
  const lastSentPosition = useRef({ x: 0, y: 1, z: 0 });
  const lastSendTime = useRef(0);
  
  // Track if player movement has changed since last send
  const movementChanged = useRef(false);
  
  // Add position history tracking to detect anomalous movements
  const positionHistory = useRef<Array<{x: number, z: number, time: number}>>([]);
  const MAX_HISTORY_LENGTH = 5;
  const ANOMALOUS_SPEED_THRESHOLD = 1.0; // Units per second
  
  // Keep track of gathering cooldown
  const isGathering = useRef(false);
  
  // Add sound toggle state
  const [soundEnabled, setSoundEnabled] = useState(true);
  
  // Add settings state
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isHorizontalInverted, setIsHorizontalInverted] = useState(false);
  const isHorizontalInvertedRef = useRef(false);
  
  // Create a ref to store the createNameLabel function
  const createNameLabelRef = useRef<((name: string, mesh: THREE.Mesh) => CSS2DObject) | null>(null);
  
  // Add a ref to track all name labels in the scene for proper cleanup
  const nameLabelsRef = useRef<Map<string, CSS2DObject>>(new Map());
  
  // Add state to track if cleanup is in progress
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  
  // Add movement state
  const moveForward = useRef(false);
  const moveBackward = useRef(false);
  const moveLeft = useRef(false);
  const moveRight = useRef(false);
  const isJumping = useRef(false);
  const jumpVelocity = useRef(0);
  const lastUpdateTime = useRef(0);
  const JUMP_FORCE = 0.3;
  const GRAVITY = 0.015;
  const JUMP_COOLDOWN = 500; // milliseconds
  const lastJumpTime = useRef(0);
  
  // Add scene ref
  const sceneRef = useRef<THREE.Scene | null>(null);
  
  // Add a ref for the WorldManager
  const worldManagerRef = useRef<WorldManager | null>(null);
  
  // Create a ref for the Chat component with the proper type
  const chatRef = useRef<ChatRefHandle>(null);
  
  // Keep inversion setting in sync with ref
  useEffect(() => {
    isHorizontalInvertedRef.current = isHorizontalInverted;
  }, [isHorizontalInverted]);
  
  useEffect(() => {
    // Init socket on component mount
    async function connectSocket() {
      const socket = await initializeSocket();
      
      // If no socket (not authenticated), redirect to login
      if (!socket) {
        window.location.href = '/auth/signin';
        return;
      }
      
      // Track socket connection state
      socket.on('connect', () => {
        setIsConnected(true);
        
        // Clear player refs on reconnect to avoid stale references
        if (playersRef.current.size > 0) {
          playersRef.current = new Map();
        }
        
        // On reconnection, check for cached position to prevent reset to origin
        const cachedPosition = getCachedPlayerPosition();
        if (cachedPosition && playerRef.current) {
          // Only apply if significantly different from origin (0,0,0) to avoid overriding server position
          const isAtOrigin = 
            Math.abs(playerRef.current.position.x) < 0.1 && 
            Math.abs(playerRef.current.position.z) < 0.1;
          
          if (isAtOrigin) {
            playerRef.current.position.set(
              cachedPosition.x, 
              cachedPosition.y, 
              cachedPosition.z
            );
            // Update last sent position to avoid rubber-banding
            lastSentPosition.current = { ...cachedPosition };
          }
        }
      });
      
      socket.on('disconnect', () => {
        setIsConnected(false);
      });

      // Add custom event listeners for socket state changes
      const handleSocketConnected = () => {
        setIsConnected(true);
      };
      
      const handleSocketDisconnected = () => {
        setIsConnected(false);
      };
      
      window.addEventListener('socket_connected', handleSocketConnected);
      window.addEventListener('socket_disconnected', handleSocketDisconnected);
      
      // Initial connection state
      setIsConnected(socket.connected);

      // Monitor actual connection state periodically
      const connectionMonitor = setInterval(() => {
        const status = getSocketStatus();
        if (status.connected !== isConnected) {
          setIsConnected(status.connected);
        }
      }, 5000);
      
      return () => {
        // Disconnect socket on unmount
        disconnectSocket();
        
        // Clean up event listeners
        window.removeEventListener('socket_connected', handleSocketConnected);
        window.removeEventListener('socket_disconnected', handleSocketDisconnected);
        
        clearInterval(connectionMonitor);
      };
    }
    
    connectSocket();
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
    // Store scene in ref
    sceneRef.current = scene;
    
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
    
    // Add keyboard and mouse event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    renderer.domElement.addEventListener('click', handleMouseClick);
    window.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('wheel', handleMouseWheel);
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    // Add directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);
    
    // Use WorldManager to create and manage world objects
    // This handles creating the ground, grid, boundaries, and resources
    const worldManager = new WorldManager({
      scene,
      onResourceNodesCreated: handleResourceNodesCreated,
      onWorldItemsCreated: handleWorldItemsCreated
    });
    
    // Store the worldManager in a ref for access in event handlers
    worldManagerRef.current = worldManager;
    
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
    
    // Add player to scene
    scene.add(playerMesh);
    
    // Create name label for player
    const createNameLabel = (name: string, mesh: THREE.Mesh) => {
      // Get player ID
      const playerId = mesh.userData.playerId;
      
      // Remove any existing label for this player from the scene and ref
      if (playerId && nameLabelsRef.current.has(playerId)) {
        const existingLabel = nameLabelsRef.current.get(playerId);
        if (existingLabel) {
          // Remove from parent if it has one
          if (existingLabel.parent) {
            existingLabel.parent.remove(existingLabel);
          }
          // Also remove from scene directly to be sure
          scene.remove(existingLabel);
          // Remove from our tracking map
          nameLabelsRef.current.delete(playerId);
        }
      }
      
      // Remove existing labels from the mesh to avoid duplicates
      const childrenToRemove: THREE.Object3D[] = [];
      mesh.children.forEach(child => {
        if ((child as any).isCSS2DObject) {
          childrenToRemove.push(child);
        }
      });
      
      // Remove the children outside the loop
      childrenToRemove.forEach(child => {
        mesh.remove(child);
        scene.remove(child);
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
      nameDiv.style.pointerEvents = 'none'; // Make sure labels don't interfere with clicks
      
      const nameLabel = new CSS2DObject(nameDiv);
      nameLabel.position.set(0, 2.5, 0); // Position above the player
      nameLabel.userData.labelType = 'playerName';
      nameLabel.userData.forPlayer = playerId;
      
      // Add to tracking map if we have a playerId
      if (playerId) {
        nameLabelsRef.current.set(playerId, nameLabel);
      }
      
      // Add to mesh
      mesh.add(nameLabel);
      return nameLabel;
    };
    
    // Store the createNameLabel function in the ref so it can be used by other useEffect hooks
    createNameLabelRef.current = createNameLabel;
    
    // Set up socket event listeners
    let socketCleanup: (() => void) | undefined;
    
    const initSocketListeners = async () => {
      // Set up socket handlers with our newly extracted function
      socketCleanup = await setupSocketListeners({
        scene,
        playerRef,
        playersRef,
        nameLabelsRef,
        worldManagerRef,
        cleanupIntervalRef,
        setPlayerName,
        createNameLabel
      });
    };
    
    initSocketListeners();
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
      // Get delta time for frame-rate independent updates
      const delta = clockRef.current.getDelta();
      
      // Update player movement (delta time is calculated inside updatePlayerMovement)
      updatePlayerMovement();
      
      // Update remote player positions with interpolation
      updateRemotePlayerPositions(delta);
      
      // Send position updates
      sendPositionUpdate();
      
      // Always update camera to follow player
      if (playerRef.current) {
        const playerPosition = playerRef.current.position;
        
        // Calculate camera position based on angle, tilt, and distance
        const cameraX = playerPosition.x + Math.sin(cameraAngle.current) * cameraDistance.current;
        const cameraZ = playerPosition.z + Math.cos(cameraAngle.current) * cameraDistance.current;
        // Use cameraTilt to adjust height (0.1 to 0.9 maps to roughly 2 to 8 units above player)
        const cameraY = playerPosition.y + (cameraTilt.current * 6 + 2);

        // Update camera position and look at player
        camera.position.set(cameraX, cameraY, cameraZ);
        camera.lookAt(playerPosition);
        camera.updateProjectionMatrix();
      }
      
      // Animate dropped items using the WorldManager
      if (worldManagerRef.current) {
        worldManagerRef.current.updateItems(delta);
      }
      
      // Update chat bubbles with the Chat component
      if (chatRef.current) {
        chatRef.current.updateChatBubbles();
      }
      
      // Render scene and labels
      renderer.render(scene, camera);
      labelRenderer.render(scene, camera);
      
      // Add debug visuals
      if (DEBUG.showPositionMarkers || DEBUG.showVelocityVectors) {
        updateDebugVisuals();
      }
      
      // Add this to the animate function or in a separate useEffect
      // Update player position data attribute for the caching system
      if (playerRef.current) {
        // Create or update a hidden data element to store position
        let positionEl = document.querySelector('[data-player-position]') as HTMLDivElement | null;
        if (!positionEl) {
          positionEl = document.createElement('div');
          positionEl.style.display = 'none';
          positionEl.setAttribute('data-player-position', 'true');
          document.body.appendChild(positionEl);
        }
        
        // Update the position data
        const currentPos = playerRef.current.position;
        const positionData = { x: currentPos.x, y: currentPos.y, z: currentPos.z };
        positionEl.setAttribute('data-position', JSON.stringify(positionData));
        
        // Periodically cache the position (every ~5 seconds)
        if (Math.random() < 0.01) { // ~1% chance per frame at 60fps = ~once every 2 seconds
          cachePlayerPosition(positionData);
        }
      }
    };
    animate();
    
    // Just before the animate function, add a diagnostic console log to regularly check player tracking
    setInterval(() => {
      // Get current socket reference
      getSocket().then(currentSocket => {
        console.log('PERIODIC PLAYER TRACKING CHECK:', {
          connectedToSocket: !!currentSocket?.connected,
          socketId: currentSocket?.id,
          trackedPlayers: Array.from(playersRef.current.keys()),
          trackedPlayersCount: playersRef.current.size,
          ownPlayerId: currentSocket?.id
        });
      });
    }, 10000); // Check every 10 seconds
    
    // Clean up on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      renderer.domElement.removeEventListener('click', handleMouseClick);
      
      // Clean up worldManager
      worldManager.cleanup();
      
      // Execute socket cleanup function
      if (socketCleanup) {
        socketCleanup();
      }
      
      // Dispose of geometries and materials
      playerGeometry.dispose();
      playerMaterial.dispose();
      
      // Clean up all name labels
      nameLabelsRef.current.forEach((label) => {
        if (label.parent) {
          label.parent.remove(label);
        }
        scene.remove(label);
      });
      nameLabelsRef.current.clear();
      
      // Do an additional traversal to catch any remaining CSS2DObjects
      scene.traverse((object) => {
        if ((object as any).isCSS2DObject) {
          if (object.parent) {
            object.parent.remove(object);
          }
          scene.remove(object);
        }
      });
      
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
      
      // Clear references
      playersRef.current.clear();
      resourceNodesRef.current = [];
      worldItemsRef.current = [];
      
      canvasRef.current?.removeChild(renderer.domElement);
      if (labelRendererRef.current) {
        canvasRef.current?.removeChild(labelRendererRef.current.domElement);
      }
      renderer.dispose();
      
      // Clear the cleanup interval
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
      
      // Remove mouse event listeners
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('wheel', handleMouseWheel);
      
      // End of cleanup
    };
  }, [isConnected, currentZone, soundEnabled]);
  
  // Create a function to trigger manual cleanup
  const handleCleanupClick = () => {
    setIsCleaningUp(true);
    
    setTimeout(() => {
      if (cleanupFunctionsRef.current.initialCleanup) {
        cleanupFunctionsRef.current.initialCleanup();
      }
      setIsCleaningUp(false);
    }, 100);
  };
  
  // Add event handlers for keyboard and mouse
  const handleKeyDown = (e: KeyboardEvent) => {
    // Ignore key events when user is typing in chat or other input fields
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    
    // Update keys pressed object
    keysPressed.current[e.key] = true;
    
    // Update movement state based on WASD and arrow keys
    if (e.key === 'w' || e.key === 'ArrowUp') {
      moveForward.current = true;
      movementChanged.current = true;
    }
    if (e.key === 's' || e.key === 'ArrowDown') {
      moveBackward.current = true;
      movementChanged.current = true;
    }
    if (e.key === 'a' || e.key === 'ArrowLeft') {
      moveLeft.current = true;
      movementChanged.current = true;
    }
    if (e.key === 'd' || e.key === 'ArrowRight') {
      moveRight.current = true;
      movementChanged.current = true;
    }
    
    // Handle jump with space bar
    if (e.key === ' ' && !isJumping.current) {
      const currentTime = Date.now();
      if (currentTime - lastJumpTime.current > JUMP_COOLDOWN) {
        isJumping.current = true;
        jumpVelocity.current = JUMP_FORCE;
        lastJumpTime.current = currentTime;
        movementChanged.current = true;
      }
    }
  };
  
  const handleKeyUp = (e: KeyboardEvent) => {
    // Ignore key events when user is typing in chat or other input fields
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
      return;
    }
    
    // Update keys pressed object
    keysPressed.current[e.key] = false;
    
    // Update movement state based on WASD and arrow keys
    if (e.key === 'w' || e.key === 'ArrowUp') {
      moveForward.current = false;
      movementChanged.current = true;
    }
    if (e.key === 's' || e.key === 'ArrowDown') {
      moveBackward.current = false;
      movementChanged.current = true;
    }
    if (e.key === 'a' || e.key === 'ArrowLeft') {
      moveLeft.current = false;
      movementChanged.current = true;
    }
    if (e.key === 'd' || e.key === 'ArrowRight') {
      moveRight.current = false;
      movementChanged.current = true;
    }
  };
  
  const handleMouseClick = (e: MouseEvent) => {
    // Only process left clicks
    if (e.button !== 0) return;
    
    // Get normalized device coordinates
    const canvas = e.target as HTMLCanvasElement;
    const rect = canvas.getBoundingClientRect();
    mouseRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Set up raycaster from camera through mouse position
    if (!raycasterRef.current || !sceneRef.current) return;
    const camera = sceneRef.current.children.find(child => child instanceof THREE.PerspectiveCamera) as THREE.PerspectiveCamera;
    if (!camera) return;
    
    raycasterRef.current.setFromCamera(mouseRef.current, camera);
    
    // Check for intersections with resources
    const resourceIntersects = raycasterRef.current.intersectObjects(
      resourceNodesRef.current.map(node => node.mesh).filter(Boolean) as THREE.Object3D[]
    );
    
    if (resourceIntersects.length > 0) {
      // Get the first intersection
      const intersectedObject = resourceIntersects[0].object;
      const resourceId = intersectedObject.userData.resourceId;
      const resourceType = intersectedObject.userData.resourceType;
      
      // Handle resource interaction based on type
      if (resourceId && resourceType && !isGathering.current) {
        isGathering.current = true;
        
        // Notify server of resource interaction
        getSocket().then(socket => {
          if (socket) {
            // @ts-ignore - temporarily ignore type checking for resource gathering
            socket.emit('gather', {
              resourceId,
              resourceType
            });
          }
        });
        
        // Play appropriate sound based on resource type
        switch (resourceType) {
          case 'TREE':
            soundManager.play('woodcutting');
            break;
          case 'ROCK':
            soundManager.play('mining');
            break;
          case 'FISH':
            soundManager.play('fishing');
            break;
        }
        
        // Reset gathering cooldown after 2 seconds
        setTimeout(() => {
          isGathering.current = false;
        }, 2000);
      }
      return;
    }
    
    // Check for intersections with dropped items
    const itemIntersects = raycasterRef.current.intersectObjects(
      worldItemsRef.current.map(item => item.mesh).filter(Boolean) as THREE.Object3D[]
    );
    
    if (itemIntersects.length > 0) {
      // Get the first intersection
      const intersectedObject = itemIntersects[0].object;
      const dropId = intersectedObject.userData.dropId;
      
      if (dropId) {
        // Notify server of item pickup
        getSocket().then(socket => {
          if (socket) {
            // @ts-ignore - temporarily ignore type checking for item pickup
            socket.emit('pickup', { dropId });
          }
        });
        
        // Play pickup sound
        soundManager.play('itemPickup');
      }
    }
  };
  
  // Add mouse event handlers for camera control
  const handleMouseDown = (e: MouseEvent) => {
    // Middle mouse button for camera rotation
    if (e.button === 1) {
      isMiddleMouseDown.current = true;
      lastMousePosition.current = { x: e.clientX, y: e.clientY };
      e.preventDefault(); // Prevent default scrolling behavior
    }
  };
  
  const handleMouseUp = (e: MouseEvent) => {
    // Middle mouse button release
    if (e.button === 1) {
      isMiddleMouseDown.current = false;
    }
  };
  
  const handleMouseMove = (e: MouseEvent) => {
    // Handle camera rotation with middle mouse button
    if (isMiddleMouseDown.current) {
      const deltaX = e.clientX - lastMousePosition.current.x;
      const deltaY = e.clientY - lastMousePosition.current.y;
      
      // Apply horizontal camera rotation (invert based on setting)
      if (isHorizontalInvertedRef.current) {
        cameraAngle.current += deltaX * 0.005;
      } else {
        cameraAngle.current -= deltaX * 0.005;
      }
      
      // Apply vertical camera tilt (limit to reasonable range 0.1 to 0.9)
      cameraTilt.current = Math.max(0.1, Math.min(0.9, cameraTilt.current + deltaY * 0.003));
      
      lastMousePosition.current = { x: e.clientX, y: e.clientY };
    }
  };
  
  const handleMouseWheel = (e: WheelEvent) => {
    // Adjust camera distance with scroll wheel
    const zoomSpeed = 0.5;
    cameraDistance.current = Math.max(3, Math.min(20, cameraDistance.current + Math.sign(e.deltaY) * zoomSpeed));
  };
  
  // Main player movement update function
  const updatePlayerMovement = () => {
    if (!playerRef.current) return;
    
    const currentTime = Date.now();
    const deltaTime = (currentTime - lastUpdateTime.current) / 1000;
    lastUpdateTime.current = currentTime;
    
    // Cap delta time to avoid large jumps when tab was inactive
    const cappedDelta = Math.min(deltaTime, 0.1);
    
    // Handle jumping and gravity
    if (isJumping.current) {
      // Apply jump velocity
      playerRef.current.position.y += jumpVelocity.current;
      
      // Apply gravity to jump velocity
      jumpVelocity.current -= GRAVITY;
      
      // Check if player has landed
      if (playerRef.current.position.y <= 1) {
        playerRef.current.position.y = 1;
        isJumping.current = false;
        jumpVelocity.current = 0;
      }
    }
    
    // Get current position
    const currentPosition = playerRef.current.position.clone();
    
    // Calculate movement direction relative to camera angle
    let moveX = 0;
    let moveZ = 0;
    
    // Calculate forward/backward movement (rotated by camera angle)
    if (moveForward.current) {
      moveX -= Math.sin(cameraAngle.current) * FIXED_SPEED_FACTOR;
      moveZ -= Math.cos(cameraAngle.current) * FIXED_SPEED_FACTOR;
    }
    if (moveBackward.current) {
      moveX += Math.sin(cameraAngle.current) * FIXED_SPEED_FACTOR;
      moveZ += Math.cos(cameraAngle.current) * FIXED_SPEED_FACTOR;
    }
    
    // Calculate left/right strafing (perpendicular to camera angle)
    if (moveLeft.current) {
      moveX -= Math.sin(cameraAngle.current + Math.PI/2) * FIXED_SPEED_FACTOR;
      moveZ -= Math.cos(cameraAngle.current + Math.PI/2) * FIXED_SPEED_FACTOR;
    }
    if (moveRight.current) {
      moveX += Math.sin(cameraAngle.current + Math.PI/2) * FIXED_SPEED_FACTOR;
      moveZ += Math.cos(cameraAngle.current + Math.PI/2) * FIXED_SPEED_FACTOR;
    }
    
    // If player is moving, update the mesh position
    if (moveX !== 0 || moveZ !== 0) {
      // Update player position
      const newX = currentPosition.x + moveX;
      const newZ = currentPosition.z + moveZ;
      
      // Apply world boundaries
      const boundedX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, newX));
      const boundedZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, newZ));
      
      // Apply the final position
      playerRef.current.position.x = boundedX;
      playerRef.current.position.z = boundedZ;
      
      // Update movement direction for player orientation
      if (moveX !== 0 || moveZ !== 0) {
        // Calculate angle based on movement direction
        const moveAngle = Math.atan2(moveX, moveZ);
        
        // Apply smooth rotation - only adjust part of the way each frame
        const rotationDiff = moveAngle - playerRef.current.rotation.y;
        // Normalize rotation difference to [-PI, PI]
        const normalizedDiff = ((rotationDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
        playerRef.current.rotation.y += normalizedDiff * 0.15;
      }
      
      // Add current position to history for anomaly detection
      positionHistory.current.push({
        x: playerRef.current.position.x,
        z: playerRef.current.position.z,
        time: Date.now()
      });
      
      // Keep history length in check
      if (positionHistory.current.length > MAX_HISTORY_LENGTH) {
        positionHistory.current.shift();
      }
      
      // Mark that movement has changed so we send update to server
      movementChanged.current = true;
    }
  };
  
  // Function to send position updates to server
  const sendPositionUpdate = () => {
    // Only send updates if connected and player exists
    if (!isConnected || !playerRef.current) return;
    
    // Get current position
    const position = playerRef.current.position;
    const x = position.x;
    const y = position.y;
    const z = position.z;
    
    // Calculate distance from last sent position
    const distanceFromLast = Math.sqrt(
      Math.pow(x - lastSentPosition.current.x, 2) + 
      Math.pow(z - lastSentPosition.current.z, 2)
    );
    
    const currentTime = Date.now();
    const timeSinceLastSend = currentTime - lastSendTime.current;
    
    // Send position update if we've moved substantially or it's been a while since our last update
    if ((movementChanged.current && timeSinceLastSend >= SEND_INTERVAL) || 
        (distanceFromLast > 0.1 && timeSinceLastSend >= SEND_INTERVAL) ||
        timeSinceLastSend >= 1000) { // Send at least every second even if not moving
      
      getSocket().then(socket => {
        if (socket) {
          socket.emit('playerMove', {
            x, 
            y, 
            z
            // timestamp removed to fix type error
          });
        }
      });
      
      // Update last sent position
      lastSentPosition.current = { x, y, z };
      lastSendTime.current = currentTime;
      movementChanged.current = false;
    }
  };
  
  // Function to render debug visuals
  const updateDebugVisuals = () => {
    if (!sceneRef.current) return;
    
    const scene = sceneRef.current; // Create a local reference to ensure it's not null
    
    // Clear any existing debug visuals
    scene.children.forEach(child => {
      if (child.userData && child.userData.isDebugObject) {
        scene.remove(child);
      }
    });
    
    if (DEBUG.showPositionMarkers) {
      // Add markers for player positions
      const markerGeometry = new THREE.SphereGeometry(0.1);
      const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
      
      // Add marker for local player
      if (playerRef.current) {
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(playerRef.current.position);
        marker.position.y += 2.5; // Place above player
        marker.userData.isDebugObject = true;
        scene.add(marker);
      }
      
      // Add markers for remote players
      playersRef.current.forEach(playerMesh => {
        const marker = new THREE.Mesh(markerGeometry, markerMaterial);
        marker.position.copy(playerMesh.position);
        marker.position.y += 2.5; // Place above player
        marker.userData.isDebugObject = true;
        scene.add(marker);
      });
    }
    
    if (DEBUG.showVelocityVectors) {
      // Visualize velocity vectors
      const arrowMaterial = new THREE.LineBasicMaterial({ color: 0x00ff00 });
      
      // Show predicted velocity for remote players
      playersRef.current.forEach(playerMesh => {
        if (playerMesh.userData.velocity) {
          const velocity = playerMesh.userData.velocity;
          const velocityLength = Math.sqrt(velocity.x * velocity.x + velocity.z * velocity.z);
          
          if (velocityLength > 0.001) {
            // Scale the vector for visibility
            const scale = 2.0;
            const arrowGeometry = new THREE.BufferGeometry().setFromPoints([
              new THREE.Vector3(
                playerMesh.position.x, 
                playerMesh.position.y + 1.5, 
                playerMesh.position.z
              ),
              new THREE.Vector3(
                playerMesh.position.x + velocity.x * scale, 
                playerMesh.position.y + 1.5, 
                playerMesh.position.z + velocity.z * scale
              )
            ]);
            
            const arrow = new THREE.Line(arrowGeometry, arrowMaterial);
            arrow.userData.isDebugObject = true;
            scene.add(arrow);
          }
        }
      });
    }
  };
  
  // Add a function for updating remote player positions with interpolation
  const updateRemotePlayerPositions = (delta: number) => {
    // Update positions of all players with interpolation for smoother movement
    playersRef.current.forEach((playerMesh, playerId) => {
      if (!playerMesh.userData.targetPosition) return;
      
      // Get target position
      const target = playerMesh.userData.targetPosition;
      const current = playerMesh.position;
      
      // Calculate distance to target
      const distance = Math.sqrt(
        Math.pow(target.x - current.x, 2) + 
        Math.pow(target.z - current.z, 2)
      );
      
      // Improved interpolation logic - only interpolate if there's a significant distance
      // Use a reduced threshold of 0.005 (was 0.01) to improve precision
      if (distance > 0.005) {
        // Store previous position for velocity calculation if we don't have it yet
        if (!playerMesh.userData.prevPosition) {
          playerMesh.userData.prevPosition = current.clone();
          playerMesh.userData.prevUpdateTime = Date.now() - 16; // Assume 60fps
        }
        
        // Calculate time since last target position update
        const timeDelta = (Date.now() - playerMesh.userData.lastUpdateTime) / 1000;
        
        // Enhanced aggressive interpolation logic
        let finalFactor = INTERPOLATION_SPEED;
        
        // Use ultra-aggressive catch-up for larger distances
        if (distance > 3.0) {
          // For very large distances, use extremely aggressive catch-up (80% of the way each frame)
          finalFactor = 0.8;
        } else if (distance > 1.0) {
          // For large distances, use very aggressive catch-up (60% of the way each frame)
          finalFactor = 0.6;
        } else if (distance > 0.5) {
          // For medium distances, use moderately aggressive catch-up
          finalFactor = 0.5;
        } else {
          // Use distance-based scaling for smaller distances
          const distanceFactor = Math.min(1, distance * 0.9); // Scale more by distance, capped at 1
          finalFactor = Math.min(1, INTERPOLATION_SPEED * (1 + distanceFactor * 5));
        }
        
        // Apply position update with calculated factor
        playerMesh.position.x += (target.x - current.x) * finalFactor;
        playerMesh.position.y += (target.y - current.y) * finalFactor;
        playerMesh.position.z += (target.z - current.z) * finalFactor;
        
        // Apply prediction based on server-calculated velocity
        // This is more accurate than client-side velocity calculation
        if (ENABLE_POSITION_PREDICTION && playerMesh.userData.serverVelocity) {
          // Enhanced prediction logic
          // Prediction strength grows with time since last update, but caps at a maximum
          // Reduced from 0.5 to 0.3 to prevent overshooting
          const predictionFactor = Math.min(0.3, timeDelta * 0.6);
          
          // Apply prediction only for small distances to avoid making large discrepancies worse
          if (distance < 0.8) {
            playerMesh.position.x += playerMesh.userData.serverVelocity.x * timeDelta * predictionFactor;
            playerMesh.position.z += playerMesh.userData.serverVelocity.z * timeDelta * predictionFactor;
          }
        }
        
        // Update player rotation to face movement direction
        if (distance > 0.05) { // Only update rotation if there's meaningful movement
          const angle = Math.atan2(target.x - current.x, target.z - current.z);
          // Smooth rotation transition
          const rotationDiff = angle - playerMesh.rotation.y;
          // Normalize rotation difference to [-PI, PI]
          const normalizedDiff = ((rotationDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
          playerMesh.rotation.y += normalizedDiff * 0.3; // Increased from 0.2 for smoother rotation
        }
        
        // Enhanced snap logic - If we're very close to the target, snap to it
        if (distance < 0.02) { // Reduced from 0.03 to be even more precise
          playerMesh.position.copy(target);
        }
        
        // Store current position and time for next velocity calculation
        if (playerMesh.userData.prevPosition) {
          // Calculate velocity (units per second)
          const currentTime = Date.now();
          const dt = (currentTime - playerMesh.userData.prevUpdateTime) / 1000;
          
          if (dt > 0) {
            // Client-side velocity calculation as backup
            playerMesh.userData.velocity = {
              x: (playerMesh.position.x - playerMesh.userData.prevPosition.x) / dt,
              z: (playerMesh.position.z - playerMesh.userData.prevPosition.z) / dt
            };
            
            // Store position for next calculation
            playerMesh.userData.prevPosition = playerMesh.position.clone();
            playerMesh.userData.prevUpdateTime = currentTime;
          }
        }
      }
    });
  };
  
  // Handler for when WorldManager creates resource nodes
  const handleResourceNodesCreated = (nodes: ResourceNode[]) => {
    resourceNodesRef.current = nodes;
  };

  // Handler for when WorldManager initializes world items
  const handleWorldItemsCreated = (items: WorldItem[]) => {
    worldItemsRef.current = items;
  };
  
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

      {/* Connection status indicator */}
      <div style={{
        position: 'absolute',
        top: '10px',
        left: '10px',
        display: 'flex',
        alignItems: 'center',
        padding: '5px 10px',
        backgroundColor: isConnected ? 'rgba(0, 128, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)',
        color: 'white',
        borderRadius: '5px',
        fontFamily: 'sans-serif',
        fontSize: '12px',
        zIndex: 100
      }}>
        <div style={{
          width: '8px',
          height: '8px',
          borderRadius: '50%',
          backgroundColor: isConnected ? '#0f0' : '#f00',
          marginRight: '5px'
        }}></div>
        {isConnected ? 'Connected' : 'Disconnected'}
      </div>
      
      {/* Settings button */}
      <button
        onClick={() => setIsSettingsOpen(!isSettingsOpen)}
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
        ⚙️ Settings
      </button>
      
      {/* Settings panel */}
      {isSettingsOpen && (
        <div style={{
          position: 'absolute',
          top: '45px',
          right: '10px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
          border: '1px solid #333',
          borderRadius: '5px',
          padding: '10px',
          width: '250px',
          zIndex: 101,
          fontFamily: 'sans-serif',
          fontSize: '14px'
        }}>
          <div style={{ fontWeight: 'bold', marginBottom: '10px', borderBottom: '1px solid #555', paddingBottom: '5px' }}>
            Game Settings
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label htmlFor="invertHorizontal" style={{ cursor: 'pointer' }}>
              Invert Camera Horizontal
            </label>
            <input
              id="invertHorizontal"
              type="checkbox"
              checked={isHorizontalInverted}
              onChange={() => {
                const newValue = !isHorizontalInverted;
                setIsHorizontalInverted(newValue);
              }}
              style={{ cursor: 'pointer' }}
            />
          </div>
          
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
            <label htmlFor="soundToggle" style={{ cursor: 'pointer' }}>
              Sound Effects
            </label>
            <input
              id="soundToggle"
              type="checkbox"
              checked={soundEnabled}
              onChange={() => setSoundEnabled(!soundEnabled)}
              style={{ cursor: 'pointer' }}
            />
          </div>
          
          <div style={{ marginTop: '15px', textAlign: 'right' }}>
            <button
              onClick={() => setIsSettingsOpen(false)}
              style={{
                backgroundColor: '#555',
                color: 'white',
                border: 'none',
                borderRadius: '3px',
                padding: '3px 8px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Close
            </button>
          </div>
        </div>
      )}
      
      {/* Reconnect button */}
      {!isConnected && (
        <button
          onClick={() => {
            initializeSocket().then(() => {
            });
          }}
          style={{
            position: 'absolute',
            top: '40px',
            left: '10px',
            backgroundColor: 'rgba(0, 0, 255, 0.5)',
            color: 'white',
            border: 'none',
            borderRadius: '5px',
            padding: '5px 10px',
            cursor: 'pointer',
            fontSize: '12px',
            zIndex: 100
          }}
        >
          Reconnect
        </button>
      )}
      
      {/* Ghost cleanup button */}
      <button
        onClick={handleCleanupClick}
        disabled={isCleaningUp}
        style={{
          position: 'absolute',
          top: '45px',
          right: '10px',
          backgroundColor: isCleaningUp ? 'rgba(100, 100, 100, 0.5)' : 'rgba(255, 0, 0, 0.6)',
          color: 'white',
          border: 'none',
          borderRadius: '5px',
          padding: '5px 10px',
          cursor: isCleaningUp ? 'default' : 'pointer',
          fontSize: '12px',
          zIndex: 100
        }}
      >
        {isCleaningUp ? 'Cleaning...' : '👻 Remove Ghosts'}
      </button>
      
      {/* Use Chat component with proper forwardRef */}
      <Chat
        ref={chatRef}
        scene={sceneRef.current}
        playerRef={playerRef}
        playersRef={playersRef}
      />
      <InventoryPanel style={{ top: "100px", right: "20px" }} />
    </div>
  );
};

export default GameCanvas;