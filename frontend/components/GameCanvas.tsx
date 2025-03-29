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
import { Player, PlayerPosition } from '../types/player';
import InventoryPanel from './ui/InventoryPanel';
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
  
  // Settings state moved to GameSettings component
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
  
  // Add a ref to track the last time we cached position
  const lastPositionCacheTime = useRef(0);
  
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
  const { isConnected: networkConnected, playerName: networkPlayerName, reconnect, sendPositionUpdate } = useNetworkSync({
    playerRef,
    playersRef,
    nameLabelsRef,
    worldManagerRef,
    itemManagerRef,
    sceneRef,
    setPlayerNameState: setPlayerName,
  });

  // Sync player name from network
  useEffect(() => {
    if (networkPlayerName && networkPlayerName !== playerName) {
      setPlayerName(networkPlayerName);
    }
  }, [networkPlayerName, playerName]);

  // 6. Interaction Handling
  const { handleMouseClick } = useInteraction({
    sceneRef,
    cameraRef,
    resourceNodesRef,
    worldItemsRef,
    canvasRef,
  });

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
    };
  }, [scene]);

  // --- Initialize Local Player ---
  useEffect(() => {
    if (scene && !playerRef.current) {
      console.log("Creating local player mesh...");
      const mesh = createPlayerMesh();

      // Try to restore position immediately if available
      const cachedPosition = getLastKnownPosition();
      if (cachedPosition) {
        const distSq = (cachedPosition.x - mesh.position.x)**2 + (cachedPosition.z - mesh.position.z)**2;
        if(distSq > 0.1) {
          console.log("Applying cached position on player creation:", cachedPosition);
          mesh.position.set(cachedPosition.x, cachedPosition.y, cachedPosition.z);
        }
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
      const targetData = playerMesh.userData.targetPosition;
      if (!targetData) return;

      const current = playerMesh.position;
      const target = new THREE.Vector3(targetData.x, targetData.y, targetData.z);

      // --- Snap Logic ---
      const distanceSq = current.distanceToSquared(target);
      if (distanceSq > POSITION_SNAP_THRESHOLD * POSITION_SNAP_THRESHOLD) {
        console.log(`Snapping player ${playerId} due to large distance: ${Math.sqrt(distanceSq).toFixed(2)}`);
        playerMesh.position.copy(target);
        playerMesh.userData.serverVelocity = null;
        return;
      }

      // --- Interpolation ---
      const interpVector = target.clone().sub(current).multiplyScalar(INTERPOLATION_SPEED);
      playerMesh.position.add(interpVector);

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
      }

      // --- Final Snap ---
      if (playerMesh.position.distanceToSquared(target) < 0.0004) {
        playerMesh.position.copy(target);
      }
    });
  }, []);

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
  });

  // --- Global Click Listener ---
  useEffect(() => {
    const currentRenderer = renderer;
    if (currentRenderer) {
      currentRenderer.domElement.addEventListener('click', handleMouseClick);
      console.log("Attached interaction click listener.");
    }
    return () => {
      if (currentRenderer) {
        currentRenderer.domElement.removeEventListener('click', handleMouseClick);
        console.log("Removed interaction click listener.");
      }
    };
  }, [renderer, handleMouseClick]);

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

  // --- Render ---
  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden' }}>
      {/* Canvas container */}
      <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />

      {/* Data attribute for external position access */}
      <div data-player-position style={{ display: 'none' }}></div>

      {/* UI Overlays */}
      <ZoneIndicator currentZone={currentZone} />
      <ConnectionStatusIndicator isConnected={isConnected} />

      {!isConnected && (
        <button
          onClick={reconnect}
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

      <GameSettings
        playerName={playerName}
        setPlayerName={setPlayerName}
        soundEnabled={soundEnabled}
        setSoundEnabled={setSoundEnabled}
        isHorizontalInverted={isHorizontalInverted}
        setIsHorizontalInverted={setIsHorizontalInverted}
        isHorizontalInvertedRef={isHorizontalInvertedRef}
      />
      
      <GameChat
        sceneRef={sceneRef}
        playerRef={playerRef}
        playersRef={playersRef}
      />

      <InventoryPanel 
        style={{ top: "100px", right: "20px" }} 
        itemManager={itemManagerRef.current || undefined}
      />
    </div>
  );
};

export default GameCanvas;