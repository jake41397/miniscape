import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';
import { 
  initializeSocket, 
  disconnectSocket, 
  setupSocketCleanup, 
  getSocket, 
  isSocketReady, 
  getSocketStatus, 
  saveLastKnownPosition,
  getLastKnownPosition
} from '../game/network/socket';
import { setupSocketListeners } from '../game/network/gameSocketHandler';
import { Player, PlayerPosition, Item } from '../types/player';
import InventoryPanel, { InventoryPanelHandle } from './ui/InventoryPanel';
import soundManager from '../game/audio/soundManager';
import { 
  ResourceNode, 
  ResourceType, 
  WorldItem
} from '../game/world/resources';
import GameChat from './GameChat';
import GameSettings from './GameSettings';
import WorldManager, { WORLD_BOUNDS } from '../game/world/WorldManager';
import ItemManager from '../game/world/ItemManager';
import FPSCounter from './ui/FPSCounter';
import { PlayerController } from './game/PlayerController';
import { SocketController } from './game/SocketController';
import WorldContextMenu from './ui/WorldContextMenu';
import { ResourceController } from './game/ResourceController';
import SkillsPanel from './ui/SkillsPanel';
import NPCInteractionController from './game/NPCInteractionController';
import PlayerSocialController from './game/PlayerSocialController';
import TutorialOverlay from './ui/TutorialOverlay';
import SmithingController from './game/SmithingController';
import NotificationController from './game/NotificationController';

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

// Hooks
import { useThreeSetup } from '../hooks/useThreeSetup';
import { usePlayerInput } from '../hooks/usePlayerInput';
import { useCameraControl } from '../hooks/useCameraControl';
import { usePlayerMovement } from '../hooks/usePlayerMovement';
import { useInteraction } from '../hooks/useInteraction';
import { useGameLoop } from '../hooks/useGameLoop';
import { useNetworkSync } from '../hooks/useNetworkSync';

