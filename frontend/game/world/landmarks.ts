import * as THREE from 'three';

// Interface for interactive NPCs
export interface NPC {
  id: string;
  name: string;
  position: THREE.Vector3;
  mesh: THREE.Object3D;
  interactionRadius: number;
  dialogues: {
    id: string;
    text: string;
    responses?: {
      text: string;
      nextDialogueId?: string;
      action?: () => void;
    }[];
  }[];
  currentDialogueId: string;
  isInteracting: boolean;
  userData?: {
    selectedRecipe?: string;
    startTime?: number;
    smeltingInProgress?: boolean;
    cleanupSocketListeners?: () => void;
    [key: string]: any;
  };
}

// Interface for a static landmark
export interface Landmark {
  id: string;
  name: string;
  position: THREE.Vector3;
  mesh: THREE.Object3D;
  interactable: boolean;
  interactionRadius?: number;
  metadata?: { [key: string]: any };
  onInteract?: () => void;
}

// Tutorial guide NPC in Lumbridge
export const createTutorialGuideNPC = (): NPC => {
  console.log("Creating Tutorial Guide NPC");
  
  // Create a simple character mesh
  const group = new THREE.Group();
  
  // Body
  const bodyGeometry = new THREE.CapsuleGeometry(0.5, 1.5, 4, 8);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0x1E88E5 });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 1.25;
  group.add(body);
  
  // Head
  const headGeometry = new THREE.SphereGeometry(0.4, 16, 16);
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xE0E0E0 });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 2.5;
  group.add(head);
  
  // Create a nametag
  const nametagCanvas = document.createElement('canvas');
  nametagCanvas.width = 256;
  nametagCanvas.height = 64;
  const context = nametagCanvas.getContext('2d');
  
  if (context) {
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, 256, 64);
    context.font = 'Bold 24px Arial';
    context.fillStyle = '#FFEB3B'; // Yellow text
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('Guide', 128, 32);
  }
  
  const nametagTexture = new THREE.CanvasTexture(nametagCanvas);
  const nametagMaterial = new THREE.SpriteMaterial({ map: nametagTexture, transparent: true });
  const nametag = new THREE.Sprite(nametagMaterial);
  nametag.position.set(0, 3.2, 0);
  nametag.scale.set(2, 0.5, 1);
  group.add(nametag);
  
  // Make mesh interactable
  group.userData.isInteractable = true;
  group.userData.isNPC = true;
  group.userData.npcId = 'tutorial_guide';
  
  return {
    id: 'tutorial_guide',
    name: 'Tutorial Guide',
    position: new THREE.Vector3(10, 0, 10), // Near Lumbridge center
    mesh: group,
    interactionRadius: 3,
    dialogues: [
      {
        id: 'welcome',
        text: 'Welcome to Lumbridge! I can teach you the basics of MiniScape. Would you like to learn?',
        responses: [
          {
            text: 'Yes, teach me the basics.',
            nextDialogueId: 'basics'
          },
          {
            text: 'No thanks, I\'ll explore on my own.',
            nextDialogueId: 'goodbye'
          }
        ]
      },
      {
        id: 'basics',
        text: 'MiniScape has many skills to level up. You can fish in water, cut trees, or mine ore. Try clicking on resources to gather them.',
        responses: [
          {
            text: 'Tell me about the different areas.',
            nextDialogueId: 'areas'
          },
          {
            text: 'How do I level up skills?',
            nextDialogueId: 'skills'
          },
          {
            text: 'Back to main topics.',
            nextDialogueId: 'welcome'
          }
        ]
      },
      {
        id: 'areas',
        text: 'Lumbridge is a safe area for beginners. The Grand Exchange is for trading. Barbarian Village has mining spots. Be careful in the Wilderness - players can attack you there!',
        responses: [
          {
            text: 'Tell me more about skills.',
            nextDialogueId: 'skills'
          },
          {
            text: 'Back to main topics.',
            nextDialogueId: 'welcome'
          },
          {
            text: 'Thanks for the information.',
            nextDialogueId: 'goodbye'
          }
        ]
      },
      {
        id: 'skills',
        text: 'When you perform an action like fishing or woodcutting, you gain experience. Gain enough experience to level up, which unlocks new resources and abilities.',
        responses: [
          {
            text: 'Tell me about the different areas.',
            nextDialogueId: 'areas'
          },
          {
            text: 'Back to main topics.',
            nextDialogueId: 'welcome'
          },
          {
            text: 'Thanks for the information.',
            nextDialogueId: 'goodbye'
          }
        ]
      },
      {
        id: 'goodbye',
        text: 'Good luck on your adventures! Come back if you need more help.',
        responses: [
          {
            text: 'Goodbye.',
            // No nextDialogueId - this will end the dialogue
          }
        ]
      }
    ],
    currentDialogueId: 'welcome',
    isInteracting: false
  };
};

