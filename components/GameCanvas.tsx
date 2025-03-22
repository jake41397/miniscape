import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { initializeSocket, getSocket } from '../game/network/socket';
import { Player } from '../types/player';

// Player movement speed
const MOVEMENT_SPEED = 0.15;
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
  const [playerName, setPlayerName] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  
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
    
    // Append canvas to DOM
    canvasRef.current.appendChild(renderer.domElement);
    
    // Handle window resize
    const handleResize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      
      renderer.setSize(width, height);
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
    
    // Add player to scene
    scene.add(playerMesh);
    
    // Make camera follow player
    camera.position.set(
      playerMesh.position.x, 
      playerMesh.position.y + 8, 
      playerMesh.position.z + 10
    );
    camera.lookAt(playerMesh.position);
    
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
      
      // Add the new player to the scene if not exists
      if (!playersRef.current.has(player.id)) {
        createPlayerMesh(player);
      } else {
        // Update existing player (might be a name change)
        const existingMesh = playersRef.current.get(player.id);
        if (existingMesh) {
          existingMesh.position.set(player.x, player.y, player.z);
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
    
    // Handle player movements
    socket.on('playerMoved', (data) => {
      // Update the position of the moved player
      const playerMesh = playersRef.current.get(data.id);
      if (playerMesh) {
        playerMesh.position.set(data.x, data.y, data.z);
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
    
    // Add event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    
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
    
    // Animation loop
    const animate = () => {
      requestAnimationFrame(animate);
      
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
      
      renderer.render(scene, camera);
    };
    animate();
    
    // Cleanup on unmount
    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      
      // Dispose of geometries and materials
      groundGeometry.dispose();
      groundMaterial.dispose();
      playerGeometry.dispose();
      playerMaterial.dispose();
      
      canvasRef.current?.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, []);
  
  return <div ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
};

export default GameCanvas; 