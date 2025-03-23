import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';
import { Sky } from 'three/examples/jsm/objects/Sky.js';
import { Water } from 'three/examples/jsm/objects/Water.js';
import { 
  initializeSocket, 
  disconnectSocket, 
  getSocket, 
  isSocketReady, 
  getSocketStatus, 
  cachePlayerPosition, 
  getCachedPlayerPosition 
} from '../game/network/socket';
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
import '../styles/GameCanvas.css';
// Add imports for new components
import PlayerController from './game/PlayerController';
import RemotePlayerManager, { RemotePlayerManagerInterface } from './game/RemotePlayerManager';
import WorldResourceManager, { WorldResourceManagerInterface } from './game/WorldResourceManager';
import ChatBubbleManager, { ChatBubbleManagerInterface } from './game/ChatBubbleManager';
import CameraManager from './game/CameraManager';

// Player movement speed
const MOVEMENT_SPEED = 0.02; // Reduced from 0.0375 (nearly 50% reduction again)
// Define a constant speed factor to prevent accumulation
const FIXED_SPEED_FACTOR = 0.02; // Reduced from 0.0375
// Network settings
const SEND_INTERVAL = 20; // Reduced from 30ms to 20ms for more frequent updates
// Position interpolation settings
const INTERPOLATION_SPEED = 0.4; // Increased from 0.3 for faster position syncing
// World boundaries
const WORLD_BOUNDS = {
  minX: -50, 
  maxX: 50,
  minZ: -50,
  maxZ: 50
};

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
  // Add camera and renderer refs
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  // Add ref for zone update debouncing
  const zoneUpdateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Add a ref to store socket instance for use across functions
  const socketRef = useRef<any>(null);
  // Add ref to track our own socket ID
  const mySocketIdRef = useRef<string>('');
  
  // Add a ref for cleanup functions so they can be accessed outside useEffect
  const cleanupFunctionsRef = useRef<{
    initialCleanup?: () => void;
    cleanupPlayerMeshes?: () => void;
  }>({});
  
  const [playerName, setPlayerName] = useState<string>('');
  const [isConnected, setIsConnected] = useState<boolean>(false); // Set initial state to true to allow movement
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
    ArrowRight: false,
    ' ': false // for jumping
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
  
  // Game references
  const chatBubblesRef = useRef<Map<string, { object: CSS2DObject, expiry: number, message?: string }>>(new Map());
  
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
  
  // Keep inversion setting in sync with ref
  useEffect(() => {
    isHorizontalInvertedRef.current = isHorizontalInverted;
  }, [isHorizontalInverted]);
  
  // Add references to the manager interfaces
  const remotePlayerManagerRef = useRef<RemotePlayerManagerInterface | null>(null);
  const worldResourceManagerRef = useRef<WorldResourceManagerInterface | null>(null);
  const chatBubbleManagerRef = useRef<ChatBubbleManagerInterface | null>(null);
  const playerControllerRef = useRef<any>(null);
  
  // Limit how often we log player controller warnings to avoid console spam
  const lastControllerWarningTime = useRef(0);
  
  // For holding game state 
  const [controllerStatus, setControllerStatus] = useState<string>('Initializing');
  
  // Add this near the other state variables at the top of the component
  const [cameraSettings, setCameraSettings] = useState({
    height: 5,
    distance: 8
  });
  
  // Main initialization in useEffect
  useEffect(() => {
    if (!canvasRef.current) return;
    
    // Make this an async function so we can await properly
    const initializeGameScene = async () => {
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
      // Store camera in ref
      cameraRef.current = camera;
      
      // Create renderer
      const renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.setClearColor(new THREE.Color('#87CEEB')); // Sky blue color
      // Store renderer in ref
      rendererRef.current = renderer;
      
      // Create CSS2D renderer for name labels
      const labelRenderer = new CSS2DRenderer();
      labelRenderer.setSize(window.innerWidth, window.innerHeight);
      labelRenderer.domElement.style.position = 'absolute';
      labelRenderer.domElement.style.top = '0';
      labelRenderer.domElement.style.pointerEvents = 'none';
      canvasRef.current!.appendChild(labelRenderer.domElement);
      labelRendererRef.current = labelRenderer;
      
      // Append canvas to DOM
      canvasRef.current!.appendChild(renderer.domElement);
      
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
      
      // Add boundary visualizers for debugging
      const createBoundaryMarkers = () => {
        // Use a bright color for visibility
        const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
        const markerGeometry = new THREE.SphereGeometry(0.5);
        
        // Place markers at corners and midpoints of the world boundaries
        const boundaryPoints = [
          // Corners
          { x: WORLD_BOUNDS.minX, z: WORLD_BOUNDS.minZ },
          { x: WORLD_BOUNDS.minX, z: WORLD_BOUNDS.maxZ },
          { x: WORLD_BOUNDS.maxX, z: WORLD_BOUNDS.minZ },
          { x: WORLD_BOUNDS.maxX, z: WORLD_BOUNDS.maxZ },
          // Midpoints of edges
          { x: WORLD_BOUNDS.minX, z: 0 },
          { x: WORLD_BOUNDS.maxX, z: 0 },
          { x: 0, z: WORLD_BOUNDS.minZ },
          { x: 0, z: WORLD_BOUNDS.maxZ },
        ];
        
        // Create and add markers to scene
        boundaryPoints.forEach(point => {
          const marker = new THREE.Mesh(markerGeometry, markerMaterial);
          marker.position.set(point.x, 1, point.z); // Position at y=1 to be visible above ground
          scene.add(marker);
        });
        
        // Create visible lines along the boundaries
        const lineGeometry = new THREE.BufferGeometry();
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
        
        // Define the outline of the world boundary box (on ground level)
        const linePoints = [
          // Bottom square
          new THREE.Vector3(WORLD_BOUNDS.minX, 0.1, WORLD_BOUNDS.minZ),
          new THREE.Vector3(WORLD_BOUNDS.maxX, 0.1, WORLD_BOUNDS.minZ),
          new THREE.Vector3(WORLD_BOUNDS.maxX, 0.1, WORLD_BOUNDS.maxZ),
          new THREE.Vector3(WORLD_BOUNDS.minX, 0.1, WORLD_BOUNDS.maxZ),
          new THREE.Vector3(WORLD_BOUNDS.minX, 0.1, WORLD_BOUNDS.minZ)
        ];
        
        lineGeometry.setFromPoints(linePoints);
        const boundaryLine = new THREE.Line(lineGeometry, lineMaterial);
        scene.add(boundaryLine);
        
        
      };
      
      // Enable boundary markers for debugging
      // Comment out in production if not needed
      createBoundaryMarkers();
      
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
      
      // Store the function in ref for use across the codebase
      createNameLabelRef.current = createNameLabel;
      
      // Setup socket event listeners - make this function async
      const setupSocketListeners = async () => {
        const socket = await getSocket();
        if (!socket) return;
        
        // Store socket in ref for use in other functions
        socketRef.current = socket;
        // Store our own socket ID for reference
        mySocketIdRef.current = socket.id || '';
        
        // Function to create a player mesh
        const createPlayerMesh = (player: Player) => {
          // First check if this is the player's own character
          if (socket.id === player.id) {
            
            return null;
          }
          
          // Find any existing meshes for this player to ensure proper cleanup
          const existingMeshes: THREE.Object3D[] = [];
          
          // Check in playersRef first
          if (playersRef.current.has(player.id)) {
            const knownMesh = playersRef.current.get(player.id);
            if (knownMesh) {
              existingMeshes.push(knownMesh);
            }
          }
          
          // Also search the entire scene for duplicates
          scene.traverse((object) => {
            if (object.userData && object.userData.playerId === player.id) {
              // Only add to our list if not already in existingMeshes
              if (!existingMeshes.includes(object)) {
                existingMeshes.push(object);
              }
            }
          });
          
          // Clean up all existing meshes for this player
          existingMeshes.forEach(mesh => {
            // First remove any CSS2DObjects
            mesh.traverse((child) => {
              if ((child as any).isCSS2DObject) {
                if (child.parent) {
                  child.parent.remove(child);
                }
                scene.remove(child);
              }
            });
            
            // Clean up any object data
            if ((mesh as THREE.Mesh).geometry) {
              (mesh as THREE.Mesh).geometry.dispose();
            }
            
            // Clean up materials
            if ((mesh as THREE.Mesh).material) {
              if (Array.isArray((mesh as THREE.Mesh).material)) {
                ((mesh as THREE.Mesh).material as THREE.Material[]).forEach((material: THREE.Material) => material.dispose());
              } else {
                ((mesh as THREE.Mesh).material as THREE.Material).dispose();
              }
            }
            
            // Remove from scene
            scene.remove(mesh);
          });
          
          // Remove from our tracking references
          playersRef.current.delete(player.id);
              
          // Remove from name labels ref
          if (nameLabelsRef.current.has(player.id)) {
            const label = nameLabelsRef.current.get(player.id);
            if (label) {
              if (label.parent) {
                label.parent.remove(label);
              }
              scene.remove(label);
              nameLabelsRef.current.delete(player.id);
            }
          }
          
          // Create new player mesh
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
          otherPlayerMesh.userData.targetPosition = new THREE.Vector3(player.x, player.y, player.z);
          otherPlayerMesh.userData.lastUpdateTime = Date.now();
          
          // Set disappearance timeout - if we don't hear from this player for 30 seconds, mark for cleanup
          otherPlayerMesh.userData.disappearanceTimeout = setTimeout(() => {
            otherPlayerMesh.userData.markedForCleanup = true;
          }, 30000);
          
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
          
          
          // Run cleanup to remove any potential duplicates before adding new players
          cleanupPlayerMeshes();
          
          // Store the player's own ID when receiving initial players
          // This helps differentiate the local player from others
          if (!socket.id) {
            console.warn('Socket ID not available when initializing players');
          } else {
            // Set player name from the player data if it exists
            const ownPlayerData = players.find(p => p.id === socket.id);
            if (ownPlayerData) {
              setPlayerName(ownPlayerData.name);
            }
          }
          
          // Add each existing player to the scene
          players.forEach(player => {
            // Skip creating a mesh for the current player to avoid duplication
            if (player.id === socket.id) {
              
              // Position the local player at their saved position
              if (playerRef.current) {
                playerRef.current.position.set(player.x, player.y, player.z);
                
                // Store player data in userData
                playerRef.current.userData.playerId = player.id;
                playerRef.current.userData.playerName = player.name;
              }
              return;
            }
            
            
            createPlayerMesh(player);
          });
        });
        
        // Handle new player joins
        socket.on('playerJoined', (player) => {
          
          
          // Play sound for new player joining
          soundManager.play('playerJoin');
          
          // Check if this is the local player (shouldn't happen but as a safety measure)
          if (player.id === mySocketIdRef.current) {
            
            
            // Update local player position instead of creating a new mesh
            if (playerRef.current) {
              playerRef.current.position.set(player.x, player.y, player.z);
              
              // Ensure player name is set
              setPlayerName(player.name);
              
              // Update player data in userData
              playerRef.current.userData.playerId = player.id;
              playerRef.current.userData.playerName = player.name;
            }
            return;
          }
          
          // Check if we already have this player in our map and remove it first
          if (playersRef.current.has(player.id)) {
            
            const existingMesh = playersRef.current.get(player.id);
            if (existingMesh) {
              // SAFER APPROACH: Instead of using traverse which is causing "children[i] is undefined" error
              // We'll directly check for children that have isCSS2DObject flag
              try {
                // Create a copy of children array to safely iterate
                const childrenToRemove: THREE.Object3D[] = [];
                
                // Only process children if they exist
                if (existingMesh.children && existingMesh.children.length > 0) {
                  for (let i = 0; i < existingMesh.children.length; i++) {
                    const child = existingMesh.children[i];
                    if (child && (child as any).isCSS2DObject) {
                      childrenToRemove.push(child);
                    }
                  }
                  
                  // Remove children outside the loop
                  childrenToRemove.forEach(child => {
                    if (child.parent) {
                      child.parent.remove(child);
                    }
                    scene.remove(child);
                  });
                }
              } catch (e) {
                console.error("Error while cleaning up player CSS2DObjects:", e);
              }
              
              // Clean up resources
              if ((existingMesh as THREE.Mesh).geometry) {
                (existingMesh as THREE.Mesh).geometry.dispose();
              }
              if ((existingMesh as THREE.Mesh).material) {
                if (Array.isArray((existingMesh as THREE.Mesh).material)) {
                  ((existingMesh as THREE.Mesh).material as THREE.Material[]).forEach(m => m.dispose());
                } else {
                  ((existingMesh as THREE.Mesh).material as THREE.Material).dispose();
                }
              }
              
              // Remove from scene
              scene.remove(existingMesh);
              playersRef.current.delete(player.id);
            }
          }
          
          // Always use createPlayerMesh which handles existing players properly
          const createdMesh = createPlayerMesh(player);

          // Force recreation of chat bubbles for this player if any exist
          // This ensures chat bubbles are properly attached to the new player mesh
          chatBubblesRef.current.forEach((bubble, bubblePlayerId) => {
            if (bubblePlayerId === player.id && createdMesh) {
              
              // Get the message from the bubble
              const message = bubble.message || '';
              
              // Remove old bubble
              if (bubble.object) {
                if (bubble.object.parent) {
                  bubble.object.parent.remove(bubble.object);
                }
                scene.remove(bubble.object);
              }
              
              // Create new bubble on the new mesh
              if (chatBubbleManagerRef.current) {
                chatBubbleManagerRef.current.createChatBubble(player.id, message, createdMesh);
              }
            }
          });
        });
        
        // Handle player disconnects
        socket.on('playerLeft', (playerId) => {
          
          
          // Skip if this is the local player ID (we shouldn't remove ourselves)
          if (playerId === socket.id) {
            console.warn('Received playerLeft for local player, ignoring');
            return;
          }
          
          // First, remove any name label from our tracking map and the scene
          if (nameLabelsRef.current.has(playerId)) {
            const label = nameLabelsRef.current.get(playerId);
            if (label) {
              // Remove from parent if it has one
              if (label.parent) {
                label.parent.remove(label);
              }
              // Also remove from scene directly to be sure
              scene.remove(label);
            }
            // Remove from our map
            nameLabelsRef.current.delete(playerId);
          }
          
          // Remove player mesh from scene
          const playerMesh = playersRef.current.get(playerId);
          if (playerMesh) {
            // First remove any attached CSS2DObjects directly
            const childrenToRemove: THREE.Object3D[] = [];
            
            try {
              // Only process children if they exist
              if (playerMesh.children && playerMesh.children.length > 0) {
                for (let i = 0; i < playerMesh.children.length; i++) {
                  const child = playerMesh.children[i];
                  if (child && (child as any).isCSS2DObject) {
                    childrenToRemove.push(child);
                  }
                }
              }
            } catch (e) {
              console.error("Error while finding CSS2DObjects to remove:", e);
            }
            
            // Remove the children outside the traversal
            childrenToRemove.forEach(child => {
              if (child.parent) {
                child.parent.remove(child);
              }
              scene.remove(child);
            });
            
            // Clean up any object data
            if (playerMesh.geometry) playerMesh.geometry.dispose();
            if (Array.isArray(playerMesh.material)) {
              playerMesh.material.forEach(material => material.dispose());
            } else if (playerMesh.material) {
              playerMesh.material.dispose();
            }
            
            // Remove from scene
            scene.remove(playerMesh);
            playersRef.current.delete(playerId);
          }
          
          // Additional safety check - look for any orphaned labels in the scene
          scene.traverse((object) => {
            if ((object as any).isCSS2DObject && 
                object.userData && 
                object.userData.forPlayer === playerId) {
              if (object.parent) {
                object.parent.remove(object);
              }
              scene.remove(object);
            }
          });
        });
        
        // Handle player sync request from server - compare local tracking to server's list of player IDs
        socket.on('checkPlayersSync', (playerIds, callback) => {
          // Find players that we're missing locally (on server but not tracked locally)
          const missingPlayerIds = playerIds.filter(id => !playersRef.current.has(id));
          
          
          
          // Send back the list of missing players
          callback(missingPlayerIds);
        });
        
        // Handle player movements
        socket.on('playerMoved', (data: PlayerMoveData) => {
          
          // Skip if this is our own player ID - we shouldn't move ourselves based on server events
          // This is a fallback in case we broadcast to all instead of socket.broadcast
          if (data.id === socket.id || data.id === 'TEST-' + socket.id) {
            
            return;
          }
          
          // Update the position of the moved player
          const playerMesh = playersRef.current.get(data.id);
          if (playerMesh) {
            // Ensure received positions are within bounds before applying
            const validX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, data.x));
            const validZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, data.z));
            
            // Get the server timestamp or use current time
            const serverTime = data.timestamp || Date.now();
            
            // Calculate network latency if timestamp is provided
            let estimatedLatency = 0;
            if (data.timestamp) {
              estimatedLatency = Date.now() - data.timestamp;
              // Cap latency compensation to reasonable values
              estimatedLatency = Math.min(estimatedLatency, 200);
            }
            
            // Store previous target for velocity calculation if we don't have it
            if (!playerMesh.userData.prevTargetPosition) {
              playerMesh.userData.prevTargetPosition = playerMesh.userData.targetPosition 
                ? playerMesh.userData.targetPosition.clone() 
                : new THREE.Vector3(validX, data.y, validZ);
              playerMesh.userData.prevTargetTime = playerMesh.userData.lastUpdateTime || Date.now() - 100;
            }
            
            const newTargetPosition = new THREE.Vector3(validX, data.y, validZ);
            
            // Calculate distance to current position to detect large discrepancies
            const currentPosition = playerMesh.position;
            const distanceToTarget = currentPosition.distanceTo(newTargetPosition);
            
            // If the discrepancy is too large, snap immediately to avoid visible "teleporting"
            if (distanceToTarget > POSITION_SNAP_THRESHOLD) {
              
              playerMesh.position.copy(newTargetPosition);
              
              // Also reset velocity for a fresh start
              playerMesh.userData.velocity = { x: 0, z: 0 };
            }
            
            // Set target position for interpolation
            playerMesh.userData.targetPosition = newTargetPosition;
            playerMesh.userData.lastUpdateTime = Date.now();
            
            // Store previous target for next velocity calculation
            if (playerMesh.userData.prevTargetPosition) {
              const prevTarget = playerMesh.userData.prevTargetPosition;
              const timeDelta = (Date.now() - playerMesh.userData.prevTargetTime) / 1000;
              
              if (timeDelta > 0) {
                // Calculate and store velocity based on target positions (not actual positions)
                // This is more accurate for prediction
                playerMesh.userData.serverVelocity = {
                  x: (newTargetPosition.x - prevTarget.x) / timeDelta,
                  z: (newTargetPosition.z - prevTarget.z) / timeDelta
                };
                
                // Update previous target data
                playerMesh.userData.prevTargetPosition = newTargetPosition.clone();
                playerMesh.userData.prevTargetTime = Date.now();
              }
            }
            
            // Reset disappearance timer whenever we get a position update
            if (playerMesh.userData.disappearanceTimeout) {
              clearTimeout(playerMesh.userData.disappearanceTimeout);
            }
            
            // Set a new disappearance timeout - if we don't hear from this player for 30 seconds,
            // we'll mark them for cleanup
            playerMesh.userData.disappearanceTimeout = setTimeout(() => {
              playerMesh.userData.markedForCleanup = true;
            }, 30000);
          } else {
            console.warn(`Could not find player mesh for ID: ${data.id}. Attempting to create it.`);
            
            // This case can happen if we receive a playerMoved event before playerJoined
            // Try to fetch the player from the server to create the mesh
            socket.emit('getPlayerData', data.id, (playerData) => {
              if (playerData) {
                
                const createdMesh = createPlayerMesh(playerData);
                
                // Set initial target position for the newly created player
                if (createdMesh) {
                  createdMesh.userData.targetPosition = new THREE.Vector3(data.x, data.y, data.z);
                  createdMesh.userData.lastUpdateTime = Date.now();
                  
                  // Set disappearance timeout
                  createdMesh.userData.disappearanceTimeout = setTimeout(() => {
                    createdMesh.userData.markedForCleanup = true;
                  }, 30000);
                }
              } else {
                // If server doesn't respond with player data, create a minimal player object
                const minimalPlayer = {
                  id: data.id,
                  name: `Player-${data.id.substring(0, 4)}`,
                  x: data.x,
                  y: data.y,
                  z: data.z,
                  userId: ''
                };
                
                const createdMesh = createPlayerMesh(minimalPlayer);
                
                // Set initial target position for the newly created player
                if (createdMesh) {
                  createdMesh.userData.targetPosition = new THREE.Vector3(data.x, data.y, data.z);
                  createdMesh.userData.lastUpdateTime = Date.now();
                  
                  // Set disappearance timeout
                  createdMesh.userData.disappearanceTimeout = setTimeout(() => {
                    createdMesh.userData.markedForCleanup = true;
                  }, 30000);
                }
              }
            });
          }
        });
        
        // Handle item drops in the world
        socket.on('itemDropped', (data) => {
          
          
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
        
        // Before setting up the chatMessage handler, add logging
        
        
        // Remove any existing chatMessage listeners to prevent duplicates
        socket.off('chatMessage'); 
        
        // Listen for chat messages
        socket.on('chatMessage', (message: { 
          name: string; 
          text: string; 
          playerId: string; 
          timestamp: number;
        }) => {
          
          
          try {
            // Check if this is our own message
            const isOwnMessage = message.playerId === mySocketIdRef.current;
            
            if (isOwnMessage) {
              
              if (playerRef.current) {
                if (chatBubbleManagerRef.current) {
                  chatBubbleManagerRef.current.createChatBubble(message.playerId, message.text, playerRef.current);
                }
              } else {
                console.warn('Cannot create chat bubble for own message - playerRef.current is null');
              }
            } else {
              // This is another player's message
              
              
              // Make multiple attempts to find the player mesh if needed
              // Sometimes the player mesh might not be immediately available
              let attempts = 0;
              const maxAttempts = 10; // Increased from 3 to 10 attempts
              
              const tryCreateBubble = () => {
                if (playersRef.current.has(message.playerId)) {
                  const playerMesh = playersRef.current.get(message.playerId);
                  if (playerMesh) {
                    
                    if (chatBubbleManagerRef.current) {
                      chatBubbleManagerRef.current.createChatBubble(message.playerId, message.text, playerMesh);
                    }
                    return true;
                  } else {
                    console.warn(`Player ${message.playerId} exists in playersRef but mesh is null`);
                  }
                } else {
                  
                  // Debug: log all tracked players
                  if (attempts === 0) {
                    
                  }
                  
                  // FALLBACK: Try finding the player mesh in the scene directly
                  // Sometimes the mesh might be in the scene but not in our tracking map
                  let scenePlayerMesh: THREE.Mesh | null = null;
                  
                  scene.traverse((object) => {
                    if (object.userData && object.userData.playerId === message.playerId && object.type === 'Mesh') {
                      scenePlayerMesh = object as THREE.Mesh;
                      
                    }
                  });
                  
                  if (scenePlayerMesh) {
                    
                    // Add it to our tracking map to avoid future lookup issues
                    playersRef.current.set(message.playerId, scenePlayerMesh);
                    if (chatBubbleManagerRef.current) {
                      chatBubbleManagerRef.current.createChatBubble(message.playerId, message.text, scenePlayerMesh);
                    }
                    return true;
                  }
                }
                return false;
              };
              
              // Try immediately first
              if (!tryCreateBubble()) {
                // If the player mesh isn't available immediately, try a few more times with delays
                const retryInterval = setInterval(() => {
                  attempts++;
                  
                  
                  if (tryCreateBubble() || attempts >= maxAttempts) {
                    clearInterval(retryInterval);
                    if (attempts >= maxAttempts) {
                      console.warn(`Failed to create chat bubble for player ${message.playerId} after ${maxAttempts} attempts`);
                      
                      // FALLBACK: Try to request player data and create a temporary mesh if needed
                      // This is a last resort when the player mesh isn't available after all retries
                      socketRef.current.emit('getPlayerData', message.playerId, (playerData: Player | null) => {
                        if (playerData) {
                          
                          
                          // Create a minimal player mesh just for displaying the chat bubble
                          const tempGeometry = new THREE.BoxGeometry(1, 2, 1);
                          const tempMaterial = new THREE.MeshStandardMaterial({ 
                            color: 0xff5722,
                            transparent: true,
                            opacity: 0.7, // Semi-transparent to indicate it's temporary
                          });
                          const tempMesh = new THREE.Mesh(tempGeometry, tempMaterial);
                          
                          // Position it at the player's last known position
                          tempMesh.position.set(playerData.x, playerData.y, playerData.z);
                          
                          // Set userData to identify it
                          tempMesh.userData.playerId = playerData.id;
                          tempMesh.userData.playerName = playerData.name;
                          tempMesh.userData.isTemporary = true;
                          
                          // Add to scene but not to playersRef to avoid conflicts
                          scene.add(tempMesh);
                          
                          // Create the chat bubble on this temporary mesh
                          const bubble = chatBubbleManagerRef.current?.createChatBubble(message.playerId, message.text, tempMesh);
                          
                          // Add a name label to the temporary mesh to make it more identifiable
                          createNameLabel(playerData.name, tempMesh);
                          
                          // Set up auto-cleanup after the bubble expires
                          setTimeout(() => {
                            scene.remove(tempMesh);
                            if (tempMesh.geometry) tempMesh.geometry.dispose();
                            if (tempMesh.material) {
                              if (Array.isArray(tempMesh.material)) {
                                tempMesh.material.forEach(m => m.dispose());
                              } else {
                                tempMesh.material.dispose();
                              }
                            }
                          }, 12000); // Slightly longer than bubble lifetime
                        } else {
                          console.error(`Could not get player data for ${message.playerId} from server`);
                        }
                      });
                    }
                  }
                }, 500); // Increased from 300ms to 500ms for more spacing between attempts
              }
            }
          } catch (error) {
            console.error('Error creating chat bubble:', error);
          }
        });
        
        
        
        // Add a function to perform thorough player mesh cleanup to prevent duplicates
        const cleanupPlayerMeshes = () => {
          
          
          // Helper function to remove a player object and clean up resources
          const removePlayerObject = (object: THREE.Object3D) => {
            // Remove any CSS2DObjects first
            try {
              const childrenToRemove: THREE.Object3D[] = [];
              
              // Only process children if they exist
              if (object.children && object.children.length > 0) {
                for (let i = 0; i < object.children.length; i++) {
                  const child = object.children[i];
                  if (child && (child as any).isCSS2DObject) {
                    childrenToRemove.push(child);
                  }
                }
                
                // Remove children outside the loop
                childrenToRemove.forEach(child => {
                  if (child.parent) {
                    child.parent.remove(child);
                  }
                  scene.remove(child);
                });
              }
            } catch (e) {
              console.error("Error while cleaning up CSS2DObjects:", e);
            }
            
            // Clean up geometry and materials if it's a mesh
            if ((object as THREE.Mesh).geometry) {
              (object as THREE.Mesh).geometry.dispose();
            }
            if ((object as THREE.Mesh).material) {
              if (Array.isArray((object as THREE.Mesh).material)) {
                ((object as THREE.Mesh).material as THREE.Material[]).forEach(
                  (material: THREE.Material) => material.dispose()
                );
              } else {
                ((object as THREE.Mesh).material as THREE.Material).dispose();
              }
            }
            
            // Remove from scene
            scene.remove(object);
          };
          
          // Get a list of valid player IDs we should keep (all players currently in the game)
          const validPlayerIds = new Set<string>();
          // Add IDs from our player reference map
          playersRef.current.forEach((_, id) => validPlayerIds.add(id));
          // Always consider our own player ID valid
          if (socket.id) validPlayerIds.add(socket.id);
          
          
          
          // First, do a full scene traversal to find ALL player-related objects
          const allPlayerObjects: THREE.Object3D[] = [];
          const playerIdToObjects = new Map<string, THREE.Object3D[]>();
          
          scene.traverse((object) => {
            // Check if this is a player mesh by checking for specific properties
            if (object.userData && object.userData.playerId) {
              const playerId = object.userData.playerId;
              allPlayerObjects.push(object);
              
              // Group by player ID
              if (!playerIdToObjects.has(playerId)) {
                playerIdToObjects.set(playerId, []);
              }
              playerIdToObjects.get(playerId)?.push(object);
            }
          });
          
          
          
          // Process objects by player ID to handle cleanup
          playerIdToObjects.forEach((objects, playerId) => {
            // If this player ID is no longer valid, remove ALL its objects
            if (!validPlayerIds.has(playerId)) {
              
              objects.forEach(removePlayerObject);
              
              // Also make sure it's removed from our playersRef
              playersRef.current.delete(playerId);
              
              // And from name labels
              if (nameLabelsRef.current.has(playerId)) {
                const label = nameLabelsRef.current.get(playerId);
                if (label) {
                  if (label.parent) {
                    label.parent.remove(label);
                  }
                  scene.remove(label);
                  nameLabelsRef.current.delete(playerId);
                }
              }
            } else if (playerId === socket.id) {
              // This is our own player, we should only have our main player mesh
              
              
              // Keep only the original playerRef
              objects.forEach(obj => {
                if (obj !== playerRef.current) {
                  
                  removePlayerObject(obj);
                }
              });
            } else {
              // This is another player, we should only have one main mesh per player
              
              
              // Keep only the one tracked in playersRef
              const trackedMesh = playersRef.current.get(playerId);
              if (trackedMesh) {
                objects.forEach(obj => {
                  if (obj !== trackedMesh && obj.type === 'Mesh') {
                    
                    removePlayerObject(obj);
                  }
                });
              }
            }
          });
          
          // Check for orphaned name labels (not attached to any player)
          nameLabelsRef.current.forEach((label, playerId) => {
            if (!playerIdToObjects.has(playerId)) {
              
              if (label.parent) {
                label.parent.remove(label);
              }
              scene.remove(label);
              nameLabelsRef.current.delete(playerId);
            }
          });
        };
        
        // Set up periodic cleanup to handle any ghost player meshes
        const cleanupInterval = setInterval(() => {
          if (isConnected) {
            // Only run full cleanup check every 3 minutes (reduced frequency)
            const shouldRunFullCheck = Math.random() < 0.1; // 10% chance = every ~10 checks
            
            if (shouldRunFullCheck) {
              
              
              // Check for players marked for cleanup due to inactivity
              const inactivePlayers: string[] = [];
              
              playersRef.current.forEach((playerMesh, playerId) => {
                // Only clean up players that have been explicitly marked as inactive
                if (playerMesh.userData.markedForCleanup === true) {
                  inactivePlayers.push(playerId);
                }
              });
              
              if (inactivePlayers.length > 0) {
                
                
                // Since checkPlayersPresence isn't defined, let's use getPlayerData instead
                // to check one player at a time - if data comes back, they're still active
                const checkPlayerStatus = async () => {
                  const disconnectedPlayerIds: string[] = [];
                  
                  // Check each inactive player one by one
                  for (const playerId of inactivePlayers) {
                    try {
                      // Try to get the player data - if this succeeds, they're still connected
                      await new Promise<void>((resolve, reject) => {
                        socket.emit('getPlayerData', playerId, (playerData: any) => {
                          if (playerData) {
                            // Player still exists on server, not disconnected
                            
                            resolve();
                          } else {
                            // Player doesn't exist on server, mark as disconnected
                            disconnectedPlayerIds.push(playerId);
                            
                            resolve();
                          }
                        });
                        
                        // Set a timeout in case the callback never fires
                        setTimeout(() => {
                          disconnectedPlayerIds.push(playerId);
                          
                          resolve();
                        }, 1000);
                      });
                    } catch (error) {
                      console.error(`Error checking player ${playerId}:`, error);
                      // In case of error, assume disconnected to be safe
                      disconnectedPlayerIds.push(playerId);
                    }
                  }
                  
                  // Now handle the disconnected players
                  if (disconnectedPlayerIds.length > 0) {
                    
                    
                    // Remove only the players confirmed disconnected
                    disconnectedPlayerIds.forEach(playerId => {
                      const playerMesh = playersRef.current.get(playerId);
                      if (playerMesh) {
                        
                        
                        // Clean up any timeouts
                        if (playerMesh.userData.disappearanceTimeout) {
                          clearTimeout(playerMesh.userData.disappearanceTimeout);
                        }
                        
                        // Clean up any child objects
                        playerMesh.traverse((child) => {
                          if ((child as any).isCSS2DObject) {
                            if (child.parent) {
                              child.parent.remove(child);
                            }
                            scene.remove(child);
                          }
                        });
                        
                        // Clean up resources
                        if ((playerMesh as THREE.Mesh).geometry) {
                          (playerMesh as THREE.Mesh).geometry.dispose();
                        }
                        if ((playerMesh as THREE.Mesh).material) {
                          if (Array.isArray((playerMesh as THREE.Mesh).material)) {
                            ((playerMesh as THREE.Mesh).material as THREE.Material[]).forEach(m => m.dispose());
                          } else {
                            ((playerMesh as THREE.Mesh).material as THREE.Material).dispose();
                          }
                        }
                        
                        // Remove from scene
                        scene.remove(playerMesh);
                        playersRef.current.delete(playerId);
                        
                        // Also remove from name labels
                        if (nameLabelsRef.current.has(playerId)) {
                          const label = nameLabelsRef.current.get(playerId);
                          if (label) {
                            if (label.parent) {
                              label.parent.remove(label);
                            }
                            scene.remove(label);
                            nameLabelsRef.current.delete(playerId);
                          }
                        }
                      }
                    });
                  } else {
                    
                    
                    // Reset marked for cleanup for all players since they're still connected
                    inactivePlayers.forEach(playerId => {
                      const playerMesh = playersRef.current.get(playerId);
                      if (playerMesh) {
                        playerMesh.userData.markedForCleanup = false;
                        
                        // Reset disappearance timeout
                        if (playerMesh.userData.disappearanceTimeout) {
                          clearTimeout(playerMesh.userData.disappearanceTimeout);
                        }
                        playerMesh.userData.disappearanceTimeout = setTimeout(() => {
                          playerMesh.userData.markedForCleanup = true;
                        }, 30000);
                      }
                    });
                  }
                };
                
                // Run the check
                checkPlayerStatus();
              } else {
                
              }
              
              // Check for duplicate player meshes in the scene as a second cleanup step
              const playerIdCounts = new Map<string, number>();
              const duplicatePlayerIds = new Set<string>();
              
              // Count how many meshes exist per player ID
              scene.traverse((object) => {
                if (object.userData && object.userData.playerId && object.type === 'Mesh') {
                  const playerId = object.userData.playerId;
                  playerIdCounts.set(playerId, (playerIdCounts.get(playerId) || 0) + 1);
                  
                  // If we found more than one mesh for this player, it's a duplicate
                  if (playerIdCounts.get(playerId)! > 1) {
                    duplicatePlayerIds.add(playerId);
                  }
                }
              });
              
              // Handle any duplicates found
              if (duplicatePlayerIds.size > 0) {
                
                
                // For each player with duplicates, keep only the one in our tracking map
                duplicatePlayerIds.forEach(playerId => {
                  const trackedMesh = playersRef.current.get(playerId);
                  if (!trackedMesh) return; // Skip if we don't have this player tracked anymore
                  
                  const duplicateMeshes: THREE.Object3D[] = [];
                  
                  // Find all meshes with this player ID
                  scene.traverse((object) => {
                    if (object.userData && 
                        object.userData.playerId === playerId && 
                        object.type === 'Mesh' && 
                        object !== trackedMesh) {
                      duplicateMeshes.push(object);
                    }
                  });
                  
                  // Remove the duplicates
                  if (duplicateMeshes.length > 0) {
                    
                    
                    duplicateMeshes.forEach(mesh => {
                      // Clean up any child objects
                      try {
                        const childrenToRemove: THREE.Object3D[] = [];
                        
                        // Only process children if they exist
                        if (mesh.children && mesh.children.length > 0) {
                          for (let i = 0; i < mesh.children.length; i++) {
                            const child = mesh.children[i];
                            if (child && (child as any).isCSS2DObject) {
                              childrenToRemove.push(child);
                            }
                          }
                          
                          // Remove children outside the loop
                          childrenToRemove.forEach(child => {
                            if (child.parent) {
                              child.parent.remove(child);
                            }
                            scene.remove(child);
                          });
                        }
                      } catch (e) {
                        console.error("Error while cleaning up duplicate mesh CSS2DObjects:", e);
                      }
                      
                      // Clean up resources
                      if ((mesh as THREE.Mesh).geometry) {
                        (mesh as THREE.Mesh).geometry.dispose();
                      }
                      if ((mesh as THREE.Mesh).material) {
                        if (Array.isArray((mesh as THREE.Mesh).material)) {
                          ((mesh as THREE.Mesh).material as THREE.Material[]).forEach(m => m.dispose());
                        } else {
                          ((mesh as THREE.Mesh).material as THREE.Material).dispose();
                        }
                      }
                      
                      // Remove from scene
                      scene.remove(mesh);
                    });
                  }
                });
              }
            }
          }
        }, 180000); // Run cleanup check every 3 minutes
        
        // Store the interval for cleanup
        cleanupIntervalRef.current = cleanupInterval;
      };
      
      // Connect socket and setup listeners
      await setupSocketListeners();
      
      // Add position to history for anomaly detection
      const addPositionToHistory = (x: number, z: number, time: number) => {
        positionHistory.current.push({x, z, time});
            if (positionHistory.current.length > MAX_HISTORY_LENGTH) {
              positionHistory.current.shift();
        }
      };
      
      // Detect anomalous movement
      const detectAnomalousMovement = () => {
        const history = positionHistory.current;
        const latest = history[history.length - 1];
        const previous = history[history.length - 2];
        
        // Calculate distance and time between points
        const distance = Math.sqrt(
          Math.pow(latest.x - previous.x, 2) + 
          Math.pow(latest.z - previous.z, 2)
        );
        const timeDiff = (latest.time - previous.time) / 1000; // Convert to seconds
        
        if (timeDiff > 0) {
          const speed = distance / timeDiff;
          
          // If speed exceeds threshold, adjust position
          if (speed > ANOMALOUS_SPEED_THRESHOLD && playerRef.current) {
            console.warn(`Anomalous speed detected: ${speed.toFixed(2)} units/sec`);
            
            // Instead of immediate position correction, apply a smooth transition
            // For now, just cap the movement to a reasonable distance
            const maxAllowedDistance = MOVEMENT_SPEED * 2; // Allow some acceleration but cap it
            
            if (distance > maxAllowedDistance && playerRef.current) {
              // Calculate direction vector
              const dirX = (latest.x - previous.x) / distance;
              const dirZ = (latest.z - previous.z) / distance;
              
              // Limit the movement to max allowed distance
              const cappedX = previous.x + (dirX * maxAllowedDistance);
              const cappedZ = previous.z + (dirZ * maxAllowedDistance);
              
              // Apply clamping again to ensure we're within bounds
              const boundedX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, cappedX));
              const boundedZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, cappedZ));
              
              // Update position
              playerRef.current.position.x = boundedX;
              playerRef.current.position.z = boundedZ;
              
              // Update last position in history
              positionHistory.current[positionHistory.current.length - 1] = {
                x: boundedX, 
                z: boundedZ, 
                time: latest.time
              };
            }
          }
        }
      };
      
      // Check and update zone
      const checkAndUpdateZone = (x: number, z: number) => {
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
          
          
          // Clear any pending zone update
          if (zoneUpdateTimeoutRef.current) {
            clearTimeout(zoneUpdateTimeoutRef.current);
          }
          
          // Set a timeout to update the zone (debounce zone changes)
          // This prevents multiple rapid zone updates from disrupting movement
          zoneUpdateTimeoutRef.current = setTimeout(() => {
            setCurrentZone(newZone);
            zoneUpdateTimeoutRef.current = null;
          }, 500); // 500ms debounce time
        }
      };
      
      // Position update flag for network
      const onPositionChange = () => {
        movementChanged.current = true;
      };
      
      // Send position update to server
      const sendPositionUpdate = async () => {
        // Make sure we're really connected by checking both state and socket.connected
        if (!playerRef.current || !isConnected) {
          // Debug why we're not sending position
          if (!playerRef.current) {
            console.warn('Not sending position - playerRef.current is null');
          }
          if (!isConnected) {
            console.warn('Not sending position - isConnected state is false');
          }
          if (!movementChanged.current) {
            // Don't log this as it would spam the console
          }
          return;
        }
        
        // Double-check actual socket connectivity to catch any state mismatches
        if (!isSocketReady()) {
          console.warn('Not sending position - socket exists but is not really connected');
          return;
        }
        
        // Immediately reset movement flag if we're not going to send an update
        // This prevents movement from getting "stuck" if we miss an update window
        if (!movementChanged.current) {
          return;
        }
        
        const now = Date.now();
        // Check if we should send an update (throttle)
        if (now - lastSendTime.current >= SEND_INTERVAL) {
          const position = {
            x: playerRef.current.position.x,
            y: playerRef.current.position.y,
            z: playerRef.current.position.z,
            timestamp: Date.now() // Add timestamp for latency calculation
          };
          
          // Check if position has changed significantly - use smaller threshold
          const dx = Math.abs(position.x - lastSentPosition.current.x);
          const dz = Math.abs(position.z - lastSentPosition.current.z);
          
          // Lower threshold for detecting movement (from 0.01 to 0.005)
          if (dx > 0.003 || dz > 0.003) {
            // Ensure position is still within bounds before sending
            const validX = Math.max(WORLD_BOUNDS.minX, Math.min(WORLD_BOUNDS.maxX, position.x));
            const validZ = Math.max(WORLD_BOUNDS.minZ, Math.min(WORLD_BOUNDS.maxZ, position.z));
            
            const validatedPosition = {
              x: validX,
              y: position.y,
              z: validZ,
              timestamp: position.timestamp
            };
            
            try {
              // Send position to server
              const socket = await getSocket();
              if (socket && socket.connected) {
                
                socket.emit('playerMove', validatedPosition);
                
                // Update last sent position and time with validated coordinates
                lastSentPosition.current = { ...validatedPosition };
                lastSendTime.current = now;
              } else {
                // If socket isn't connected despite our state thinking it is, update state
                if (isConnected && (!socket || !socket.connected)) {
                  console.warn('Socket not connected despite state saying it is, updating isConnected');
                  setIsConnected(false);
                }
                console.warn('Could not send movement - socket is null or disconnected');
              }
            } catch (error) {
              console.error('Error sending position update:', error);
            }
          } else {
            // Do nothing not sending update
          }
        }
        
        // Reset movement flag
        movementChanged.current = false;
      };
      
      // Animation loop
      const animate = () => {
        const delta = clockRef.current.getDelta();
        
        // Update dropped items
        if (worldItemsRef.current.length > 0) {
          updateDroppedItems(worldItemsRef.current, delta);
        }
        
        // Update player position - call the controller's update function if it exists
        if (playerControllerRef.current && playerControllerRef.current.updatePlayerMovement) {
          try {
            playerControllerRef.current.updatePlayerMovement();
          } catch (error: any) {
            console.error("Error updating player movement:", error);
            setControllerStatus('Error: ' + (error.message || 'Unknown error'));
          }
        } else {
          // Only log warning at a reasonable frequency to avoid spam
          const now = Date.now();
          if (now - lastControllerWarningTime.current > 5000) { // Limit to once every 5 seconds
            console.warn('Player controller not available - movement controls will not work');
            lastControllerWarningTime.current = now;
            
            // Update status for debug display
            setControllerStatus('Missing or Invalid');
            
            // Try to recover - force PlayerController to remount if it's been missing for too long
            if (now - lastControllerWarningTime.current > 20000) { // If missing for 20+ seconds
              console.log('Attempting to recover player controller...');
              // This will trigger a remount of the PlayerController component
              // by forcing React to see it as "different" momentarily
              playerControllerRef.current = null;
            }
          }
        }
        
        // Update remote player positions
        if (remotePlayerManagerRef.current) {
          remotePlayerManagerRef.current.updateRemotePlayerPositions(delta);
        }
        
        // Update chat bubbles
        if (chatBubbleManagerRef.current) {
          chatBubbleManagerRef.current.updateBubbles();
        }
        
        // Request the next frame
        requestAnimationFrame(animate);
        
        // Render scene
        if (renderer && scene && camera) {
          renderer.render(scene, camera);
          if (labelRendererRef.current) {
            labelRendererRef.current.render(scene, camera);
          }
        }
      };
      
      // Start animation loop
      const animationId = requestAnimationFrame(animate);
      console.log('Animation loop started - player controls should now be active');
      
      // Set up cleanup function
      const cleanup = async () => {
        // Cancel animation
        cancelAnimationFrame(animationId);
        
        // Remove event listeners
        window.removeEventListener('resize', handleResize);
        window.removeEventListener('keydown', handleKeyDown);
        window.removeEventListener('keyup', handleKeyUp);
        renderer.domElement.removeEventListener('click', handleMouseClick);
        
        // Remove mouse control event listeners
        window.removeEventListener('mousedown', handleMouseDown);
        window.removeEventListener('mouseup', handleMouseUp);
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('wheel', handleWheel);
        
        // Remove socket event listeners
        const cleanup = async () => {
          const socket = await getSocket();
          if (socket) {
            socket.off('initPlayers');
            socket.off('playerJoined');
            socket.off('playerLeft');
            socket.off('playerMoved');
            socket.off('itemDropped');
            socket.off('itemRemoved');
            socket.off('chatMessage');
          }
        };
        
        cleanup();
        
        // Dispose of geometries and materials
        groundGeometry.dispose();
        groundMaterial.dispose();
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
        
        // Clear the cleanup interval
        if (cleanupIntervalRef.current) {
          clearInterval(cleanupIntervalRef.current);
        }
        
        // Clean up player meshes
        if (remotePlayerManagerRef.current) {
          remotePlayerManagerRef.current.cleanupPlayerMeshes();
        }
      };
      
      // Store cleanup function for access outside this effect
      cleanupFunctionsRef.current.initialCleanup = cleanup;
      
      // Return cleanup function
      return () => {
        cleanup();
      };
    };
    
    // Call the async function
    initializeGameScene();
    
    // Cleanup when component unmounts
    return () => {
      console.log("GameCanvas unmounting - cleaning up resources");
      
      // Call stored cleanup function if it exists
      if (cleanupFunctionsRef.current.initialCleanup) {
        cleanupFunctionsRef.current.initialCleanup();
      }
      
      // Make sure to remove event listeners added outside the initializeGameScene
      window.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('wheel', handleWheel);
      
      // Remove other listeners and clear intervals
      if (cleanupIntervalRef.current) {
        clearInterval(cleanupIntervalRef.current);
      }
    };
  }, []); // Empty dependency array to run only once on mount
  
  // Handle keyboard input
  const handleKeyDown = (event: KeyboardEvent) => {
    // We only track key state here - actual movement is handled by PlayerController
    if (keysPressed.current.hasOwnProperty(event.key)) {
      keysPressed.current[event.key] = true;
    }
  };
  
  const handleKeyUp = (event: KeyboardEvent) => {
    // We only track key state here - actual movement is handled by PlayerController
    if (keysPressed.current.hasOwnProperty(event.key)) {
      keysPressed.current[event.key] = false;
    }
  };
  
  // Handle mouse click for resource gathering and item pickup
  const handleMouseClick = (event: MouseEvent) => {
    if (!sceneRef.current || !playerRef.current) return;
    
    // Find the renderer and camera in the scene
    const rendererElement = event.target as HTMLCanvasElement;
    if (!rendererElement) return;
    
    // Get mouse position in normalized device coordinates (-1 to +1)
    const rect = rendererElement.getBoundingClientRect();
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update the raycaster with a temporary camera
    // Find a camera in the scene
    let tempCamera: THREE.Camera | undefined;
    sceneRef.current.traverse((obj) => {
      if (obj instanceof THREE.Camera) {
        tempCamera = obj;
      }
    });
    
    if (!tempCamera) return;
    
    raycasterRef.current.setFromCamera(mouseRef.current, tempCamera);
    
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
          isGathering.current = true;
          if (worldResourceManagerRef.current) {
            worldResourceManagerRef.current.gatherResource(intersected.userData.resourceId);
          }
        }
      }
      // Check if it's a dropped item
      else if (intersected.userData.dropId && distanceToPlayer <= 5) {
        // Pick up item
        pickupItem(intersected.userData.dropId);
      }
      // Too far away
      else if (distanceToPlayer > 5) {
        
      }
    }
  };
  
  // Add event listeners for keyboard and mouse
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
    // Add click event listener to canvas when it's available
    // Use optional chaining to handle null canvasRef
    const canvas = canvasRef.current?.querySelector('canvas');
    if (canvas) {
      canvas.addEventListener('click', handleMouseClick);
    }
    
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      
      // Use optional chaining for cleanup as well
      const canvasElement = canvasRef.current?.querySelector('canvas');
      if (canvasElement) {
        canvasElement.removeEventListener('click', handleMouseClick);
      }
    };
  }, []);
  
  // Function to handle resource gathering
  const gatherResource = async (resourceId: string) => {
    
    
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
    const socket = await getSocket();
    if (socket) {
      socket.emit('gather', resourceId);
    }
    
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
  
  // Function to pick up items
  const pickupItem = async (dropId: string) => {
    
    
    // Play sound
    soundManager.play('itemPickup');
    
    // Send pickup event to server
    const socket = await getSocket();
    if (socket) {
      socket.emit('pickup', dropId);
    }
  };
  
  // Initialize remote player manager
  const handleRemotePlayerManagerInit = (manager: RemotePlayerManagerInterface) => {
    remotePlayerManagerRef.current = manager;
  };
  
  // Initialize world resource manager
  const handleWorldResourceManagerInit = (manager: WorldResourceManagerInterface) => {
    worldResourceManagerRef.current = manager;
  };

  // Add mouse event handlers for camera control
  const handleMouseDown = (event: MouseEvent) => {
    if (event.button === 1) { // Middle mouse button
      event.preventDefault(); // Prevent default middle-click behavior (scrolling)
      isMiddleMouseDown.current = true;
      lastMousePosition.current = { x: event.clientX, y: event.clientY };
    }
  };

  const handleMouseUp = (event: MouseEvent) => {
    if (event.button === 1) { // Middle mouse button
      isMiddleMouseDown.current = false;
    }
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (isMiddleMouseDown.current) {
      const deltaX = event.clientX - lastMousePosition.current.x;
      const deltaY = event.clientY - lastMousePosition.current.y;
      
      // Update camera angle based on horizontal mouse movement
      cameraAngle.current += deltaX * 0.01;

      // Update camera tilt based on vertical mouse movement
      cameraTilt.current = Math.max(0.1, Math.min(0.9, cameraTilt.current + deltaY * 0.005));

      lastMousePosition.current = { x: event.clientX, y: event.clientY };
    }
  };

  // Add mouse wheel handler for zoom
  const handleWheel = (event: WheelEvent) => {
    event.preventDefault(); // Prevent page scrolling
    // Update camera distance based on wheel movement
    // Use a smaller factor for smoother zooming and normalize for different browsers
    const zoomFactor = 0.005;
    cameraDistance.current = Math.max(5, Math.min(20, cameraDistance.current + (event.deltaY * zoomFactor)));
    console.log('Camera zoom adjusted:', cameraDistance.current);
  };

  // Add event listeners
  window.addEventListener('mousedown', handleMouseDown);
  window.addEventListener('mouseup', handleMouseUp);
  window.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('wheel', handleWheel, { passive: false }); // Need passive: false to use preventDefault

  // Replace the existing camera settings effect with this implementation
  useEffect(() => {
    // Only apply if scene ref is available
    if (sceneRef.current) {
      // Apply camera settings directly to scene.userData
      sceneRef.current.userData = {
        ...sceneRef.current.userData,
        cameraHeight: cameraSettings.height,
        cameraDistance: cameraSettings.distance
      };
      
      console.log("Updated camera settings in scene userData:", 
        sceneRef.current.userData.cameraHeight,
        sceneRef.current.userData.cameraDistance
      );
    }
  }, [cameraSettings]);

  // Add a global animation loop to ensure synchronized updates
  useEffect(() => {
    if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;
    
    // Reference to last animation frame ID for cleanup
    let animationFrameId: number | null = null;
    
    // Global animation function that handles all rendering
    const animateAll = () => {
      if (!sceneRef.current || !cameraRef.current || !rendererRef.current) return;
      
      // Render the scene
      rendererRef.current.render(sceneRef.current, cameraRef.current);
      
      // Continue the animation loop
      animationFrameId = requestAnimationFrame(animateAll);
    };
    
    // Start the animation loop
    animationFrameId = requestAnimationFrame(animateAll);
    console.log("GameCanvas: Started main animation loop");
    
    // Cleanup on unmount
    return () => {
      if (animationFrameId !== null) {
        cancelAnimationFrame(animationFrameId);
        console.log("GameCanvas: Stopped main animation loop");
      }
    };
  }, [sceneRef.current, cameraRef.current, rendererRef.current]);

  return (
    <div className="game-container">
      <div ref={canvasRef} className="game-canvas" />
      
      {/* Add subcomponents */}
      {sceneRef.current && cameraRef.current && rendererRef.current && (
        <>
          <PlayerController
            playerRef={playerRef}
            scene={sceneRef.current}
            camera={cameraRef.current}
            renderer={rendererRef.current}
            onZoneChange={(x, z) => {
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
            }}
            addPositionToHistory={(x, z, time) => {
              positionHistory.current.push({x, z, time});
              if (positionHistory.current.length > MAX_HISTORY_LENGTH) {
                positionHistory.current.shift();
              }
            }}
            detectAnomalousMovement={() => {
              // Disabled to prevent movement interruption
            }}
            onPositionChange={() => {
              movementChanged.current = true;
              
              // Force connected state to true to allow position updates without a server connection
              if (!isConnected) {
                setIsConnected(true);
              }
              
              // Local player movement - Always update last position even without server
              if (playerRef.current) {
                lastSentPosition.current = {
                  x: playerRef.current.position.x,
                  y: playerRef.current.position.y,
                  z: playerRef.current.position.z
                };
              }
            }}
            onInit={(controller) => {
              playerControllerRef.current = controller;
              console.log('Player controller initialized successfully', controller);
              setControllerStatus('Controller Ready');
            }}
            initialPlayers={[]} // Pass initial players if needed
            mySocketId={mySocketIdRef.current} // Pass the socket ID
          />

          {/* Add CameraManager component to follow player */}
          <CameraManager
            scene={sceneRef.current}
            camera={cameraRef.current}
            renderer={rendererRef.current}
            targetPlayerId="localPlayer"
          />
        </>
      )}
      
      {sceneRef.current && (
        <>
          {createNameLabelRef.current && (
            <RemotePlayerManager
              scene={sceneRef.current}
              playersRef={playersRef}
              nameLabelsRef={nameLabelsRef}
              mySocketId={mySocketIdRef.current}
              createNameLabel={createNameLabelRef.current}
              onInit={handleRemotePlayerManagerInit}
            />
          )}
          
          <WorldResourceManager
            scene={sceneRef.current}
            resourceNodesRef={resourceNodesRef}
            onInit={handleWorldResourceManagerInit}
          />
          
          <ChatBubbleManager
            scene={sceneRef.current}
            playerRef={playerRef}
            playersRef={playersRef}
            mySocketId={mySocketIdRef.current}
            onInit={(manager) => chatBubbleManagerRef.current = manager}
          />
        </>
      )}
      
      {/* UI elements */}
      <ChatPanel />
      <InventoryPanel style={{ top: "100px", right: "20px" }} />
      
      {/* Zone indicator */}
      <div 
        style={{
         position: 'absolute',
         top: '10px',
         left: '10px',
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
         color: 'white',
          padding: '5px 10px',
         borderRadius: '5px',
          fontSize: '14px',
          fontWeight: 'bold',
         zIndex: 100
        }}
      >
        {currentZone}
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
        Settings
      </button>
      
      {/* Settings panel */}
      {isSettingsOpen && (
        <div 
          style={{
          position: 'absolute', 
            top: '50px',
            right: '10px',
          backgroundColor: 'rgba(0, 0, 0, 0.8)',
          color: 'white',
            padding: '15px',
          borderRadius: '5px',
            width: '200px',
            zIndex: 101
          }}
        >
          <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>Settings</h3>
          
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="checkbox"
                checked={soundEnabled}
                onChange={() => setSoundEnabled(!soundEnabled)}
                style={{ marginRight: '8px' }}
              />
              Sound Enabled
            </label>
          </div>
          
          {/* Camera settings */}
          <div style={{ marginBottom: '15px' }}>
            <h4 style={{ margin: '10px 0 5px 0', fontSize: '14px' }}>Camera Settings</h4>
            
            <div style={{ marginBottom: '5px' }}>
              <label style={{ fontSize: '12px', display: 'block', marginBottom: '2px' }}>
                Height: {cameraSettings.height}
              </label>
              <input 
                type="range" 
                min="2" 
                max="10" 
                step="0.5"
                value={cameraSettings.height}
                style={{ width: '100%' }}
                onChange={(e) => {
                  const height = parseFloat(e.target.value);
                  setCameraSettings(prev => ({
                    ...prev,
                    height
                  }));
                }}
              />
            </div>
            
            <div>
              <label style={{ fontSize: '12px', display: 'block', marginBottom: '2px' }}>
                Distance: {cameraSettings.distance}
              </label>
              <input 
                type="range" 
                min="4" 
                max="15" 
                step="0.5"
                value={cameraSettings.distance}
                style={{ width: '100%' }}
                onChange={(e) => {
                  const distance = parseFloat(e.target.value);
                  setCameraSettings(prev => ({
                    ...prev,
                    distance
                  }));
                }}
              />
            </div>
          </div>
          
          <div style={{ marginBottom: '10px' }}>
            <label style={{ display: 'flex', alignItems: 'center' }}>
            <input
              type="checkbox"
                checked={isHorizontalInverted}
                onChange={() => setIsHorizontalInverted(!isHorizontalInverted)}
                style={{ marginRight: '8px' }}
              />
              Invert Horizontal Camera
            </label>
          </div>
          
            <button 
              onClick={() => setIsSettingsOpen(false)}
              style={{
              marginTop: '10px',
              backgroundColor: 'rgba(0, 0, 100, 0.5)',
                color: 'white',
                border: 'none',
              borderRadius: '5px',
              padding: '5px 10px',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Close
            </button>
        </div>
      )}
      
      {/* Debug indicator - only show in development */}
      {process.env.NODE_ENV !== 'production' && (
        <div
          style={{
            position: 'absolute',
            bottom: '10px',
            left: '10px',
            backgroundColor: playerControllerRef.current ? 'rgba(0, 128, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)',
            color: 'white',
            padding: '5px 10px',
            borderRadius: '5px',
            fontSize: '12px',
            zIndex: 100
          }}
        >
          Player Controller: {controllerStatus}
        </div>
      )}
      
      {/* Reconnect button - shown when disconnected */}
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
    </div>
  );
};

export default GameCanvas;