// Creates signposts to help players navigate
export const createSignpost = (position: THREE.Vector3, text: string): Landmark => {
  const group = new THREE.Group();
  
  // Post
  const postGeometry = new THREE.BoxGeometry(0.2, 1.5, 0.2);
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 });
  const post = new THREE.Mesh(postGeometry, postMaterial);
  post.position.y = 0.75;
  group.add(post);
  
  // Sign
  const signGeometry = new THREE.BoxGeometry(1.2, 0.8, 0.1);
  const signMaterial = new THREE.MeshStandardMaterial({ color: 0xD2B48C });
  const sign = new THREE.Mesh(signGeometry, signMaterial);
  sign.position.y = 1.6;
  group.add(sign);
  
  // Text
  const textCanvas = document.createElement('canvas');
  textCanvas.width = 256;
  textCanvas.height = 128;
  const context = textCanvas.getContext('2d');
  
  if (context) {
    context.fillStyle = '#D2B48C';
    context.fillRect(0, 0, 256, 128);
    context.strokeStyle = '#8B4513';
    context.lineWidth = 8;
    context.strokeRect(4, 4, 248, 120);
    context.font = 'bold 24px Arial';
    context.fillStyle = '#000000';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    
    // Handle multi-line text
    const lines = text.split('\n');
    const lineHeight = 30;
    const startY = 64 - ((lines.length - 1) * lineHeight) / 2;
    
    lines.forEach((line, index) => {
      context.fillText(line, 128, startY + index * lineHeight);
    });
  }
  
  const textTexture = new THREE.CanvasTexture(textCanvas);
  const textMaterial = new THREE.MeshBasicMaterial({ 
    map: textTexture, 
    transparent: false,
    side: THREE.DoubleSide
  });
  
  const textPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 0.7),
    textMaterial
  );
  textPlane.position.set(0, 1.6, 0.06);
  group.add(textPlane);
  
  // Make interactable
  group.userData.isInteractable = true;
  group.userData.isSignpost = true;
  
  return {
    id: `signpost_${position.x}_${position.z}`,
    name: 'Signpost',
    position,
    mesh: group,
    interactable: true,
    interactionRadius: 2,
    onInteract: () => {
      console.log(`Interacted with signpost: ${text}`);
      // Could trigger a UI popup or notification
    }
  };
};

// Creates a simple building mesh
export const createBuildingMesh = (
  width: number, 
  length: number, 
  height: number, 
  roofColor: number = 0x8B4513, 
  wallColor: number = 0xD2B48C
): THREE.Group => {
  const building = new THREE.Group();
  
  // Walls
  const wallsGeometry = new THREE.BoxGeometry(width, height, length);
  const wallsMaterial = new THREE.MeshStandardMaterial({ color: wallColor });
  const walls = new THREE.Mesh(wallsGeometry, wallsMaterial);
  walls.position.y = height / 2;
  building.add(walls);
  
  // Roof
  const roofHeight = height * 0.5;
  const roofGeometry = new THREE.ConeGeometry(
    Math.sqrt(width * width + length * length) / 2, 
    roofHeight, 
    4
  );
  const roofMaterial = new THREE.MeshStandardMaterial({ color: roofColor });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.y = height + roofHeight / 2;
  roof.rotation.y = Math.PI / 4;
  building.add(roof);
  
  // Optional: Add door and windows
  const doorWidth = Math.min(1.2, width / 3);
  const doorHeight = Math.min(2, height * 0.8);
  const doorGeometry = new THREE.PlaneGeometry(doorWidth, doorHeight);
  const doorMaterial = new THREE.MeshStandardMaterial({ color: 0x4E342E, side: THREE.DoubleSide });
  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.position.set(0, doorHeight / 2, length / 2 + 0.01);
  building.add(door);
  
  return building;
};