// UI Components
import ConnectionStatusIndicator from './ui/ConnectionStatusIndicator';
import ZoneIndicator from './ui/ZoneIndicator';
import { cleanupAllNameLabels, createPlayerMesh, disposeMesh } from 'utils/threeUtils';
import TabMenu from './ui/TabMenu';

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
  // Add ref for ItemManager
  const itemManagerRef = useRef<ItemManager | null>(null);
  // Add socket controller ref
  const socketControllerRef = useRef<SocketController | null>(null);
  // Create player controller ref
  const playerController = useRef<PlayerController | null>(null);
  
  // Add a ref for cleanup functions so they can be accessed outside useEffect
  const cleanupFunctionsRef = useRef<{
    initialCleanup?: () => void;
    cleanupPlayerMeshes?: () => void;
  }>({});
  
  const [playerName, setPlayerName] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const [currentZone, setCurrentZone] = useState<string>('Lumbridge');
  // Add player count state
  const [playerCount, setPlayerCount] = useState<number>(0);
  // Add inventory state
  const [inventory, setInventory] = useState<Item[]>([]);
  
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
  
  // Settings state moved to GameSettings component
  const [isHorizontalInverted, setIsHorizontalInverted] = useState(false);
  const isHorizontalInvertedRef = useRef(false);
  
  // Create a ref to store the createNameLabel function
  const createNameLabelRef = useRef<((name: string, mesh: THREE.Mesh) => CSS2DObject) | null>(null);
  
  // Add a ref to track all name labels in the scene for proper cleanup
  const nameLabelsRef = useRef<Map<string, CSS2DObject>>(new Map());
  
  // Add chat ref for socket controller
  const chatRef = useRef<any>(null);
  
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
  
  // Add a ref to track the last time we cached position
  const lastPositionCacheTime = useRef(0);
  
  // Add inventoryPanelRef
  const inventoryPanelRef = useRef<InventoryPanelHandle>(null);
  
  // Add FPS state
  const [currentFps, setCurrentFps] = useState<number>(60);
  
  // Define movement state for PlayerController
  const movementStateRef = useRef({
    moveForward: false,
    moveBackward: false,
    moveLeft: false,
    moveRight: false,
    isJumping: false,
    jumpVelocity: 0,
    lastJumpTime: 0,
    lastUpdateTime: Date.now()
  });
  
  // Ensure movementStateRef is initialized with current time
  useEffect(() => {
    // Update the lastUpdateTime to ensure it's fresh whenever deps change
    movementStateRef.current.lastUpdateTime = Date.now();
    
    console.log("%c 🏃 MovementState initialized/updated", "color: #2196F3;", movementStateRef.current);
  }, [playerRef.current]); // Re-initialize when player changes
  
  // Add resource controller ref
  const resourceControllerRef = useRef<ResourceController | null>(null);
  
  // Add tutorial state
  const [showTutorial, setShowTutorial] = useState(false);
  const tutorialCompletedRef = useRef(false);
  
  // --- Hook Initializations ---

  // 1. Three.js Setup
  const { scene, camera, renderer, labelRenderer } = useThreeSetup(canvasRef);
  // Use existing sceneRef instead of redeclaring
  sceneRef.current = scene;
  const cameraRef = useRef(camera);

  // Update refs when objects are created 
  useEffect(() => { sceneRef.current = scene; }, [scene]);
  useEffect(() => { cameraRef.current = camera; }, [camera]);

  // 2. Player Input
  const { inputState, consumeJumpAttempt, hasMovementInputChanged } = usePlayerInput();

  // Keep camera inversion ref in sync with state
  useEffect(() => {
    isHorizontalInvertedRef.current = isHorizontalInverted;
  }, [isHorizontalInverted]);
  
  // 3. Camera Control
  const { cameraState, updateCameraPosition } = useCameraControl({
    camera: cameraRef.current,
    playerRef,
    isEnabled: !!renderer,
    isHorizontalInvertedRef,
  });

  // 4. Player Movement
  const { updatePlayerMovement, movementOccurred } = usePlayerMovement({
    playerRef,
    cameraAngle: cameraState.angle,
    inputState,
    consumeJumpAttempt,
  });

  // 5. Network Synchronization
  const { isConnected: networkConnected, playerName: networkPlayerName, reconnect } = useNetworkSync({
    playerRef,
    playersRef,
    nameLabelsRef,
    worldManagerRef,
    itemManagerRef,
    sceneRef,
    setPlayerNameState: setPlayerName,
    setPlayerCount,
  });

  // Sync player name from network
  useEffect(() => {
    if (networkPlayerName && networkPlayerName !== playerName) {
      setPlayerName(networkPlayerName);
    }
  }, [networkPlayerName, playerName]);

  // Sync connection status from network
  useEffect(() => {
    setIsConnected(networkConnected);
  }, [networkConnected]);
  
  // Log when player count changes
  useEffect(() => {
    console.log(`Player count updated: ${playerCount}`);
  }, [playerCount]);

  // Initialize ResourceController when scene and other references are ready
  useEffect(() => {
    if (scene && playerRef.current && worldManagerRef.current) {
      console.log("%c 🛠️ Initializing ResourceController...", "background: #4CAF50; color: white;");
      
      // Create a new ResourceController
      const resourceController = new ResourceController({
        scene,
        resourceNodesRef,
        worldItemsRef,
        worldManagerRef,
        itemManagerRef,
        playerRef
      });
      
      // Initialize the resource controller
      resourceController.initializeWorldManager();
      resourceController.initializeItemManager();
      
      // Store in ref
      resourceControllerRef.current = resourceController;
      
      // Connect it to the WorldManager
      worldManagerRef.current.setResourceController(resourceController);
      
      console.log("%c ✅ ResourceController initialized!", "background: #4CAF50; color: white;");
    }
  }, [scene, playerRef.current, worldManagerRef.current]);

  // Initialize socket controller
  useEffect(() => {
    if (!scene || !camera || !playerRef.current) return;
    
    console.log("%c 🌐 INITIALIZING SOCKET CONTROLLER", "background: #4CAF50; color: white; font-size: 16px;");
    
    // Create refs needed for SocketController - REMOVED, now using top-level refs
    
    const controller = new SocketController({
      scene,
      playerRef,
      playersRef,
      nameLabelsRef, // Use the ref defined at the top level
      worldManagerRef,
      itemManagerRef,
      cleanupIntervalRef,
      chatRef, // Use the ref defined at the top level
      setPlayerName,
      setIsConnected,
      setCurrentZone,
      createNameLabel: (name, mesh) => {
        // Simple implementation to satisfy the interface
        const labelDiv = document.createElement('div');
        labelDiv.className = 'name-label';
        labelDiv.textContent = name;
        return new CSS2DObject(labelDiv);
      }
    });
    
    // CRITICAL FIX: Call initialize() method on the controller
    controller.initialize().then(success => {
      if (success) {
        console.log("%c ✅ Socket controller initialized successfully!", "background: #4CAF50; color: white;");
      } else {
        console.error("%c ❌ Socket controller initialization FAILED!", "background: red; color: white;");
      }
    });
    
    socketControllerRef.current = controller;
    
    // Log the controller reference to confirm it's set
    console.log("Socket controller reference set:", {
      controllerExists: !!socketControllerRef.current,
      socketControllerMethods: Object.keys(controller)
    });
    
    return () => {
      // Clean up controller if needed
      console.log("%c 🛑 CLEANING UP SOCKET CONTROLLER", "background: #F44336; color: white;");
      if (socketControllerRef.current) {
        socketControllerRef.current.cleanup();
      }
      socketControllerRef.current = null;
    };
  }, [scene, camera, playerRef.current]);

  // Setup Player Controller
  useEffect(() => {
    if (!camera || !socketControllerRef.current) {
      console.log("%c ⏳ Waiting for dependencies before initializing PlayerController", "color: orange;", {
        cameraExists: !!camera,
        socketControllerExists: !!socketControllerRef.current,
        time: new Date().toISOString()
      });
      return;
    }
    
    // Don't recreate if we already have one
    if (playerController.current) {
      console.log("%c 🎮 PlayerController already exists, not recreating", "color: #4CAF50;");
      return;
    }
    
    console.log("%c 🎮 Initializing PlayerController...", "background: #4CAF50; color: white; font-size: 16px;");
    
    try {
      // Create a new PlayerController instance
      const controller = new PlayerController(
        playerRef,
        movementStateRef,
        keysPressed,
        { current: {
          distance: cameraDistance.current,
          angle: cameraAngle.current,
          tilt: cameraTilt.current,
          isMiddleMouseDown: isMiddleMouseDown.current,
          lastMousePosition: lastMousePosition.current,
          isHorizontalInverted: false
        }},
        camera,
        lastSentPosition,
        { current: false },
        socketControllerRef.current
      );
      
      // Store controller reference
      playerController.current = controller;
      
      console.log("%c ✅ PlayerController initialized successfully!", "background: #4CAF50; color: white; font-size: 16px;", {
        controllerExists: !!playerController.current,
        socketControllerPassed: !!socketControllerRef.current
      });
    } catch (err) {
      console.error("%c ❌ PlayerController initialization FAILED!", "background: red; color: white; font-size: 16px;", err);
    }
    
    return () => {
      console.log("%c 🧹 Cleaning up PlayerController", "color: orange;");
      playerController.current = null;
    };
  }, [camera, socketControllerRef.current]);

  // Add diagnostic interval to check PlayerController status and reinitialize if needed
  useEffect(() => {
    const checkInterval = setInterval(() => {
      // Only log when debug mode is ON
      if (DEBUG.logNetworkStats) {
        console.log("%c 🕹️ PLAYER CONTROLLER CHECK", "background: #9C27B0; color: white;", {
          playerControllerExists: !!playerController.current,
          socketControllerExists: !!socketControllerRef.current,
          time: new Date().toISOString()
        });
      }
      
      // If controller is null but all requirements are present, try to reinitialize
      if (!playerController.current && camera && socketControllerRef.current) {
        console.log("%c 🔄 AUTO-REINITIALIZING PLAYER CONTROLLER", "background: orange; color: white; font-size: 16px;");
        
        try {
          // Create a new PlayerController instance
          const controller = new PlayerController(
            playerRef,
            movementStateRef,
            keysPressed,
            { current: {
              distance: cameraDistance.current,
              angle: cameraAngle.current,
              tilt: cameraTilt.current,
              isMiddleMouseDown: isMiddleMouseDown.current,
              lastMousePosition: lastMousePosition.current,
              isHorizontalInverted: false
            }},
            camera,
            lastSentPosition,
            { current: false },
            socketControllerRef.current
          );
          
          playerController.current = controller;
          console.log("%c ✅ Auto-recovery PlayerController initialized!", "background: green; color: white;");
        } catch (err) {
          console.error("Failed to auto-initialize PlayerController:", err);
        }
      }
    }, 5000); // Check every 5 seconds
    
    return () => clearInterval(checkInterval);
  }, [camera, socketControllerRef.current, playerController.current]);

  // 6. Interaction Handling
  const interactionOptions = {
    sceneRef,
    cameraRef,
    resourceNodesRef,
    worldItemsRef,
    canvasRef,
    playerRef,
    playerControllerRef: playerController,
    itemManagerRef
  };

  const { 
    handleMouseClick, 
    handleRightClick, 
    contextMenuPos, 
    nearbyItems,
    nearbyResources,
    closeContextMenu, 
    handlePickupItemFromMenu,
    handleResourceInteraction
  } = useInteraction(interactionOptions);

  // --- World and Item Management ---
  useEffect(() => {
    if (!scene) return;

    // Callbacks for WorldManager
    const handleResourceNodesCreated = (nodes: ResourceNode[]) => {
      resourceNodesRef.current = nodes;
      console.log("Resource nodes initialized:", nodes.length);
    };
    
    const handleWorldItemsCreated = (items: WorldItem[]) => {
      console.log("(WorldManager) Initial world items received:", items.length);
    };

    // Initialize World Manager
    const worldManager = new WorldManager({
      scene,
      onResourceNodesCreated: handleResourceNodesCreated,
      onWorldItemsCreated: handleWorldItemsCreated
    });
    
    // Make it globally accessible for context menu
    (window as any).worldManager = worldManager;
    
    worldManagerRef.current = worldManager;
    console.log("WorldManager initialized.");

    // Initialize Item Manager
    const itemManager = new ItemManager({
      scene,
      playerRef,
      onWorldItemsUpdated: (items) => {
        worldItemsRef.current = items;
      }
    });
    itemManagerRef.current = itemManager;
    itemManager.initSocketListeners();
    console.log("ItemManager initialized.");

    return () => {
      console.log("Cleaning up WorldManager and ItemManager...");
      worldManagerRef.current?.cleanup();
      itemManagerRef.current?.cleanup();
      worldManagerRef.current = null;
      itemManagerRef.current = null;
      resourceNodesRef.current = [];
      worldItemsRef.current = [];
      
      // Clean up global reference
      (window as any).worldManager = null;
    };
  }, [scene]);

  // Set camera in WorldManager for LOD updates when camera is available
  useEffect(() => {
    if (camera && worldManagerRef.current) {
      worldManagerRef.current.setCamera(camera);
    }
  }, [camera, worldManagerRef.current]);

  // --- Initialize Local Player ---
  useEffect(() => {
    if (scene && !playerRef.current) {
      console.log("Creating local player mesh...");
      const mesh = createPlayerMesh();

      // Check if player comes from a portal (URL parameter 'portal=true')
      const urlParams = new URLSearchParams(window.location.search);
      const comingFromPortal = urlParams.get('portal') === 'true';
      const refSite = urlParams.get('ref') || '';
      
      if (comingFromPortal) {
        console.log("Player coming from a portal!", { refSite });
        
        // Set the player's position at the portal spawn point
        // This would ideally be a designated area in your world
        // For now, we'll use a fixed position
        const portalSpawnPoint = new THREE.Vector3(45, 1, 45); // Near the portal but not inside it
        mesh.position.copy(portalSpawnPoint);
        
        // We'll create a return portal later after the world is fully initialized
        // Store the reference URL for later use
        (window as any).returnPortalDestination = refSite;
        
        // Store the fact that we need to create a return portal
        (window as any).shouldCreateReturnPortal = true;
      } else {
        // Try to restore position from last session if not coming from a portal
        const cachedPosition = getLastKnownPosition();
        if (cachedPosition) {
          const distSq = (cachedPosition.x - mesh.position.x)**2 + (cachedPosition.z - mesh.position.z)**2;
          if(distSq > 0.1) {
            console.log("Applying cached position on player creation:", cachedPosition);
            mesh.position.set(cachedPosition.x, cachedPosition.y, cachedPosition.z);
          }
        }
      }

      // Extract and save player info from URL parameters if present
      if (urlParams.has('username')) {
        const username = urlParams.get('username') || '';
        (window as any).playerName = username;
        setPlayerName(username);
        console.log("Player name set from URL:", username);
      }
      
      if (urlParams.has('color')) {
        const color = urlParams.get('color') || '';
        (window as any).playerColor = color;
        console.log("Player color set from URL:", color);
      }
      
      if (urlParams.has('speed')) {
        const speed = parseFloat(urlParams.get('speed') || '5');
        (window as any).playerSpeed = speed;
        console.log("Player speed set from URL:", speed);
      }

      playerRef.current = mesh;
      scene.add(mesh);
      console.log("Local player mesh added to scene.");

      return () => {
        console.log("Cleaning up local player mesh...");
        if (playerRef.current) {
          disposeMesh(scene, playerRef.current);
          playerRef.current = null;
        }
      };
    }
  }, [scene]);

  // --- Sound Manager Control ---
  useEffect(() => {
    soundManager.setEnabled(soundEnabled);
  }, [soundEnabled]);

  // --- Remote Player Position Update Logic ---
  const updateRemotePlayerPositions = useCallback((delta: number) => {
    if (!playersRef.current) return;

    playersRef.current.forEach((playerMesh, playerId) => {
      // Debug: Validate userData and targetPosition exist
      if (!playerMesh.userData) {
        console.warn(`Player ${playerId} has no userData`);
        return;
      }
      
      const targetData = playerMesh.userData.targetPosition;
      if (!targetData) {
        console.warn(`Player ${playerId} has no targetPosition data`);
        return;
      }

      // Ensure we can read x,y,z from the target regardless of its format
      // This handles both {x,y,z} objects and THREE.Vector3 objects safely
      const targetX = typeof targetData.x === 'number' ? targetData.x : 0;
      const targetY = typeof targetData.y === 'number' ? targetData.y : 0;
      const targetZ = typeof targetData.z === 'number' ? targetData.z : 0;

      const current = playerMesh.position;
      const target = new THREE.Vector3(targetX, targetY, targetZ);

      // --- Snap Logic ---
      const distanceSq = current.distanceToSquared(target);
      if (distanceSq > POSITION_SNAP_THRESHOLD * POSITION_SNAP_THRESHOLD) {
        console.log(`Snapping player ${playerId} due to large distance: ${Math.sqrt(distanceSq).toFixed(2)}`);
        playerMesh.position.copy(target);
        playerMesh.userData.serverVelocity = null;
        return;
      }
    
      // --- Interpolation ---
      // Only interpolate if the distance is significant
      if (distanceSq > 0.0001) {
        const interpVector = target.clone().sub(current).multiplyScalar(INTERPOLATION_SPEED);
        playerMesh.position.add(interpVector);
      }

      // --- Prediction ---
      if (ENABLE_POSITION_PREDICTION && playerMesh.userData.serverVelocity && distanceSq < 1.0) {
        const timeSinceUpdate = (Date.now() - (playerMesh.userData.lastUpdateTime || Date.now())) / 1000.0;
        const predictionFactor = Math.min(0.3, timeSinceUpdate * 0.6);
        const velocity = playerMesh.userData.serverVelocity;
        playerMesh.position.x += velocity.x * delta * predictionFactor;
        playerMesh.position.z += velocity.z * delta * predictionFactor;
      }

      // --- Rotation ---
      if (distanceSq > 0.0025) {
        const angle = Math.atan2(target.x - current.x, target.z - current.z);
        const rotationDiff = angle - playerMesh.rotation.y;
        const normalizedDiff = ((rotationDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
        playerMesh.rotation.y += normalizedDiff * 0.3;
      } else if (playerMesh.userData.targetRotation !== undefined) {
        // If we're not moving much but have a server-provided rotation, use that
        const targetRotation = playerMesh.userData.targetRotation;
        const rotationDiff = targetRotation - playerMesh.rotation.y;
        const normalizedDiff = ((rotationDiff + Math.PI) % (Math.PI * 2)) - Math.PI;
        
        playerMesh.rotation.y += normalizedDiff * 0.3;
      }

      // --- Final Snap ---
      if (playerMesh.position.distanceToSquared(target) < 0.0004) {
        playerMesh.position.copy(target);
      }
    });
  }, []);

  // Declare sendPositionUpdate function to match the expected signature in useGameLoop
  const sendPositionUpdate = useCallback((force?: boolean) => {
    if (!playerRef.current || !socketControllerRef.current) return;

    // Send player position with optional force parameter
    socketControllerRef.current.sendPlayerPosition(
      playerRef.current.position,
      playerRef.current.rotation.y,
      force
    );
  }, [playerRef, socketControllerRef]);

  // --- Game Loop ---
  useGameLoop({
    scene, camera, renderer, labelRenderer,
    itemManagerRef,
    playerRef,
    playersRef,
    updatePlayerMovement,
    updateCameraPosition,
    updateRemotePlayerPositions,
    sendPositionUpdate,
    checkMovementInputChanged: hasMovementInputChanged,
    movementOccurred,
    onFpsUpdate: setCurrentFps,
    playerController
  });

  // --- Global Click Listener ---
  useEffect(() => {
    const currentRenderer = renderer;
    if (currentRenderer) {
      // Add debug logging at click initialization
      console.log("%c 🖱️ Setting up click listener on renderer", "background: #673AB7; color: white;", {
        rendererExists: !!currentRenderer,
        domElementExists: !!currentRenderer.domElement,
      });
      
      // Direct click handler for diagnostics
      const directClickHandler = (e: MouseEvent) => {
        console.log("%c 🖱️ CLICK DETECTED", "background: #E91E63; color: white; font-size: 16px;", {
          x: e.clientX, 
          y: e.clientY,
          button: e.button
        });
        
        // Call the actual handler
        handleMouseClick(e);
      };
      
      // Add right-click handler
      const directRightClickHandler = (e: MouseEvent) => {
        if (e.button === 2) { // Check if it's a right-click
          console.log("%c 🖱️ RIGHT-CLICK DETECTED", "background: #4CAF50; color: white; font-size: 16px;", {
            x: e.clientX, 
            y: e.clientY
          });
          
          // Call the right-click handler
          handleRightClick(e);
        }
      };
      
      // Prevent default context menu
      const preventDefaultContextMenu = (e: MouseEvent) => {
        e.preventDefault();
      };
      
      // Attach handlers
      currentRenderer.domElement.addEventListener('click', directClickHandler);
      currentRenderer.domElement.addEventListener('mousedown', directRightClickHandler);
      currentRenderer.domElement.addEventListener('contextmenu', preventDefaultContextMenu);
      
      return () => {
        // Remove all handlers
        currentRenderer.domElement.removeEventListener('click', directClickHandler);
        currentRenderer.domElement.removeEventListener('mousedown', directRightClickHandler);
        currentRenderer.domElement.removeEventListener('contextmenu', preventDefaultContextMenu);
        console.log("Removed click and context menu handlers");
      };
    }
  }, [renderer, handleMouseClick, handleRightClick]);

  // --- Final Cleanup ---
  useEffect(() => {
    return () => {
      console.log("Running final GameCanvas cleanup...");
      if(sceneRef.current && nameLabelsRef.current) {
        cleanupAllNameLabels(sceneRef.current, nameLabelsRef);
      }

      if(sceneRef.current && playersRef.current) {
        playersRef.current.forEach((mesh) => {
          disposeMesh(sceneRef.current!, mesh);
        });
        playersRef.current.clear();
      }
    }
  }, []);

  // Set up a listener for inventory updates
  useEffect(() => {
    const setupInventoryListener = async () => {
      const socket = await getSocket();
      if (socket) {
        socket.on('inventoryUpdate', (updatedInventory: Item[]) => {
          setInventory(updatedInventory);
        });
      }
      
      return () => {
      getSocket().then(socket => {
        if (socket) {
            socket.off('inventoryUpdate');
          }
        });
      };
    };
    
    setupInventoryListener();
  }, []);

  // Find the useEffect that handles player position updates
  // Add this code to update the data attribute with the current player position
  useEffect(() => {
    if (playerRef.current) {
      // Create a function to update the position data attribute
      const updatePositionDataAttribute = () => {
        if (!document.querySelector('[data-player-position]')) {
          // Create element if it doesn't exist
          const positionElement = document.createElement('div');
          positionElement.setAttribute('data-player-position', 'true');
          positionElement.style.display = 'none';
          document.body.appendChild(positionElement);
        }
        
        const positionElement = document.querySelector('[data-player-position]');
        if (positionElement && playerRef.current) {
          const { x, y, z } = playerRef.current.position;
          const positionData = { x, y, z };
          positionElement.setAttribute('data-position', JSON.stringify(positionData));
        }
      };

      // Initial update
      updatePositionDataAttribute();

      // Set interval to update regularly
      const updateInterval = setInterval(updatePositionDataAttribute, 100); // Update more frequently

      return () => {
        clearInterval(updateInterval);
      };
    }
  }, [playerRef.current]);

  // Add key event listeners
  useEffect(() => {
    // Function to handle key down events
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip if user is typing in an input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      
      // Update the keysPressed ref
      keysPressed.current[e.key] = true;
      
      // Also update arrow keys with WASD equivalents to support both
      if (e.key === 'ArrowUp') keysPressed.current['w'] = true;
      if (e.key === 'ArrowDown') keysPressed.current['s'] = true;
      if (e.key === 'ArrowLeft') keysPressed.current['a'] = true;
      if (e.key === 'ArrowRight') keysPressed.current['d'] = true;
      
      // SPECIAL KEY - Press 'T' to create a test item at player position
      if (e.key === 't' || e.key === 'T') {
        console.log("%c 🧪 TEST ITEM CREATION", "background: #E91E63; color: white; font-size: 16px;");
        if (itemManagerRef.current) {
          const types = ['coal', 'log', 'fish', 'stone', 'berries'];
          const randomType = types[Math.floor(Math.random() * types.length)];
          itemManagerRef.current.testCreateItem(randomType);
          console.log(`Created test item of type: ${randomType}`);
        } else {
          console.error("Cannot create test item - itemManagerRef is null");
        }
      }
      
      // SPECIAL DEBUG KEY - Press 'P' to force position update
      if (e.key === 'p' || e.key === 'P') {
        console.log("%c 🔥 MANUAL POSITION UPDATE TRIGGERED", "background: #ff0000; color: white; font-size: 16px;");
        
        // First log the socket controller state
        console.log("%c 📡 SOCKET CONTROLLER STATE", "background: blue; color: white;", {
          controllerExists: !!socketControllerRef.current,
          socketState: socketControllerRef.current 
            ? { isConnected: socketControllerRef.current.isConnected(), socketId: socketControllerRef.current.getSocketId() } 
            : 'null',
          initializeTime: new Date().toISOString()
        });
        
        if (playerRef.current && socketControllerRef.current) {
          // Move the player a little bit
          playerRef.current.position.x += 0.5;
          // Force send the position update
          socketControllerRef.current.sendPlayerPosition(
            playerRef.current.position,
            playerRef.current.rotation.y,
            true
          );
          console.log("Player moved and position sent:", playerRef.current.position);
        } else {
          console.log("Cannot send position - playerRef or socketControllerRef is null", {
            playerExists: !!playerRef.current,
            socketControllerExists: !!socketControllerRef.current
          });
        }
      }
      
      // NEW SPECIAL DEBUG KEY - Shift+R to force reinitialize both controllers
      if ((e.key === 'r' || e.key === 'R') && e.shiftKey) {
        console.log("%c 🔄 MANUAL CONTROLLER REINITIALIZATION TRIGGERED", "background: #FF9800; color: white; font-size: 16px;");
        
        // Clean up existing controllers first
        if (socketControllerRef.current) {
          console.log("Cleaning up existing SocketController...");
          socketControllerRef.current.cleanup();
          socketControllerRef.current = null;
        }
        
        if (playerController.current) {
          console.log("Cleaning up existing PlayerController...");
          playerController.current = null;
        }
        
        // Create new SocketController if we have the required dependencies
        if (scene && camera && playerRef.current) {
          console.log("%c 🛠️ Manually reinitializing SocketController...", "background: #2196F3; color: white;");
          
          const controller = new SocketController({
            scene,
            playerRef,
            playersRef,
            nameLabelsRef,
            worldManagerRef,
            itemManagerRef,
            cleanupIntervalRef,
            chatRef,
            setPlayerName,
            setIsConnected,
            setCurrentZone,
            createNameLabel: (name, mesh) => {
              const labelDiv = document.createElement('div');
              labelDiv.className = 'name-label';
              labelDiv.textContent = name;
              return new CSS2DObject(labelDiv);
            }
          });
          
          // Initialize the socket controller
          controller.initialize().then(success => {
            if (success) {
              socketControllerRef.current = controller;
              console.log("%c ✅ SocketController manually reinitialized!", "background: #4CAF50; color: white;");
              
              // Now create PlayerController once SocketController is ready
              console.log("%c 🎮 Manually reinitializing PlayerController...", "background: #9C27B0; color: white;");
              try {
                const playerCtrl = new PlayerController(
                  playerRef,
                  movementStateRef,
                  keysPressed,
                  { current: {
                    distance: cameraDistance.current,
                    angle: cameraAngle.current,
                    tilt: cameraTilt.current,
                    isMiddleMouseDown: isMiddleMouseDown.current,
                    lastMousePosition: lastMousePosition.current,
                    isHorizontalInverted: false
                  }},
                  camera,
                  lastSentPosition,
                  { current: false },
                  controller // Use the newly created socket controller
                );
                
                playerController.current = playerCtrl;
                console.log("%c ✅ PlayerController manually reinitialized!", "background: #4CAF50; color: white;");
              } catch (err) {
                console.error("Failed to manually reinitialize PlayerController:", err);
              }
            } else {
              console.error("%c ❌ Manual SocketController reinitialization failed!", "background: red; color: white;");
            }
          });
        } else {
          console.error("Cannot reinitialize controllers - missing dependencies", {
            sceneExists: !!scene,
            cameraExists: !!camera,
            playerExists: !!playerRef.current
          });
        }
      }
    };
    
    // Function to handle key up events
    const handleKeyUp = (e: KeyboardEvent) => {
      // Skip if user is typing in an input field
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      
      // Update the keysPressed ref
      keysPressed.current[e.key] = false;
      
      // Also update arrow keys with WASD equivalents to support both
      if (e.key === 'ArrowUp') keysPressed.current['w'] = false;
      if (e.key === 'ArrowDown') keysPressed.current['s'] = false;
      if (e.key === 'ArrowLeft') keysPressed.current['a'] = false;
      if (e.key === 'ArrowRight') keysPressed.current['d'] = false;
    };
    
    // Add event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Log initial key state
    console.log("🎹 Key tracking initialized");
    
    // Remove event listeners on cleanup
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);
  
  // Add diagnostic interval to check socket controller status periodically
  useEffect(() => {
    const checkInterval = setInterval(() => {
      console.log("%c 🔍 PERIODIC SOCKET CHECK", "background: #673AB7; color: white;", {
        socketControllerExists: !!socketControllerRef.current,
        playerControllerExists: !!playerController.current,
        socketState: socketControllerRef.current 
          ? { 
              isConnected: socketControllerRef.current.isConnected(), 
              socketId: socketControllerRef.current.getSocketId() 
            } 
          : 'null',
        time: new Date().toISOString()
      });
      
      // If socket controller is null but all requirements are present, try to reinitialize
      if (!socketControllerRef.current && scene && camera && playerRef.current) {
        console.log("%c 🛠️ AUTO-REINITIALIZING SOCKET CONTROLLER", "background: orange; color: white;");
        
        // Create a new socket controller - use existing refs instead of creating new ones
        const controller = new SocketController({
          scene,
          playerRef,
          playersRef,
          nameLabelsRef, // Use the existing ref
          worldManagerRef,
          itemManagerRef,
          cleanupIntervalRef,
          chatRef, // Use the existing ref
          setPlayerName,
          setIsConnected,
          setCurrentZone,
          createNameLabel: (name, mesh) => {
            const labelDiv = document.createElement('div');
            labelDiv.className = 'name-label';
            labelDiv.textContent = name;
            return new CSS2DObject(labelDiv);
          }
        });
        
        // Initialize and set the socket controller
        controller.initialize().then(success => {
          if (success) {
            socketControllerRef.current = controller;
            console.log("%c ✅ Auto-recovery socket controller initialized!", "background: green; color: white;");
          }
        });
      }
    }, 10000); // Check every 10 seconds
    
    return () => clearInterval(checkInterval);
  }, [scene, camera, playerRef.current, socketControllerRef.current]);
  
  // Clean up when unmounting
  useEffect(() => {
    return () => {
      // Clean up socket controller
      if (socketControllerRef.current) {
        socketControllerRef.current.cleanup();
        socketControllerRef.current = null;
      }
      
      // Clean up resource controller
      if (resourceControllerRef.current) {
        resourceControllerRef.current.cleanup();
        resourceControllerRef.current = null;
      }
      
      // Clean up player controller
      playerController.current = null;
      
      // Clean up player name labels
      if (sceneRef.current) {
        cleanupAllNameLabels(sceneRef.current, nameLabelsRef);
      }
    };
  }, []); // Empty dependency array = run only on mount/unmount
  
  // Handle player following
  const handleFollowPlayer = (targetPlayerId: string) => {
    const targetMesh = playersRef.current.get(targetPlayerId);
    if (targetMesh && playerController.current) {
      // Move the player to start following the target
      playerController.current.moveToPosition(targetMesh.position.clone());
      
      // TODO: Implement proper following behavior that continues to follow as the target moves
      console.log(`Now following player ${targetPlayerId}`);
    }
  };
  
  // Handle player messaging
  const handleMessagePlayer = (targetPlayerId: string) => {
    // Open chat and focus it with @playerId prefix
    if (chatRef.current) {
      const targetMesh = playersRef.current.get(targetPlayerId);
      const playerName = targetMesh?.userData.nameTag?.userData.playerName || `Player-${targetPlayerId}`;
      chatRef.current.openChatWithTarget(`@${playerName} `);
    }
  };
  
  // Check for first-time players when component mounts
  useEffect(() => {
    // Check local storage to see if user has completed tutorial
    const tutorialCompleted = localStorage.getItem('miniscape_tutorial_completed');
    
    if (!tutorialCompleted) {
      // Show tutorial for first-time players after a short delay
      const tutorialTimeout = setTimeout(() => {
        setShowTutorial(true);
      }, 2000); // Delay the tutorial to let the game load first
      
      return () => {
        clearTimeout(tutorialTimeout);
      };
    } else {
      tutorialCompletedRef.current = true;
    }
  }, []);
  
  // Handle tutorial completion
  const handleTutorialComplete = () => {
    setShowTutorial(false);
    tutorialCompletedRef.current = true;
    
    // Save to local storage so we don't show the tutorial again
    localStorage.setItem('miniscape_tutorial_completed', 'true');
    
    // Possibly teleport the player to the tutorial guide in Lumbridge
    if (playerRef.current && playerController.current) {
      playerController.current.moveToPosition(new THREE.Vector3(10, 0, 10));
    }
  };
  
  // Handle tutorial skip
  const handleTutorialSkip = () => {
    setShowTutorial(false);
    tutorialCompletedRef.current = true;
    
    // Still save to local storage even if skipped
    localStorage.setItem('miniscape_tutorial_completed', 'true');
  };
  
  // --- Check and create return portal ---
  useEffect(() => {
    const worldManager = worldManagerRef.current;
    if (scene && worldManager && (window as any).shouldCreateReturnPortal) {
      const refUrl = (window as any).returnPortalDestination;
      if (refUrl) {
        console.log("Creating return portal to:", refUrl);
        
        // Ensure the URL has a protocol
        let formattedRefUrl = refUrl;
        if (!formattedRefUrl.startsWith('http://') && !formattedRefUrl.startsWith('https://')) {
          console.log('Adding https:// prefix to return portal URL:', formattedRefUrl);
          formattedRefUrl = 'https://' + formattedRefUrl;
        }
        
        // Give a slight delay to ensure the world is fully loaded
        setTimeout(() => {
          // Create a return portal at a position opposite to the main portal
          const returnPortalPos = new THREE.Vector3(35, 0, 45);
          
          // Add the portal using the LandmarkManager
          const landmarkManager = worldManager.getLandmarkManager();
          if (landmarkManager) {
            landmarkManager.addReturnPortal(returnPortalPos, formattedRefUrl);
            
            // Reset the flag to avoid creating multiple portals
            (window as any).shouldCreateReturnPortal = false;
            
            // Display a notification to the player
            const message = "A return portal has been created. Enter it to go back to where you came from.";
            const chatEvent = new CustomEvent('chat-message', {
              detail: { 
                content: message, 
                type: 'system',
                timestamp: Date.now()
              },
              bubbles: true
            });
            document.dispatchEvent(chatEvent);
          }
        }, 1000); // 1 second delay to ensure world is ready
      }
    }
  }, [scene, worldManagerRef.current]);
  
  // --- Render ---
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* Canvas container */}
      <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />

      {/* Data attribute for external position access */}
      <div data-player-position style={{ display: 'none' }}></div>

      {/* Tutorial Overlay */}
      <TutorialOverlay
        isActive={showTutorial}
        onComplete={handleTutorialComplete}
        onSkip={handleTutorialSkip}
      />

      {/* Add NPC Interaction Controller */}
      {worldManagerRef.current && playerRef.current && (
        <NPCInteractionController
          worldManager={worldManagerRef.current}
          playerRef={playerRef}
        />
      )}
      
      {/* Add Player Social Controller */}
      {playerRef.current && (
        <PlayerSocialController
          playerRef={playerRef}
          playersRef={playersRef}
          onPlayerFollow={handleFollowPlayer}
          onPlayerMessage={handleMessagePlayer}
          socketController={socketControllerRef.current}
        />
      )}

      {/* Add Smithing Controller */}
      {playerRef.current && (
        <SmithingController
          playerRef={playerRef}
          isConnected={isConnected}
        />
      )}

      {/* World Context Menu */}
      {contextMenuPos && playerRef.current && (
        <WorldContextMenu
          position={contextMenuPos}
          playerPosition={playerRef.current.position}
          nearbyItems={nearbyItems}
          nearbyResources={nearbyResources}
          onClose={closeContextMenu}
          onPickupItem={handlePickupItemFromMenu}
          onInteractWithResource={handleResourceInteraction}
        />
      )}

      {/* UI Overlays */}
      <ZoneIndicator currentZone={currentZone} />
      <FPSCounter fps={currentFps} />

      <TabMenu
        tabs={[
          {
            icon: <span style={{ fontSize: '16px' }}>🎒</span>,
            label: `Inventory`,
            badge: inventory.length > 0 ? `${inventory.length}/24` : undefined,
            content: (
              <InventoryPanel 
                ref={inventoryPanelRef}
                itemManager={itemManagerRef.current || undefined}
              />
            )
          },
          {
            icon: <span style={{ fontSize: '16px' }}>📊</span>,
            label: "Skills",
            content: (
              <SkillsPanel
                visible={true}
                onClose={() => {}} // This will be handled by TabMenu
              />
            )
          },
          {
            icon: <span style={{ fontSize: '16px' }}>⚙️</span>,
            label: "Settings",
            content: (
              <GameSettings
                playerName={playerName}
                setPlayerName={setPlayerName}
                soundEnabled={soundEnabled}
                setSoundEnabled={setSoundEnabled}
                isHorizontalInverted={isHorizontalInverted}
                setIsHorizontalInverted={setIsHorizontalInverted}
                isHorizontalInvertedRef={isHorizontalInvertedRef}
              />
            )
          }
        ]}
      />
      
      <GameChat
        sceneRef={sceneRef}
        playerRef={playerRef}
        playersRef={playersRef}
      />

      <ConnectionStatusIndicator 
        isConnected={isConnected} 
        playerCount={playerCount}
      />

      {/* Vibe Jam 2025 Link */}
      <a target="_blank" href="https://jam.pieter.com" style={{
        fontFamily: 'system-ui, sans-serif', 
        position: 'fixed', 
        bottom: '-1px', 
        right: '-1px', 
        padding: '7px', 
        fontSize: '14px', 
        fontWeight: 'bold', 
        background: '#fff', 
        color: '#000', 
        textDecoration: 'none', 
        zIndex: 10000, 
        borderTopLeftRadius: '12px',
        border: '1px solid #fff'
      }}>
        🕹️ Vibe Jam 2025
      </a>

      {/* X/Twitter Link */}
      <a target="_blank" href="https://x.com/thejakekay" style={{
        fontFamily: 'system-ui, sans-serif', 
        position: 'fixed', 
        bottom: '155px', 
        right: '-1px', 
        padding: '8px 12px', 
        fontSize: '14px', 
        fontWeight: 'bold', 
        background: 'linear-gradient(45deg, #000000, #333333)', 
        color: '#fff', 
        textDecoration: 'none', 
        zIndex: 10000, 
        borderTopLeftRadius: '20px',
        borderBottomLeftRadius: '20px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'transform 0.2s, box-shadow 0.2s',
        transform: 'translateZ(0)',
      }}>
        <span style={{ fontSize: '16px' }}>𝕏</span> Add me on X @thejakekay
      </a>

      {/* WriteZero.ai Link */}
      <a target="_blank" href="https://writezero.ai" style={{
        fontFamily: 'system-ui, sans-serif', 
        position: 'fixed', 
        bottom: '105px', 
        right: '-1px', 
        padding: '8px 12px', 
        fontSize: '14px', 
        fontWeight: 'bold', 
        background: 'linear-gradient(45deg, #3b82f6, #2dd4bf)', 
        color: '#fff', 
        textDecoration: 'none', 
        zIndex: 10000, 
        borderTopLeftRadius: '20px',
        borderBottomLeftRadius: '20px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'transform 0.2s, box-shadow 0.2s',
        transform: 'translateZ(0)',
      }}>
        <span style={{ fontSize: '16px' }}>✍️</span> Create Content - WriteZero.ai
      </a>

      {/* WorkZero.ai Link */}
      <a target="_blank" href="https://workzero.ai" style={{
        fontFamily: 'system-ui, sans-serif', 
        position: 'fixed', 
        bottom: '55px', 
        right: '-1px', 
        padding: '8px 12px', 
        fontSize: '14px', 
        fontWeight: 'bold', 
        background: 'linear-gradient(45deg, #8b5cf6, #ec4899)', 
        color: '#fff', 
        textDecoration: 'none', 
        zIndex: 10000, 
        borderTopLeftRadius: '20px',
        borderBottomLeftRadius: '20px',
        border: '1px solid rgba(255, 255, 255, 0.1)',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        transition: 'transform 0.2s, box-shadow 0.2s',
        transform: 'translateZ(0)',
      }}>
        <span style={{ fontSize: '16px' }}>🤖</span> Leverage AI for your business.
      </a>
    </div>
  );
};

export default GameCanvas;