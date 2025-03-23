import { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import soundManager from '../game/audio/soundManager';
import { initializeSocket } from '../game/network/socket';

// Import modular components
import usePlayerManager from './game/PlayerManager';
import useWorldManager from './game/WorldManager';
import useCameraController from './game/CameraController';
import useInputHandler from './game/InputHandler';
import GameUI from './game/GameUI';
import useDebugTools from './game/DebugTools';
import useNetworkManager from './game/NetworkManager';

// Import resource types
import { ResourceNode, WorldItem } from '../game/world/resources';

// Define interfaces for network data
interface PlayerData {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
}

interface PlayerMoveData {
  id: string;
  x: number;
  y: number;
  z: number;
  timestamp?: number;
}

interface ChatMessageData {
  name: string;
  text: string;
  playerId: string;
  timestamp: number;
}

interface WorldItemData {
  id: string;
  itemId: string;
  x: number;
  y: number
  z: number;
  name: string;
  quantity: number;
}

// Define types for the component results
interface NetworkManagerMethods {
  sendPositionUpdate: () => void;
  gatherResource: (resourceId: string) => void;
  pickupItem: (dropId: string) => void;
  notifyMovementChanged: () => void;
  cleanup: () => void;
}

interface WorldManagerMethods {
  createEnvironment: () => void;
  createBoundaryMarkers: () => void;
  createWorldResources: () => void;
  addItemToWorld: (data: WorldItemData) => void;
  removeItemFromWorld: (dropId: string) => void;
  updateWorldItems: (delta: number) => void;
  cleanup: () => void;
}

interface PlayerManagerMethods {
  createPlayer: () => THREE.Mesh;
  createPlayerMesh: (player: PlayerData) => void;
  updatePlayerMovement: (delta: number) => void;
  updateRemotePlayerPositions: (delta: number) => void;
  createChatBubble: (playerId: string, text: string, mesh: THREE.Mesh) => void;
  cleanupPlayerMeshes: () => void;
}

interface CameraControllerMethods {
  cameraAngle: {current: number};
  updateCameraPosition: (position: THREE.Vector3) => void;
  setupEventListeners: () => () => void;
  setupResizeHandler: () => () => void;
  setCamera: (camera: THREE.PerspectiveCamera) => void;
}

interface InputHandlerMethods {
  keysPressed: React.MutableRefObject<Record<string, boolean>>;
  setupEventListeners: (renderer: THREE.WebGLRenderer, camera: THREE.Camera) => () => void;
}

interface DebugToolsMethods {
  DEBUG: {
    showPositionMarkers: boolean;
    showVelocityVectors: boolean;
    logNetworkStats: boolean;
  };
  updateDebugVisuals: () => void;
  toggleDebugFeature: (feature: "showPositionMarkers" | "showVelocityVectors" | "logNetworkStats") => void;
  cleanupDebugVisuals: () => void;
}

const GameCanvas: React.FC = () => {
  // DOM refs
  const canvasRef = useRef<HTMLDivElement>(null);
  const clockRef = useRef<THREE.Clock>(new THREE.Clock());
  
  // THREE.js core objects
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const labelRendererRef = useRef<CSS2DRenderer | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  
  // Game state
  const [playerName, setPlayerName] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [currentZone, setCurrentZone] = useState<string>('Lumbridge');
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);
  const [isHorizontalInverted, setIsHorizontalInverted] = useState(true);
  const isHorizontalInvertedRef = useRef(true);
  
  // Game references
  const playerRef = useRef<THREE.Mesh | null>(null);
  const playersRef = useRef<Map<string, THREE.Mesh>>(new Map());
  const nameLabelsRef = useRef<Map<string, CSS2DObject>>(new Map());
  const chatBubblesRef = useRef<Map<string, { object: CSS2DObject, expiry: number }>>(new Map());
  const resourceNodesRef = useRef<ResourceNode[]>([]);
  const worldItemsRef = useRef<WorldItem[]>([]);
  const positionHistory = useRef<Array<{x: number, z: number, time: number}>>([]);
  const zoneUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const socketIdRef = useRef<string | null>(null);
  
  // Manager references
  const worldManagerRef = useRef<WorldManagerMethods | null>(null);
  const playerManagerRef = useRef<PlayerManagerMethods | null>(null);
  const cameraControllerRef = useRef<CameraControllerMethods | null>(null);
  const inputHandlerRef = useRef<InputHandlerMethods | null>(null);
  const debugToolsRef = useRef<DebugToolsMethods | null>(null);
  const networkManagerRef = useRef<NetworkManagerMethods | null>(null);
  
  // Keep inversion setting in sync with ref
  useEffect(() => {
    isHorizontalInvertedRef.current = isHorizontalInverted;
  }, [isHorizontalInverted]);
  
  // Update sound manager when sound enabled state changes
  useEffect(() => {
    soundManager.setEnabled(soundEnabled);
  }, [soundEnabled]);
  
  // Set up the THREE.js scene
  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Capture the current value of the ref for cleanup
    const currentCanvas = canvasRef.current;
    
    // Initialize Three.js scene is now done at the component level
    // with the useState hook, so we don't need to create it here
    
    // Create camera
    const camera = new THREE.PerspectiveCamera(
      75, 
      window.innerWidth / window.innerHeight, 
      0.1, 
      1000
    );
    camera.position.set(0, 10, 10);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;
    
    // Create renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(new THREE.Color('#87CEEB')); // Sky blue color
    rendererRef.current = renderer;
    
    // Create CSS2D renderer for name labels
    const labelRenderer = new CSS2DRenderer();
    labelRenderer.setSize(window.innerWidth, window.innerHeight);
    labelRenderer.domElement.style.position = 'absolute';
    labelRenderer.domElement.style.top = '0';
    labelRenderer.domElement.style.pointerEvents = 'none';
    currentCanvas.appendChild(labelRenderer.domElement);
    labelRendererRef.current = labelRenderer;
    
    // Append canvas to DOM
    currentCanvas.appendChild(renderer.domElement);
    
    // Start the animation loop
    let animationFrameId: number;
    
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      // Call render function
      if (rendererRef.current && cameraRef.current && sceneRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
        
        if (labelRendererRef.current) {
          labelRendererRef.current.render(sceneRef.current, cameraRef.current);
        }
      }
    };
    
    animate();
    
    // Clean up on unmount
    return () => {
      cancelAnimationFrame(animationFrameId);
      
      if (rendererRef.current) {
        currentCanvas.removeChild(rendererRef.current.domElement);
      }
      
      if (labelRendererRef.current) {
        currentCanvas.removeChild(labelRendererRef.current.domElement);
      }
      
      if (rendererRef.current) {
        rendererRef.current.dispose();
      }
    };
  }, []);
  
  // Function to handle zone changes
  const checkAndUpdateZone = useCallback((x: number, z: number): void => {
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
    
    // Only update the zone if it's different, using a debounced approach
    if (newZone !== currentZone) {
      console.log(`Zone transition: ${currentZone} -> ${newZone}`);
      
      // Clear any pending zone update
      if (zoneUpdateTimeoutRef.current) {
        clearTimeout(zoneUpdateTimeoutRef.current);
      }
      
      // Set a timeout to update the zone (debounce zone changes)
      zoneUpdateTimeoutRef.current = setTimeout(() => {
        setCurrentZone(newZone);
        zoneUpdateTimeoutRef.current = null;
      }, 500); // 500ms debounce time
    }
  }, [currentZone]);
  
  // This function is called by the PlayerManager to notify of movement changes
  const notifyMovementChanged = (): void => {
    if (networkManagerRef.current) {
      networkManagerRef.current.notifyMovementChanged();
    }
  };
  
  // Handle ghost cleanup button
  const handleCleanupClick = (): void => {
    setIsCleaningUp(true);
    
    setTimeout(() => {
      if (playerManagerRef.current) {
        playerManagerRef.current.cleanupPlayerMeshes();
      }
      setIsCleaningUp(false);
    }, 100);
  };
  
  // Manual reconnect handler
  const handleReconnect = async (): Promise<void> => {
    await initializeSocket();
  };
  
  // Setting toggles
  const toggleSettings = (): void => setIsSettingsOpen(!isSettingsOpen);
  const toggleSound = (): void => setSoundEnabled(!soundEnabled);
  const toggleHorizontalInvert = (): void => {
    const newValue = !isHorizontalInverted;
    console.log(`Camera horizontal inversion set to: ${newValue}`);
    setIsHorizontalInverted(newValue);
  };
  
  // When networkManager notifies of connection change
  const handleConnectionChange = (connected: boolean, socketId?: string | null): void => {
    setIsConnected(connected);
    
    // Store socket ID when provided
    if (socketId) {
      console.log('Setting socketIdRef to:', socketId);
      socketIdRef.current = socketId;
    }
  };
  
  // Handler for server-initiated player initialization
  const handleInitPlayers = (players: PlayerData[]): void => {
    if (!playerRef.current || !socketIdRef.current) return;
    
    // Store the player's own ID to help differentiate from others
    const ownPlayerData = players.find(p => p.id === socketIdRef.current);
    if (ownPlayerData && playerRef.current) {
      playerRef.current.position.set(ownPlayerData.x, ownPlayerData.y, ownPlayerData.z);
      playerRef.current.userData.playerId = ownPlayerData.id;
      playerRef.current.userData.playerName = ownPlayerData.name;
    }
    
    // Create other players
    players.forEach(player => {
      if (player.id !== socketIdRef.current && playerManagerRef.current) {
        playerManagerRef.current.createPlayerMesh(player);
      }
    });
  };
  
  // Handler for new player joining
  const handlePlayerJoined = (player: PlayerData): void => {
    if (player.id === socketIdRef.current) {
      if (playerRef.current) {
        playerRef.current.position.set(player.x, player.y, player.z);
      }
    } else if (playerManagerRef.current) {
      playerManagerRef.current.createPlayerMesh(player);
    }
  };
  
  // Handler for player leaving
  const handlePlayerLeft = (playerId: string): void => {
    if (playerId === socketIdRef.current) return;
    
    // Remove player mesh from scene
    const playerMesh = playersRef.current.get(playerId);
    if (playerMesh) {
      // First remove any attached objects
      nameLabelsRef.current.delete(playerId);
      chatBubblesRef.current.delete(playerId);
      
      // Clean up resources
      if (playerMesh.geometry) playerMesh.geometry.dispose();
      if (Array.isArray(playerMesh.material)) {
        playerMesh.material.forEach((material: THREE.Material) => material.dispose());
      } else if (playerMesh.material) {
        playerMesh.material.dispose();
      }
      
      sceneRef.current?.remove(playerMesh);
      playersRef.current.delete(playerId);
    }
  };
  
  // Handler for player movement
  const handlePlayerMoved = (data: PlayerMoveData): void => {
    // Skip if this is our own player
    if (data.id === socketIdRef.current) return;
    
    // Update the position of the moved player
    const playerMesh = playersRef.current.get(data.id);
    if (playerMesh) {
      // Set target position for interpolation
      playerMesh.userData.targetPosition = new THREE.Vector3(data.x, data.y, data.z);
      playerMesh.userData.lastUpdateTime = Date.now();
      
      // Reset disappearance timer
      if (playerMesh.userData.disappearanceTimeout) {
        clearTimeout(playerMesh.userData.disappearanceTimeout);
      }
      
      // Set a new disappearance timeout
      playerMesh.userData.disappearanceTimeout = setTimeout(() => {
        playerMesh.userData.markedForCleanup = true;
      }, 30000);
    }
  };
  
  // Handler for chat messages
  const handleChatMessage = (message: ChatMessageData): void => {
    if (!playerManagerRef.current) return;
    
    // If this is our own message, add a chat bubble above our player
    if (message.playerId === socketIdRef.current && playerRef.current) {
      playerManagerRef.current.createChatBubble(message.playerId, message.text, playerRef.current);
    } 
    // If it's another player's message, find their mesh and add a bubble
    else if (message.playerId && playersRef.current.has(message.playerId)) {
      const playerMesh = playersRef.current.get(message.playerId);
      if (playerMesh) {
        playerManagerRef.current.createChatBubble(message.playerId, message.text, playerMesh);
      }
    }
  };
  
  // Handler for item dropped in world
  const handleItemDropped = (data: WorldItemData): void => {
    if (worldManagerRef.current) {
      worldManagerRef.current.addItemToWorld(data);
    }
  };
  
  // Handler for item removed from world
  const handleItemRemoved = (dropId: string): void => {
    if (worldManagerRef.current) {
      worldManagerRef.current.removeItemFromWorld(dropId);
    }
  };
  
  // Define handlers for resource gathering and item pickup
  const handleGatherResource = (resourceId: string): void => {
    if (networkManagerRef.current) {
      networkManagerRef.current.gatherResource(resourceId);
    }
  };
  
  const handlePickupItem = (dropId: string): void => {
    if (networkManagerRef.current) {
      networkManagerRef.current.pickupItem(dropId);
    }
  };
  
  // Initialize world manager hook but only use it when scene is available
  const [scene] = useState<THREE.Scene>(new THREE.Scene());
  useEffect(() => {
    // Update the scene ref with our initialized scene
    sceneRef.current = scene;
  }, [scene]);
  
  // Create the input handler hook at the top level of the component
  const inputHandlerHook = useInputHandler({
    raycasterRef,
    mouseRef,
    playerRef,
    resourceNodesRef,
    worldItemsRef,
    onGatherResource: handleGatherResource,
    onPickupItem: handlePickupItem
  });
  
  // Initialize world manager
  const worldManagerHook = useWorldManager({ 
    scene,
    resourceNodesRef,
    worldItemsRef
  });
  
  // Initialize debug tools at the top level
  const debugToolsHook = useDebugTools({
    scene,
    playersRef
  });
  
  // Initialize camera controller at the top level with a default empty camera
  // that will be updated once the real camera is available
  const defaultCamera = new THREE.PerspectiveCamera();
  const cameraControllerHook = useCameraController({
    camera: defaultCamera,
    isHorizontalInvertedRef
  });
  
  // Initialize player manager at the top level, passing the camera angle from the camera controller
  const playerManagerHook = usePlayerManager({
    scene,
    playerRef,
    playersRef,
    nameLabelsRef,
    chatBubblesRef,
    positionHistory,
    keysPressed: inputHandlerHook.keysPressed,
    cameraAngle: cameraControllerHook.cameraAngle,
    notifyMovementChanged,
    ownSocketId: socketIdRef.current || undefined
  });
  
  // Update camera controller with the real camera once it's available
  useEffect(() => {
    if (cameraRef.current) {
      cameraControllerHook.setCamera(cameraRef.current);
    }
  }, [cameraRef.current, cameraControllerHook]);
  
  // Initialize network manager at the top level
  const networkManagerHook = useNetworkManager({
    onInitPlayers: handleInitPlayers,
    onPlayerJoined: handlePlayerJoined,
    onPlayerLeft: handlePlayerLeft,
    onPlayerMoved: handlePlayerMoved,
    onChatMessage: handleChatMessage,
    onItemDropped: handleItemDropped,
    onItemRemoved: handleItemRemoved,
    onConnectionChange: handleConnectionChange,
    playerRef,
    setPlayerName,
    playersRef,
    cleanupPlayerMeshes: playerManagerHook?.cleanupPlayerMeshes || (() => {})
  });
  
  // Store manager references at the top level
  useEffect(() => {
    worldManagerRef.current = worldManagerHook;
    debugToolsRef.current = debugToolsHook;
    if (playerManagerHook) playerManagerRef.current = playerManagerHook;
    if (cameraControllerHook) cameraControllerRef.current = cameraControllerHook;
    networkManagerRef.current = networkManagerHook;
  }, [worldManagerHook, debugToolsHook, playerManagerHook, cameraControllerHook, networkManagerHook]);
  
  // Main animation and update loop
  useEffect(() => {
    if (!cameraRef.current || !rendererRef.current) return;
    
    // Get the actual instances from our component refs for use in the animation loop
    const camera = cameraRef.current;
    const renderer = rendererRef.current;
    
    // Set up input event handlers 
    const inputCleanup = inputHandlerHook.setupEventListeners(renderer, camera);
    
    // Set up camera event handlers if available
    let cameraCleanup = () => {};
    let resizeCleanup = () => {};
    if (cameraControllerHook) {
      cameraCleanup = cameraControllerHook.setupEventListeners();
      resizeCleanup = cameraControllerHook.setupResizeHandler();
    }
    
    // Create the environment using our world manager
    worldManagerHook.createEnvironment();
    worldManagerHook.createBoundaryMarkers();
    worldManagerHook.createWorldResources();
    
    // Create player if we have a player manager
    if (playerManagerHook) {
      playerManagerHook.createPlayer();
    }
    
    // Animation loop
    let animationFrameId: number;
    
    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      
      // Get delta time for animation updates
      const delta = clockRef.current.getDelta();
      
      // Update player movement
      if (playerManagerRef.current) {
        playerManagerRef.current.updatePlayerMovement(delta);
      }
      
      // Update remote player positions
      if (playerManagerRef.current) {
        playerManagerRef.current.updateRemotePlayerPositions(delta);
      }
      
      // Update camera to follow player
      if (cameraControllerRef.current && playerRef.current) {
        cameraControllerRef.current.updateCameraPosition(playerRef.current.position);
      }
      
      // Update world items (animation)
      if (worldManagerRef.current) {
        worldManagerRef.current.updateWorldItems(delta);
      }
      
      // Update debug visuals
      if (debugToolsRef.current && debugToolsRef.current.DEBUG.showPositionMarkers) {
        debugToolsRef.current.updateDebugVisuals();
      }
      
      // Send position update to server
      if (networkManagerRef.current) {
        networkManagerRef.current.sendPositionUpdate();
      }
      
      // Check for expired chat bubbles
      const now = Date.now();
      const expiredBubbles: string[] = [];
      
      chatBubblesRef.current.forEach((bubble, playerId) => {
        if (now > bubble.expiry) {
          expiredBubbles.push(playerId);
        }
      });
      
      // Remove expired bubbles
      expiredBubbles.forEach(playerId => {
        const bubble = chatBubblesRef.current.get(playerId);
        if (bubble && bubble.object) {
          if (bubble.object.parent) {
            bubble.object.parent.remove(bubble.object);
          }
          scene.remove(bubble.object);
        }
        chatBubblesRef.current.delete(playerId);
      });
      
      // Render
      renderer.render(scene, camera);
      if (labelRendererRef.current) {
        labelRendererRef.current.render(scene, camera);
      }
      
      // Update player position checking for zone changes only
      if (playerRef.current) {
        // Check for zone changes
        const currentPos = playerRef.current.position;
        checkAndUpdateZone(currentPos.x, currentPos.z);
      }
    };
    
    animate();
    
    // Cleanup function
    return () => {
      cancelAnimationFrame(animationFrameId);
      cameraCleanup();
      resizeCleanup();
      inputCleanup();
      
      if (worldManagerRef.current && typeof worldManagerRef.current.cleanup === 'function') {
        worldManagerRef.current.cleanup();
      }
      
      if (debugToolsRef.current && typeof debugToolsRef.current.cleanupDebugVisuals === 'function') {
        debugToolsRef.current.cleanupDebugVisuals();
      }
      
      if (networkManagerRef.current && typeof networkManagerRef.current.cleanup === 'function') {
        networkManagerRef.current.cleanup();
      }
    };
  }, [inputHandlerHook, handleGatherResource, handlePickupItem]);
  
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative' }}>
      <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />
      
      <GameUI
        isConnected={isConnected}
        playerName={playerName}
        currentZone={currentZone}
        isCleaningUp={isCleaningUp}
        isSettingsOpen={isSettingsOpen}
        soundEnabled={soundEnabled}
        isHorizontalInverted={isHorizontalInverted}
        onToggleSettings={toggleSettings}
        onToggleSound={toggleSound}
        onToggleHorizontalInvert={toggleHorizontalInvert}
        onCleanupClick={handleCleanupClick}
        onReconnect={handleReconnect}
      />
    </div>
  );
};

export default GameCanvas; 