// Creates Lumbridge castle mesh
export const createLumbridgeCastleMesh = (): THREE.Group => {
  const castle = new THREE.Group();
  
  // Main keep
  const mainKeep = createBuildingMesh(10, 10, 8, 0x607D8B, 0xECEFF1);
  castle.add(mainKeep);
  
  // Towers
  const towerPositions = [
    { x: -6, z: -6 },
    { x: 6, z: -6 },
    { x: -6, z: 6 },
    { x: 6, z: 6 }
  ];
  
  towerPositions.forEach(pos => {
    const tower = createBuildingMesh(4, 4, 12, 0x607D8B, 0xECEFF1);
    tower.position.set(pos.x, 0, pos.z);
    castle.add(tower);
  });
  
  // Castle walls
  const wallSegments = [
    { start: { x: -4, z: -6 }, end: { x: 4, z: -6 } },
    { start: { x: -4, z: 6 }, end: { x: 4, z: 6 } },
    { start: { x: -6, z: -4 }, end: { x: -6, z: 4 } },
    { start: { x: 6, z: -4 }, end: { x: 6, z: 4 } }
  ];
  
  wallSegments.forEach(segment => {
    const length = Math.sqrt(
      Math.pow(segment.end.x - segment.start.x, 2) + 
      Math.pow(segment.end.z - segment.start.z, 2)
    );
    
    const wallGeometry = new THREE.BoxGeometry(
      Math.abs(segment.end.x - segment.start.x) || 1, 
      6, 
      Math.abs(segment.end.z - segment.start.z) || 1
    );
    
    const wallMaterial = new THREE.MeshStandardMaterial({ color: 0xECEFF1 });
    const wall = new THREE.Mesh(wallGeometry, wallMaterial);
    
    wall.position.set(
      (segment.start.x + segment.end.x) / 2,
      3,
      (segment.start.z + segment.end.z) / 2
    );
    
    castle.add(wall);
  });
  
  // Castle gate
  const gateGeometry = new THREE.BoxGeometry(4, 6, 1);
  const gateMaterial = new THREE.MeshStandardMaterial({ color: 0x4E342E });
  const gate = new THREE.Mesh(gateGeometry, gateMaterial);
  gate.position.set(0, 3, -6.5);
  castle.add(gate);
  
  return castle;
};

// Create coming soon sign for grand exchange
export const createComingSoonSign = (): THREE.Group => {
  const sign = new THREE.Group();
  
  // Sign post
  const postGeometry = new THREE.CylinderGeometry(0.2, 0.2, 4, 8);
  const postMaterial = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
  const post = new THREE.Mesh(postGeometry, postMaterial);
  post.position.y = 2;
  sign.add(post);
  
  // Sign board
  const boardGeometry = new THREE.BoxGeometry(4, 2, 0.2);
  const boardMaterial = new THREE.MeshStandardMaterial({ color: 0xFFECB3 });
  const board = new THREE.Mesh(boardGeometry, boardMaterial);
  board.position.y = 3.5;
  sign.add(board);
  
  // Sign text
  const textCanvas = document.createElement('canvas');
  textCanvas.width = 512;
  textCanvas.height = 256;
  const context = textCanvas.getContext('2d');
  
  if (context) {
    context.fillStyle = '#FFECB3';
    context.fillRect(0, 0, 512, 256);
    
    context.font = 'bold 48px Arial';
    context.fillStyle = '#D32F2F';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('COMING SOON!', 256, 80);
    
    context.font = '32px Arial';
    context.fillStyle = '#4E342E';
    context.fillText('Grand Exchange', 256, 150);
    context.font = '24px Arial';
    context.fillText('Trade your items with other players', 256, 200);
  }
  
  const textTexture = new THREE.CanvasTexture(textCanvas);
  const textMaterial = new THREE.MeshBasicMaterial({
    map: textTexture,
    transparent: false,
    side: THREE.DoubleSide
  });
  
  const textPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(3.8, 1.9),
    textMaterial
  );
  textPlane.position.set(0, 3.5, 0.11);
  sign.add(textPlane);
  
  return sign;
};

// Function to create a barbarian hut
export const createBarbarianHut = (): THREE.Group => {
  const hut = new THREE.Group();
  
  // Base/platform
  const baseGeometry = new THREE.CylinderGeometry(3, 3, 0.5, 16);
  const baseMaterial = new THREE.MeshStandardMaterial({ color: 0x8D6E63 });
  const base = new THREE.Mesh(baseGeometry, baseMaterial);
  base.position.y = 0.25;
  hut.add(base);
  
  // Walls
  const wallsGeometry = new THREE.CylinderGeometry(2.8, 2.8, 2.5, 16, 1, true);
  const wallsMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xA1887F,
    side: THREE.DoubleSide
  });
  const walls = new THREE.Mesh(wallsGeometry, wallsMaterial);
  walls.position.y = 1.75;
  hut.add(walls);
  
  // Roof
  const roofGeometry = new THREE.ConeGeometry(3.5, 2.5, 16);
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
  const roof = new THREE.Mesh(roofGeometry, roofMaterial);
  roof.position.y = 4;
  hut.add(roof);
  
  // Door
  const doorGeometry = new THREE.PlaneGeometry(1.2, 2);
  const doorMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x4E342E,
    side: THREE.DoubleSide 
  });
  const door = new THREE.Mesh(doorGeometry, doorMaterial);
  door.position.set(2.79, 1.5, 0);
  door.rotation.y = Math.PI / 2;
  hut.add(door);
  
  // Window
  const windowGeometry = new THREE.CircleGeometry(0.5, 16);
  const windowMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xE0F7FA,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.7
  });
  
  // Add a few windows around the hut
  for (let angle = 0; angle < Math.PI * 2; angle += Math.PI / 2) {
    if (angle !== 0) { // Skip where the door is
      const windowPane = new THREE.Mesh(windowGeometry, windowMaterial);
      windowPane.position.set(
        2.801 * Math.cos(angle),
        2,
        2.801 * Math.sin(angle)
      );
      windowPane.rotation.y = Math.PI / 2 + angle;
      hut.add(windowPane);
    }
  }
  
  // Add a small chimney
  const chimneyGeometry = new THREE.BoxGeometry(0.6, 1.5, 0.6);
  const chimneyMaterial = new THREE.MeshStandardMaterial({ color: 0x5D4037 });
  const chimney = new THREE.Mesh(chimneyGeometry, chimneyMaterial);
  chimney.position.set(0, 4.5, 1.5);
  hut.add(chimney);
  
  return hut;
};

// Create a simple humanoid NPC
export const createNPC = (
  name: string, 
  position: THREE.Vector3, 
  color: number = 0x8D6E63
): NPC => {
  console.log(`Creating NPC: ${name} at position:`, position);
  const group = new THREE.Group();
  
  // Body
  const bodyGeometry = new THREE.CapsuleGeometry(0.4, 1.2, 4, 8);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color });
  const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
  body.position.y = 1;
  group.add(body);
  
  // Head
  const headGeometry = new THREE.SphereGeometry(0.35, 16, 16);
  const headMaterial = new THREE.MeshStandardMaterial({ color: 0xE0E0E0 });
  const head = new THREE.Mesh(headGeometry, headMaterial);
  head.position.y = 2;
  group.add(head);
  
  // Create a nametag
  const nametagCanvas = document.createElement('canvas');
  nametagCanvas.width = 512; // Increased size for better visibility
  nametagCanvas.height = 128;
  const context = nametagCanvas.getContext('2d');
  
  if (context) {
    context.fillStyle = 'rgba(0, 0, 0, 0.8)';
    context.fillRect(0, 0, 512, 128);
    context.font = 'Bold 32px Arial'; // Increased font size
    context.fillStyle = '#FFFFFF';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(name, 256, 64);
    
    // Add a highlight/border to make it more visible
    context.strokeStyle = '#FFEB3B'; // Yellow border
    context.lineWidth = 4;
    context.strokeRect(4, 4, 504, 120);
  }
  
  const nametagTexture = new THREE.CanvasTexture(nametagCanvas);
  const nametagMaterial = new THREE.SpriteMaterial({ map: nametagTexture, transparent: true });
  const nametag = new THREE.Sprite(nametagMaterial);
  nametag.position.set(0, 2.7, 0);
  nametag.scale.set(3, 0.75, 1); // Larger scale for better visibility
  group.add(nametag);
  
  // Add an interaction indicator
  const indicatorGeometry = new THREE.RingGeometry(0.3, 0.4, 16);
  const indicatorMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00FF00,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0.8
  });
  const indicator = new THREE.Mesh(indicatorGeometry, indicatorMaterial);
  indicator.position.y = 0.1;
  indicator.rotation.x = -Math.PI / 2; // Flat on the ground
  group.add(indicator);
  
  // Make mesh interactable
  group.userData.isInteractable = true;
  group.userData.isNPC = true;
  group.userData.npcId = name.toLowerCase().replace(/\s+/g, '_');
  
  console.log(`NPC created: ${name} with ID: ${name.toLowerCase().replace(/\s+/g, '_')}`);
  
  return {
    id: name.toLowerCase().replace(/\s+/g, '_'),
    name,
    position,
    mesh: group,
    interactionRadius: 3, // Increased from 2 to make interaction easier
    dialogues: [
      {
        id: 'default',
        text: `Hello traveler, my name is ${name}.`,
        responses: [
          {
            text: 'Goodbye.',
            nextDialogueId: 'default'
          }
        ]
      }
    ],
    currentDialogueId: 'default',
    isInteracting: false
  };
};

// Create a vibeverse portal that players can enter to go to portal.pieter.com
export const createVibesversePortal = (position: THREE.Vector3): Landmark => {
  const portal = new THREE.Group();
  
  // Create portal frame
  const frameGeometry = new THREE.TorusGeometry(1.5, 0.2, 16, 32);
  const frameMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x00ff00, // Green
    emissive: 0x00ff00,
    metalness: 0.7,
    roughness: 0.3,
    transparent: true,
    opacity: 0.8
  });
  const frame = new THREE.Mesh(frameGeometry, frameMaterial);
  portal.add(frame);
  
  // Create portal inner surface
  const portalGeometry = new THREE.CircleGeometry(1.3, 32);
  const portalMaterial = new THREE.MeshBasicMaterial({ 
    color: 0x00ff00, 
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide
  });
  const portalMesh = new THREE.Mesh(portalGeometry, portalMaterial);
  portalMesh.userData.isPortal = true;
  portalMesh.userData.animationOffset = Math.random() * Math.PI * 2; // Random start point for animation
  portal.add(portalMesh);
  
  // Create particle system for portal effect
  const particleCount = 500;
  const particles = new THREE.BufferGeometry();
  const positions = new Float32Array(particleCount * 3);
  const colors = new Float32Array(particleCount * 3);

  for (let i = 0; i < particleCount * 3; i += 3) {
    // Create particles in a ring around the portal
    const angle = Math.random() * Math.PI * 2;
    const radius = 1.5 + (Math.random() - 0.5) * 0.4;
    positions[i] = Math.cos(angle) * radius;
    positions[i + 1] = Math.sin(angle) * radius;
    positions[i + 2] = (Math.random() - 0.5) * 0.4;

    // Green color with slight variation
    colors[i] = 0;
    colors[i + 1] = 0.8 + Math.random() * 0.2;
    colors[i + 2] = 0;
  }

  particles.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  particles.setAttribute('color', new THREE.BufferAttribute(colors, 3));

  const particleMaterial = new THREE.PointsMaterial({
    size: 0.05,
    vertexColors: true,
    transparent: true,
    opacity: 0.6
  });

  const particleSystem = new THREE.Points(particles, particleMaterial);
  particleSystem.userData.isParticleSystem = true;
  portal.add(particleSystem);
  
  // Add label above the portal
  const labelCanvas = document.createElement('canvas');
  labelCanvas.width = 512;
  labelCanvas.height = 64;
  const context = labelCanvas.getContext('2d');
  
  if (context) {
    context.fillStyle = 'rgba(0, 0, 0, 0.7)';
    context.fillRect(0, 0, 512, 64);
    context.font = 'bold 32px Arial';
    context.fillStyle = '#00FF00'; // Green text
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText('VIBEVERSE PORTAL', 256, 32);
  }
  
  const labelTexture = new THREE.CanvasTexture(labelCanvas);
  const labelMaterial = new THREE.SpriteMaterial({ map: labelTexture, transparent: true });
  const label = new THREE.Sprite(labelMaterial);
  label.position.set(0, 2.5, 0);
  label.scale.set(3, 0.5, 1);
  portal.add(label);
  
  // Add a subtle glow effect
  const glowGeometry = new THREE.CircleGeometry(1.8, 32);
  const glowMaterial = new THREE.MeshBasicMaterial({
    color: 0x00ff00,
    transparent: true,
    opacity: 0.3,
    side: THREE.DoubleSide
  });
  const glow = new THREE.Mesh(glowGeometry, glowMaterial);
  glow.userData.isGlow = true;
  glow.userData.pulseRate = 0.5 + Math.random() * 0.5; // Random pulse rate
  portal.add(glow);
  
  // Set portal position
  portal.position.copy(position);
  
  // Create collision box for the portal
  const portalBox = new THREE.Box3().setFromObject(portal);
  
  // Mark objects as rightclickable
  portal.traverse((child: THREE.Object3D) => {
    child.userData.isRightClickable = true;
    child.userData.portalId = `portal_vibeverse_${position.x}_${position.z}`;
    child.userData.portalName = 'Vibeverse Portal';
    child.userData.portalType = 'vibeverse';
  });
  
  // Create portal landmark
  return {
    id: `portal_vibeverse_${position.x}_${position.z}`,
    name: 'Vibeverse Portal',
    position,
    mesh: portal,
    interactable: true,
    interactionRadius: 10, // Increased for better right-click detection range
    metadata: { 
      isPortal: true,
      isRightClickable: true,
      portalType: 'vibeverse',
      destinationUrl: 'http://portal.pieter.com',
      collisionBox: portalBox
    },
    onInteract: () => {
      // This will be called when right-clicked through the context menu
      enterVibesversePortal();
    }
  };
};

// Separate function to handle portal entry for reuse
export const enterVibesversePortal = () => {
  console.log('Player entered Vibeverse Portal');
  
  // Get player info for query parameters
  const playerName = (window as any).playerName || 'unknown';
  const playerColor = (window as any).playerColor || 'green';
  const playerSpeed = (window as any).playerSpeed || 5; // Default speed (meters per second)
  
  // Get the current URL as the referring site
  const refUrl = window.location.href;
  
  // Create a teleport effect
  const createTeleportEffect = () => {
    // Create teleport flash effect
    const flash = document.createElement('div');
    flash.style.position = 'fixed';
    flash.style.top = '0';
    flash.style.left = '0';
    flash.style.width = '100%';
    flash.style.height = '100%';
    flash.style.backgroundColor = '#00ff00';
    flash.style.opacity = '0';
    flash.style.transition = 'opacity 1s';
    flash.style.zIndex = '9999';
    flash.style.pointerEvents = 'none';
    document.body.appendChild(flash);
    
    // Trigger the flash animation
    setTimeout(() => {
      flash.style.opacity = '0.7';
      
      // Add teleportation message
      const message = document.createElement('div');
      message.style.position = 'fixed';
      message.style.top = '50%';
      message.style.left = '50%';
      message.style.transform = 'translate(-50%, -50%)';
      message.style.color = '#004d00';
      message.style.fontSize = '32px';
      message.style.fontWeight = 'bold';
      message.style.textAlign = 'center';
      message.style.fontFamily = 'Arial, sans-serif';
      message.innerText = 'Entering Vibeverse...';
      flash.appendChild(message);
      
      // Play teleport sound if available
      try {
        const soundManager = (window as any).soundManager;
        if (soundManager && typeof soundManager.play === 'function') {
          soundManager.play('teleport');
        }
      } catch (e) {
        console.log('Could not play teleport sound', e);
      }
      
      // Create hidden iframe to preload the destination
      if (!document.getElementById('preloadFrame')) {
        const iframe = document.createElement('iframe');
        iframe.id = 'preloadFrame';
        iframe.style.display = 'none';
        // Build the destination URL with query parameters
        const destinationUrl = `http://portal.pieter.com/?portal=true&username=${encodeURIComponent(playerName)}&color=${encodeURIComponent(playerColor)}&speed=${playerSpeed}&ref=${encodeURIComponent(refUrl)}`;
        iframe.src = destinationUrl;
        document.body.appendChild(iframe);
      }
      
      // Build the destination URL with query parameters
      const destinationUrl = `http://portal.pieter.com/?portal=true&username=${encodeURIComponent(playerName)}&color=${encodeURIComponent(playerColor)}&speed=${playerSpeed}&ref=${encodeURIComponent(refUrl)}`;
      
      // Redirect after the effect completes
      setTimeout(() => {
        window.location.href = destinationUrl;
      }, 1000);
    }, 10);
  };
  
  // Execute the effect
  createTeleportEffect();
}; 