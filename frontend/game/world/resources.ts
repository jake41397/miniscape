import * as THREE from 'three';

// Resource node types
export enum ResourceType {
  TREE = 'tree',
  ROCK = 'rock',
  FISH = 'fish',
  FISHING_SPOT = 'fishing_spot'
}

// World resource node
export interface ResourceNode {
  id: string;
  type: ResourceType | string; // Accept both string and enum types for compatibility with backend
  x: number;
  y: number;
  z: number;
  mesh?: THREE.Mesh;
  lodMeshes?: THREE.Object3D[]; // Array of LOD meshes
  state?: 'normal' | 'harvested'; // Track the visual state of the resource
  remainingResources?: number; // Track remaining resources before depletion
  metadata?: Record<string, any>; // Additional metadata for the resource
}

// Dropped item in the world
export interface WorldItem {
  dropId: string;
  itemType: string;
  x: number;
  y: number;
  z: number;
  mesh?: THREE.Mesh;
}

// LOD distance thresholds
const LOD_DISTANCES = [0, 15, 30]; // Near, medium, far

// Create a tree mesh with LOD support
export const createTreeMesh = (): THREE.Object3D => {
  // Create LOD container
  const treeLOD = new THREE.LOD();
  
  // High detail tree (Level 0 - closest)
  const highDetailGroup = new THREE.Group();
  const trunkGeometryHigh = new THREE.CylinderGeometry(0.5, 0.6, 3, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown
  const trunkHigh = new THREE.Mesh(trunkGeometryHigh, trunkMaterial);
  trunkHigh.position.y = 1.5; // Half height
  
  const leavesGeometryHigh = new THREE.SphereGeometry(2, 8, 8);
  const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x2E8B57 }); // Sea green
  const leavesHigh = new THREE.Mesh(leavesGeometryHigh, leavesMaterial);
  leavesHigh.position.y = 4; // Above trunk
  
  highDetailGroup.add(trunkHigh);
  highDetailGroup.add(leavesHigh);
  treeLOD.addLevel(highDetailGroup, LOD_DISTANCES[0]);
  
  // Medium detail tree (Level 1 - medium distance)
  const mediumDetailGroup = new THREE.Group();
  const trunkGeometryMed = new THREE.CylinderGeometry(0.5, 0.6, 3, 6);
  const trunkMed = new THREE.Mesh(trunkGeometryMed, trunkMaterial);
  trunkMed.position.y = 1.5;
  
  const leavesGeometryMed = new THREE.SphereGeometry(2, 6, 6);
  const leavesMed = new THREE.Mesh(leavesGeometryMed, leavesMaterial);
  leavesMed.position.y = 4;
  
  mediumDetailGroup.add(trunkMed);
  mediumDetailGroup.add(leavesMed);
  treeLOD.addLevel(mediumDetailGroup, LOD_DISTANCES[1]);
  
  // Low detail tree (Level 2 - far distance)
  const lowDetailGroup = new THREE.Group();
  const trunkGeometryLow = new THREE.CylinderGeometry(0.5, 0.6, 3, 4);
  const trunkLow = new THREE.Mesh(trunkGeometryLow, trunkMaterial);
  trunkLow.position.y = 1.5;
  
  const leavesGeometryLow = new THREE.SphereGeometry(2, 4, 4);
  const leavesLow = new THREE.Mesh(leavesGeometryLow, leavesMaterial);
  leavesLow.position.y = 4;
  
  lowDetailGroup.add(trunkLow);
  lowDetailGroup.add(leavesLow);
  treeLOD.addLevel(lowDetailGroup, LOD_DISTANCES[2]);
  
  return treeLOD;
};

// Create a rock mesh with LOD support
export const createRockMesh = (): THREE.Object3D => {
  const rockLOD = new THREE.LOD();
  
  // High detail rock (Level 0 - closest)
  const rockMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x696969, // Dark gray
    roughness: 0.8 
  });
  
  const rockGeometryHigh = new THREE.DodecahedronGeometry(1.5, 1);
  const rockHigh = new THREE.Mesh(rockGeometryHigh, rockMaterial);
  rockHigh.position.y = 0.75;
  rockLOD.addLevel(rockHigh, LOD_DISTANCES[0]);
  
  // Medium detail rock (Level 1 - medium distance)
  const rockGeometryMedium = new THREE.DodecahedronGeometry(1.5, 0);
  const rockMedium = new THREE.Mesh(rockGeometryMedium, rockMaterial);
  rockMedium.position.y = 0.75;
  rockLOD.addLevel(rockMedium, LOD_DISTANCES[1]);
  
  // Low detail rock (Level 2 - far distance)
  const rockGeometryLow = new THREE.IcosahedronGeometry(1.5, 0);
  const rockLow = new THREE.Mesh(rockGeometryLow, rockMaterial);
  rockLow.position.y = 0.75;
  rockLOD.addLevel(rockLow, LOD_DISTANCES[2]);
  
  return rockLOD;
};

// Create a fishing spot mesh
export const createFishingSpotMesh = (): THREE.Mesh => {
  // Create a simple cylinder with minimal height as requested
  const cylinderGeometry = new THREE.CylinderGeometry(2, 2, 0.05, 24);
  const cylinderMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x6495ED, // Cornflower blue
    transparent: true,
    opacity: 0.7,
    emissive: 0x3366CC,
    emissiveIntensity: 0.2
  });
  const mesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
  mesh.position.y = 0.025; // Half of height to place on ground
  
  // Make the mesh raycaster-friendly - critical for right-click detection
  mesh.userData.isInteractable = true;
  mesh.userData.isFishingSpot = true; // Additional marker for easy identification
  mesh.name = "fishing_spot"; // Add a consistent name for debugging
  
  // Add animate function to keep ripple effect
  (mesh as any).update = () => {
    const time = Date.now() * 0.001; // Convert to seconds
    // Subtle pulsing effect
    mesh.scale.set(
      1.0 + Math.sin(time * 2) * 0.1,
      1.0,
      1.0 + Math.sin(time * 2) * 0.1
    );
    
    // Update opacity for shimmering effect
    (mesh.material as THREE.MeshStandardMaterial).opacity = 0.5 + Math.sin(time * 2) * 0.2;
  };
  
  return mesh;
};

// Create a dropped item mesh
export const createItemMesh = (itemType: string): THREE.Mesh => {
  console.log(`%c 🔧 Creating item mesh for type: '${itemType}'`, "background:#FF9800; color: white; font-size: 14px;");
  
  if (!itemType) {
    console.error("Attempt to create item mesh with null or undefined itemType");
    itemType = "unknown";
  }
  
  let geometry;
  let material;
  let mesh;
  
  // Normalize itemType to lowercase for consistent handling
  const type = String(itemType).toLowerCase();
  console.log(`Normalized item type: '${type}'`);
  
  // Choose geometry and color based on item type
  switch (type) {
    case 'log':
    case 'wood':
    case 'logs':
      // Create a cylindrical log
      geometry = new THREE.CylinderGeometry(0.15, 0.15, 0.5, 8);
      material = new THREE.MeshStandardMaterial({
        color: 0x8B4513, // Brown
        roughness: 0.8,
        metalness: 0.1
      });
      mesh = new THREE.Mesh(geometry, material);
      // Rotate to look like a log lying on the ground
      mesh.rotation.x = Math.PI / 2;
      break;
      
    case 'coal':
    case 'coal_ore':
      // Create irregular rock-like shape for coal
      geometry = new THREE.DodecahedronGeometry(0.2, 0);
      material = new THREE.MeshStandardMaterial({
        color: 0x36454F, // Dark charcoal gray
        roughness: 0.9,
        metalness: 0.2,
        emissive: 0x222222,
        emissiveIntensity: 0.1
      });
      mesh = new THREE.Mesh(geometry, material);
      break;
      
    case 'fish':
    case 'raw_fish':
      // Create flattened ellipsoid for fish
      geometry = new THREE.SphereGeometry(0.2, 8, 8);
      // Flatten it a bit
      const positionAttribute = geometry.getAttribute('position');
      for (let i = 0; i < positionAttribute.count; i++) {
        const x = positionAttribute.getX(i);
        const y = positionAttribute.getY(i) * 0.5; // Scale y to flatten
        const z = positionAttribute.getZ(i) * 1.5; // Scale z to elongate
        positionAttribute.setXYZ(i, x, y, z);
      }
      geometry.computeVertexNormals();
      
      material = new THREE.MeshStandardMaterial({
        color: 0x6495ED, // Blue with a slight shimmer
        roughness: 0.3,
        metalness: 0.8
      });
      mesh = new THREE.Mesh(geometry, material);
      break;
      
    // Add more cases for other item types  
    case 'stone':
    case 'rock':
      geometry = new THREE.IcosahedronGeometry(0.2, 0);
      material = new THREE.MeshStandardMaterial({
        color: 0x808080, // Gray
        roughness: 0.9,
        metalness: 0.1
      });
      mesh = new THREE.Mesh(geometry, material);
      break;
      
    case 'berries':
    case 'berry':
      geometry = new THREE.SphereGeometry(0.1, 8, 8);
      material = new THREE.MeshStandardMaterial({
        color: 0xFF0000, // Red
        roughness: 0.2,
        metalness: 0.1,
        emissive: 0x330000,
        emissiveIntensity: 0.2
      });
      mesh = new THREE.Mesh(geometry, material);
      break;
      
    case 'bronze_pickaxe':
      // Create a pickaxe shape
      geometry = new THREE.BoxGeometry(0.1, 0.4, 0.1); // Handle
      material = new THREE.MeshStandardMaterial({
        color: 0x8B4513, // Brown for handle
        roughness: 0.8,
        metalness: 0.1
      });
      mesh = new THREE.Mesh(geometry, material);
      
      // Create pickaxe head
      const headGeometry = new THREE.ConeGeometry(0.12, 0.25, 4);
      const headMaterial = new THREE.MeshStandardMaterial({
        color: 0xCD7F32, // Bronze color
        roughness: 0.3,
        metalness: 0.7
      });
      const pickaxeHead = new THREE.Mesh(headGeometry, headMaterial);
      pickaxeHead.position.set(0, 0.2, 0);
      pickaxeHead.rotation.x = -Math.PI / 2;
      mesh.add(pickaxeHead);
      break;
      
    case 'bronze_axe':
      // Create an axe shape
      geometry = new THREE.BoxGeometry(0.1, 0.4, 0.1); // Handle
      material = new THREE.MeshStandardMaterial({
        color: 0x8B4513, // Brown for handle
        roughness: 0.8,
        metalness: 0.1
      });
      mesh = new THREE.Mesh(geometry, material);
      
      // Create axe head
      const axeHeadGeometry = new THREE.BoxGeometry(0.22, 0.22, 0.05);
      const axeHeadMaterial = new THREE.MeshStandardMaterial({
        color: 0xCD7F32, // Bronze color
        roughness: 0.3,
        metalness: 0.7
      });
      const axeHead = new THREE.Mesh(axeHeadGeometry, axeHeadMaterial);
      axeHead.position.set(0.1, 0.15, 0);
      mesh.add(axeHead);
      break;
      
    case 'item': // Handle generic "item" type that might come from SocketController
      // Bright box for generic item
      geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      material = new THREE.MeshStandardMaterial({
        color: 0xFFD700, // Gold
        emissive: 0xFFD700,
        emissiveIntensity: 0.2
      });
      mesh = new THREE.Mesh(geometry, material);
      break;
      
    default:
      console.warn(`Unknown item type '${itemType}', using default box`);
      // Default fallback - simple box
      geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      material = new THREE.MeshStandardMaterial({
        color: 0xCC44CC, // Bright purple for visibility
        emissive: 0xCC44CC,
        emissiveIntensity: 0.2
      });
      mesh = new THREE.Mesh(geometry, material);
  }
  
  // Position slightly above ground to avoid z-fighting
  mesh.position.y = 0.25; 
  
  // Add animation properties - CRITICAL - This is what makes items animate and hover
  // Ensure these are always set to prevent static meshes
  mesh.userData.animateY = true; // MUST be set to enable animation
  mesh.userData.baseY = mesh.position.y;
  mesh.userData.phase = Math.random() * Math.PI * 2; // Random phase for varied motion
  mesh.userData.rotationSpeed = (Math.random() * 0.3) + 0.2; // Random rotation speed
  
  // Set shadow casting
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  
  console.log(`%c ✅ Created mesh for '${itemType}' at position y: ${mesh.position.y}`, "color: #4CAF50;");
  console.log(`%c ✅ Animation properties set: animateY=${mesh.userData.animateY}, baseY=${mesh.userData.baseY}`, "color: #4CAF50;");
  return mesh;
};

// Create a tree stump mesh (harvested tree)
export const createTreeStumpMesh = (): THREE.Object3D => {
  // Create stump with a simple cylinder
  const stumpGeometry = new THREE.CylinderGeometry(0.5, 0.6, 0.5, 8);
  const stumpMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown
  const stump = new THREE.Mesh(stumpGeometry, stumpMaterial);
  stump.position.y = 0.25; // Half of height
  
  // Add some wood chips/sawdust around the base
  const chipsGroup = new THREE.Group();
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    const radius = 0.8 + Math.random() * 0.3;
    const chipGeometry = new THREE.BoxGeometry(0.1, 0.05, 0.2);
    const chipMaterial = new THREE.MeshStandardMaterial({ 
      color: 0xA0522D, // Sienna brown
      roughness: 0.9
    });
    const chip = new THREE.Mesh(chipGeometry, chipMaterial);
    chip.position.set(
      Math.cos(angle) * radius, 
      0.025, // Just above ground
      Math.sin(angle) * radius
    );
    chip.rotation.y = Math.random() * Math.PI;
    chipsGroup.add(chip);
  }
  
  // Create a group with both the stump and the chips
  const stumpGroup = new THREE.Group();
  stumpGroup.add(stump);
  stumpGroup.add(chipsGroup);
  
  return stumpGroup;
};

// Create a depleted coal deposit (harvested rock)
export const createDepletedRockMesh = (): THREE.Object3D => {
  // Create a group of smaller rocks
  const rocksGroup = new THREE.Group();
  
  const rockMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x696969, // Dark gray
    roughness: 0.8 
  });
  
  // Add several smaller boulders
  for (let i = 0; i < 5; i++) {
    const size = 0.4 + Math.random() * 0.3;
    const rockGeometry = new THREE.DodecahedronGeometry(size, 0);
    const rock = new THREE.Mesh(rockGeometry, rockMaterial);
    
    // Position rocks in a rough circle
    const angle = (i / 5) * Math.PI * 2;
    const radius = 0.7;
    rock.position.set(
      Math.cos(angle) * radius, 
      size / 2, // Half height
      Math.sin(angle) * radius
    );
    
    // Add some random rotation
    rock.rotation.set(
      Math.random() * Math.PI,
      Math.random() * Math.PI,
      Math.random() * Math.PI
    );
    
    rocksGroup.add(rock);
  }
  
  // Add some coal pieces on the ground
  for (let i = 0; i < 3; i++) {
    const coalGeometry = new THREE.DodecahedronGeometry(0.15, 0);
    const coalMaterial = new THREE.MeshStandardMaterial({
      color: 0x36454F, // Dark charcoal gray
      roughness: 0.9,
      metalness: 0.2
    });
    const coal = new THREE.Mesh(coalGeometry, coalMaterial);
    
    // Position coal bits randomly around the rocks
    const angle = Math.random() * Math.PI * 2;
    const radius = 0.5 + Math.random() * 0.7;
    coal.position.set(
      Math.cos(angle) * radius, 
      0.075, // Just above ground
      Math.sin(angle) * radius
    );
    
    rocksGroup.add(coal);
  }
  
  return rocksGroup;
};

// Update LOD based on camera position
export const updateResourceLOD = (resources: ResourceNode[], camera: THREE.Camera) => {
  resources.forEach(resource => {
    if (resource.mesh && resource.mesh instanceof THREE.LOD) {
      resource.mesh.update(camera);
    }
  });
};

// Update dropped items animation (call in animation loop)
export const updateDroppedItems = (items: WorldItem[], deltaTime: number) => {
  const time = Date.now() / 1000;
  
  items.forEach(item => {
    if (item.mesh && item.mesh.userData.animateY) {
      // Make it hover up and down slightly
      const phase = item.mesh.userData.phase || 0;
      const baseY = item.mesh.userData.baseY || 0.25;
      
      // More dynamic hover animation with variable height based on item type
      let hoverHeight = 0.1; // Default hover height
      
      // Adjust hover height based on item type
      if (item.itemType === 'fish') {
        hoverHeight = 0.15; // Fish bob more in "water"
      } else if (item.itemType === 'log') {
        hoverHeight = 0.07; // Logs hover less
      }
      
      item.mesh.position.y = baseY + Math.sin(time * 1.5 + phase) * hoverHeight;
      
      // Rotate items with their custom rotation speed
      const rotationSpeed = item.mesh.userData.rotationSpeed || 0.5;
      
      // Different rotation based on item type
      if (item.itemType === 'log') {
        // Logs roll around their length
        item.mesh.rotation.z += deltaTime * rotationSpeed * 0.3;
      } else if (item.itemType === 'fish') {
        // Fish wiggle side to side
        item.mesh.rotation.y = Math.sin(time * 3 + phase) * 0.3;
        // And slightly up and down
        item.mesh.rotation.x = Math.sin(time * 2 + phase) * 0.1;
      } else {
        // Default rotation for other items
        item.mesh.rotation.y += deltaTime * rotationSpeed;
      }
    }
  });
};

// Create tree meshes for different types
export const createNormalTreeMesh = (): THREE.Object3D => {
  const treeLOD = new THREE.LOD();
  
  // Basic tree - smaller with green leaves
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown
  const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x2E8B57 }); // Sea green
  
  // High detail
  const highDetailGroup = new THREE.Group();
  const trunkGeometryHigh = new THREE.CylinderGeometry(0.4, 0.5, 2.5, 8);
  const trunkHigh = new THREE.Mesh(trunkGeometryHigh, trunkMaterial);
  trunkHigh.position.y = 1.25;
  
  const leavesGeometryHigh = new THREE.SphereGeometry(1.5, 8, 8);
  const leavesHigh = new THREE.Mesh(leavesGeometryHigh, leavesMaterial);
  leavesHigh.position.y = 3;
  
  highDetailGroup.add(trunkHigh);
  highDetailGroup.add(leavesHigh);
  treeLOD.addLevel(highDetailGroup, LOD_DISTANCES[0]);
  
  // Medium detail
  const mediumDetailGroup = new THREE.Group();
  const trunkGeometryMed = new THREE.CylinderGeometry(0.4, 0.5, 2.5, 6);
  const trunkMed = new THREE.Mesh(trunkGeometryMed, trunkMaterial);
  trunkMed.position.y = 1.25;
  
  const leavesGeometryMed = new THREE.SphereGeometry(1.5, 6, 6);
  const leavesMed = new THREE.Mesh(leavesGeometryMed, leavesMaterial);
  leavesMed.position.y = 3;
  
  mediumDetailGroup.add(trunkMed);
  mediumDetailGroup.add(leavesMed);
  treeLOD.addLevel(mediumDetailGroup, LOD_DISTANCES[1]);
  
  // Low detail
  const lowDetailGroup = new THREE.Group();
  const trunkGeometryLow = new THREE.CylinderGeometry(0.4, 0.5, 2.5, 4);
  const trunkLow = new THREE.Mesh(trunkGeometryLow, trunkMaterial);
  trunkLow.position.y = 1.25;
  
  const leavesGeometryLow = new THREE.SphereGeometry(1.5, 4, 4);
  const leavesLow = new THREE.Mesh(leavesGeometryLow, leavesMaterial);
  leavesLow.position.y = 3;
  
  lowDetailGroup.add(trunkLow);
  lowDetailGroup.add(leavesLow);
  treeLOD.addLevel(lowDetailGroup, LOD_DISTANCES[2]);
  
  return treeLOD;
};

export const createOakTreeMesh = (): THREE.Object3D => {
  const treeLOD = new THREE.LOD();
  
  // Oak tree - thicker trunk with darker green leaves
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x654321 }); // Darker brown
  const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x006400 }); // Dark green
  
  // High detail
  const highDetailGroup = new THREE.Group();
  const trunkGeometryHigh = new THREE.CylinderGeometry(0.6, 0.8, 3.5, 8);
  const trunkHigh = new THREE.Mesh(trunkGeometryHigh, trunkMaterial);
  trunkHigh.position.y = 1.75;
  
  const leavesGeometryHigh = new THREE.SphereGeometry(2.2, 8, 8);
  const leavesHigh = new THREE.Mesh(leavesGeometryHigh, leavesMaterial);
  leavesHigh.position.y = 4.5;
  
  highDetailGroup.add(trunkHigh);
  highDetailGroup.add(leavesHigh);
  treeLOD.addLevel(highDetailGroup, LOD_DISTANCES[0]);
  
  // Medium detail
  const mediumDetailGroup = new THREE.Group();
  const trunkGeometryMed = new THREE.CylinderGeometry(0.6, 0.8, 3.5, 6);
  const trunkMed = new THREE.Mesh(trunkGeometryMed, trunkMaterial);
  trunkMed.position.y = 1.75;
  
  const leavesGeometryMed = new THREE.SphereGeometry(2.2, 6, 6);
  const leavesMed = new THREE.Mesh(leavesGeometryMed, leavesMaterial);
  leavesMed.position.y = 4.5;
  
  mediumDetailGroup.add(trunkMed);
  mediumDetailGroup.add(leavesMed);
  treeLOD.addLevel(mediumDetailGroup, LOD_DISTANCES[1]);
  
  // Low detail
  const lowDetailGroup = new THREE.Group();
  const trunkGeometryLow = new THREE.CylinderGeometry(0.6, 0.8, 3.5, 4);
  const trunkLow = new THREE.Mesh(trunkGeometryLow, trunkMaterial);
  trunkLow.position.y = 1.75;
  
  const leavesGeometryLow = new THREE.SphereGeometry(2.2, 4, 4);
  const leavesLow = new THREE.Mesh(leavesGeometryLow, leavesMaterial);
  leavesLow.position.y = 4.5;
  
  lowDetailGroup.add(trunkLow);
  lowDetailGroup.add(leavesLow);
  treeLOD.addLevel(lowDetailGroup, LOD_DISTANCES[2]);
  
  return treeLOD;
};

export const createWillowTreeMesh = (): THREE.Object3D => {
  const treeLOD = new THREE.LOD();
  
  // Willow tree - slender with drooping leaves
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B7355 }); // Light brown
  const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x7CFC00 }); // Light green
  
  // High detail
  const highDetailGroup = new THREE.Group();
  const trunkGeometryHigh = new THREE.CylinderGeometry(0.4, 0.6, 4, 8);
  const trunkHigh = new THREE.Mesh(trunkGeometryHigh, trunkMaterial);
  trunkHigh.position.y = 2;
  
  // Create droopy leaves effect with multiple spheres
  const leavesGroup = new THREE.Group();
  
  const mainLeavesGeometryHigh = new THREE.SphereGeometry(2, 8, 8);
  const mainLeavesHigh = new THREE.Mesh(mainLeavesGeometryHigh, leavesMaterial);
  mainLeavesHigh.position.y = 5;
  mainLeavesHigh.scale.y = 0.7; // Flatten slightly
  
  // Add drooping leaves parts
  for (let i = 0; i < 5; i++) {
    const angle = (i / 5) * Math.PI * 2;
    const droop = new THREE.Mesh(
      new THREE.SphereGeometry(0.7, 6, 6),
      leavesMaterial
    );
    droop.position.set(
      Math.cos(angle) * 1.8,
      4 - Math.random() * 1.5,
      Math.sin(angle) * 1.8
    );
    droop.scale.y = 1.5 + Math.random();
    leavesGroup.add(droop);
  }
  
  leavesGroup.add(mainLeavesHigh);
  highDetailGroup.add(trunkHigh);
  highDetailGroup.add(leavesGroup);
  treeLOD.addLevel(highDetailGroup, LOD_DISTANCES[0]);
  
  // Medium detail - simplified
  const mediumDetailGroup = new THREE.Group();
  const trunkGeometryMed = new THREE.CylinderGeometry(0.4, 0.6, 4, 6);
  const trunkMed = new THREE.Mesh(trunkGeometryMed, trunkMaterial);
  trunkMed.position.y = 2;
  
  const mainLeavesMed = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 6, 6),
    leavesMaterial
  );
  mainLeavesMed.position.y = 4.5;
  mainLeavesMed.scale.y = 0.8;
  
  mediumDetailGroup.add(trunkMed);
  mediumDetailGroup.add(mainLeavesMed);
  treeLOD.addLevel(mediumDetailGroup, LOD_DISTANCES[1]);
  
  // Low detail - very simplified
  const lowDetailGroup = new THREE.Group();
  const trunkGeometryLow = new THREE.CylinderGeometry(0.4, 0.6, 4, 4);
  const trunkLow = new THREE.Mesh(trunkGeometryLow, trunkMaterial);
  trunkLow.position.y = 2;
  
  const mainLeavesLow = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 4, 4),
    leavesMaterial
  );
  mainLeavesLow.position.y = 4.5;
  mainLeavesLow.scale.y = 0.8;
  
  lowDetailGroup.add(trunkLow);
  lowDetailGroup.add(mainLeavesLow);
  treeLOD.addLevel(lowDetailGroup, LOD_DISTANCES[2]);
  
  return treeLOD;
};

export const createMapleTreeMesh = (): THREE.Object3D => {
  const treeLOD = new THREE.LOD();
  
  // Maple tree - thick trunk with orange-red leaves
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x5D4037 }); // Very dark brown
  const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0xFF5722 }); // Orange-red
  
  // High detail
  const highDetailGroup = new THREE.Group();
  const trunkGeometryHigh = new THREE.CylinderGeometry(0.7, 0.9, 4, 8);
  const trunkHigh = new THREE.Mesh(trunkGeometryHigh, trunkMaterial);
  trunkHigh.position.y = 2;
  
  // Create maple leaf shape using multiple spheres
  const leavesGroup = new THREE.Group();
  
  const mainLeavesGeometryHigh = new THREE.SphereGeometry(2.5, 8, 8);
  const mainLeavesHigh = new THREE.Mesh(mainLeavesGeometryHigh, leavesMaterial);
  mainLeavesHigh.position.y = 5;
  
  leavesGroup.add(mainLeavesHigh);
  highDetailGroup.add(trunkHigh);
  highDetailGroup.add(leavesGroup);
  treeLOD.addLevel(highDetailGroup, LOD_DISTANCES[0]);
  
  // Medium detail
  const mediumDetailGroup = new THREE.Group();
  const trunkGeometryMed = new THREE.CylinderGeometry(0.7, 0.9, 4, 6);
  const trunkMed = new THREE.Mesh(trunkGeometryMed, trunkMaterial);
  trunkMed.position.y = 2;
  
  const mainLeavesMed = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 6, 6),
    leavesMaterial
  );
  mainLeavesMed.position.y = 5;
  
  mediumDetailGroup.add(trunkMed);
  mediumDetailGroup.add(mainLeavesMed);
  treeLOD.addLevel(mediumDetailGroup, LOD_DISTANCES[1]);
  
  // Low detail
  const lowDetailGroup = new THREE.Group();
  const trunkGeometryLow = new THREE.CylinderGeometry(0.7, 0.9, 4, 4);
  const trunkLow = new THREE.Mesh(trunkGeometryLow, trunkMaterial);
  trunkLow.position.y = 2;
  
  const mainLeavesLow = new THREE.Mesh(
    new THREE.SphereGeometry(2.5, 4, 4),
    leavesMaterial
  );
  mainLeavesLow.position.y = 5;
  
  lowDetailGroup.add(trunkLow);
  lowDetailGroup.add(mainLeavesLow);
  treeLOD.addLevel(lowDetailGroup, LOD_DISTANCES[2]);
  
  return treeLOD;
};

export const createYewTreeMesh = (): THREE.Object3D => {
  const treeLOD = new THREE.LOD();
  
  // Yew tree - wide, imposing with dark red bark and very dark green leaves
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x3E2723 }); // Very dark red-brown
  const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x004D40 }); // Very dark green
  
  // High detail
  const highDetailGroup = new THREE.Group();
  const trunkGeometryHigh = new THREE.CylinderGeometry(1, 1.2, 5, 8);
  const trunkHigh = new THREE.Mesh(trunkGeometryHigh, trunkMaterial);
  trunkHigh.position.y = 2.5;
  
  // Create wide, intimidating foliage
  const leavesGroup = new THREE.Group();
  
  const mainLeavesGeometryHigh = new THREE.SphereGeometry(3.5, 8, 8);
  const mainLeavesHigh = new THREE.Mesh(mainLeavesGeometryHigh, leavesMaterial);
  mainLeavesHigh.position.y = 6;
  mainLeavesHigh.scale.y = 0.8; // Flatten slightly for wider look
  
  leavesGroup.add(mainLeavesHigh);
  highDetailGroup.add(trunkHigh);
  highDetailGroup.add(leavesGroup);
  treeLOD.addLevel(highDetailGroup, LOD_DISTANCES[0]);
  
  // Medium detail
  const mediumDetailGroup = new THREE.Group();
  const trunkGeometryMed = new THREE.CylinderGeometry(1, 1.2, 5, 6);
  const trunkMed = new THREE.Mesh(trunkGeometryMed, trunkMaterial);
  trunkMed.position.y = 2.5;
  
  const mainLeavesMed = new THREE.Mesh(
    new THREE.SphereGeometry(3.5, 6, 6),
    leavesMaterial
  );
  mainLeavesMed.position.y = 6;
  mainLeavesMed.scale.y = 0.8;
  
  mediumDetailGroup.add(trunkMed);
  mediumDetailGroup.add(mainLeavesMed);
  treeLOD.addLevel(mediumDetailGroup, LOD_DISTANCES[1]);
  
  // Low detail
  const lowDetailGroup = new THREE.Group();
  const trunkGeometryLow = new THREE.CylinderGeometry(1, 1.2, 5, 4);
  const trunkLow = new THREE.Mesh(trunkGeometryLow, trunkMaterial);
  trunkLow.position.y = 2.5;
  
  const mainLeavesLow = new THREE.Mesh(
    new THREE.SphereGeometry(3.5, 4, 4),
    leavesMaterial
  );
  mainLeavesLow.position.y = 6;
  mainLeavesLow.scale.y = 0.8;
  
  lowDetailGroup.add(trunkLow);
  lowDetailGroup.add(mainLeavesLow);
  treeLOD.addLevel(lowDetailGroup, LOD_DISTANCES[2]);
  
  return treeLOD;
};

// Rock mesh types
export const createCopperRockMesh = (): THREE.Object3D => {
  const rockLOD = new THREE.LOD();
  
  // Copper rock - brownish-orange color
  const rockMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xB87333, // Copper color
    roughness: 0.8, 
    metalness: 0.2
  });
  
  // Add some metallic flecks/veins
  const flecksMaterial = new THREE.MeshStandardMaterial({
    color: 0xD2691E, // Orange-copper
    metalness: 0.5,
    roughness: 0.5
  });
  
  // High detail rock
  const highDetailGroup = new THREE.Group();
  const rockGeometryHigh = new THREE.DodecahedronGeometry(1.2, 1);
  const rockHigh = new THREE.Mesh(rockGeometryHigh, rockMaterial);
  
  // Add copper veins
  const veinsGeometry = new THREE.SphereGeometry(0.2, 4, 4);
  for (let i = 0; i < 5; i++) {
    const vein = new THREE.Mesh(veinsGeometry, flecksMaterial);
    vein.position.set(
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 1.5,
      (Math.random() - 0.5) * 1.5
    );
    vein.scale.set(
      Math.random() * 0.5 + 0.5,
      Math.random() * 0.5 + 0.5,
      Math.random() * 0.5 + 0.3
    );
    rockHigh.add(vein);
  }
  
  rockHigh.position.y = 0.6;
  highDetailGroup.add(rockHigh);
  rockLOD.addLevel(highDetailGroup, LOD_DISTANCES[0]);
  
  // Medium detail
  const mediumDetailGroup = new THREE.Group();
  const rockGeometryMedium = new THREE.DodecahedronGeometry(1.2, 0);
  const rockMedium = new THREE.Mesh(rockGeometryMedium, rockMaterial);
  rockMedium.position.y = 0.6;
  mediumDetailGroup.add(rockMedium);
  rockLOD.addLevel(mediumDetailGroup, LOD_DISTANCES[1]);
  
  // Low detail
  const lowDetailGroup = new THREE.Group();
  const rockGeometryLow = new THREE.DodecahedronGeometry(1.2, 0);
  const rockLow = new THREE.Mesh(rockGeometryLow, rockMaterial);
  rockLow.position.y = 0.6;
  lowDetailGroup.add(rockLow);
  rockLOD.addLevel(lowDetailGroup, LOD_DISTANCES[2]);
  
  return rockLOD;
};

export const createTinRockMesh = (): THREE.Object3D => {
  const rockLOD = new THREE.LOD();
  
  // Tin rock - lighter gray with bluish tinge
  const rockMaterial = new THREE.MeshStandardMaterial({ 
    color: 0xA7B8C0, // Light blueish gray
    roughness: 0.6, 
    metalness: 0.3
  });
  
  // High detail rock
  const highDetailGroup = new THREE.Group();
  const rockGeometryHigh = new THREE.DodecahedronGeometry(1.1, 1);
  const rockHigh = new THREE.Mesh(rockGeometryHigh, rockMaterial);
  rockHigh.position.y = 0.55;
  highDetailGroup.add(rockHigh);
  rockLOD.addLevel(highDetailGroup, LOD_DISTANCES[0]);
  
  // Medium detail
  const mediumDetailGroup = new THREE.Group();
  const rockGeometryMedium = new THREE.DodecahedronGeometry(1.1, 0);
  const rockMedium = new THREE.Mesh(rockGeometryMedium, rockMaterial);
  rockMedium.position.y = 0.55;
  mediumDetailGroup.add(rockMedium);
  rockLOD.addLevel(mediumDetailGroup, LOD_DISTANCES[1]);
  
  // Low detail
  const lowDetailGroup = new THREE.Group();
  const rockGeometryLow = new THREE.DodecahedronGeometry(1.1, 0);
  const rockLow = new THREE.Mesh(rockGeometryLow, rockMaterial);
  rockLow.position.y = 0.55;
  lowDetailGroup.add(rockLow);
  rockLOD.addLevel(lowDetailGroup, LOD_DISTANCES[2]);
  
  return rockLOD;
};

export const createIronRockMesh = (): THREE.Object3D => {
  const rockLOD = new THREE.LOD();
  
  // Iron rock - reddish-brown color
  const rockMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x8B4513, // Reddish-brown
    roughness: 0.9, 
    metalness: 0.4
  });
  
  // Add some rust-colored patches
  const rustMaterial = new THREE.MeshStandardMaterial({
    color: 0x8B0000, // Dark red
    metalness: 0.2,
    roughness: 0.8
  });
  
  // High detail rock
  const highDetailGroup = new THREE.Group();
  const rockGeometryHigh = new THREE.DodecahedronGeometry(1.3, 1);
  const rockHigh = new THREE.Mesh(rockGeometryHigh, rockMaterial);
  
  // Add rust patches
  const rustGeometry = new THREE.SphereGeometry(0.3, 4, 4);
  for (let i = 0; i < 3; i++) {
    const rustPatch = new THREE.Mesh(rustGeometry, rustMaterial);
    rustPatch.position.set(
      (Math.random() - 0.5) * 1.8,
      (Math.random() - 0.5) * 1.8,
      (Math.random() - 0.5) * 1.8
    );
    rustPatch.scale.set(
      Math.random() * 0.5 + 0.5,
      Math.random() * 0.5 + 0.2,
      Math.random() * 0.5 + 0.5
    );
    rockHigh.add(rustPatch);
  }
  
  rockHigh.position.y = 0.65;
  highDetailGroup.add(rockHigh);
  rockLOD.addLevel(highDetailGroup, LOD_DISTANCES[0]);
  
  // Medium detail
  const mediumDetailGroup = new THREE.Group();
  const rockGeometryMedium = new THREE.DodecahedronGeometry(1.3, 0);
  const rockMedium = new THREE.Mesh(rockGeometryMedium, rockMaterial);
  rockMedium.position.y = 0.65;
  mediumDetailGroup.add(rockMedium);
  rockLOD.addLevel(mediumDetailGroup, LOD_DISTANCES[1]);
  
  // Low detail
  const lowDetailGroup = new THREE.Group();
  const rockGeometryLow = new THREE.DodecahedronGeometry(1.3, 0);
  const rockLow = new THREE.Mesh(rockGeometryLow, rockMaterial);
  rockLow.position.y = 0.65;
  lowDetailGroup.add(rockLow);
  rockLOD.addLevel(lowDetailGroup, LOD_DISTANCES[2]);
  
  return rockLOD;
};

export const createCoalRockMesh = (): THREE.Object3D => {
  const rockLOD = new THREE.LOD();
  
  // Coal rock - very dark with slight shine
  const rockMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x1C1C1C, // Almost black
    roughness: 0.7, 
    metalness: 0.3
  });
  
  // High detail rock
  const highDetailGroup = new THREE.Group();
  const rockGeometryHigh = new THREE.DodecahedronGeometry(1.2, 1);
  const rockHigh = new THREE.Mesh(rockGeometryHigh, rockMaterial);
  rockHigh.position.y = 0.6;
  highDetailGroup.add(rockHigh);
  rockLOD.addLevel(highDetailGroup, LOD_DISTANCES[0]);
  
  // Medium detail
  const mediumDetailGroup = new THREE.Group();
  const rockGeometryMedium = new THREE.DodecahedronGeometry(1.2, 0);
  const rockMedium = new THREE.Mesh(rockGeometryMedium, rockMaterial);
  rockMedium.position.y = 0.6;
  mediumDetailGroup.add(rockMedium);
  rockLOD.addLevel(mediumDetailGroup, LOD_DISTANCES[1]);
  
  // Low detail
  const lowDetailGroup = new THREE.Group();
  const rockGeometryLow = new THREE.DodecahedronGeometry(1.2, 0);
  const rockLow = new THREE.Mesh(rockGeometryLow, rockMaterial);
  rockLow.position.y = 0.6;
  lowDetailGroup.add(rockLow);
  rockLOD.addLevel(lowDetailGroup, LOD_DISTANCES[2]);
  
  return rockLOD;
};

export const createGoldRockMesh = (): THREE.Object3D => {
  const rockLOD = new THREE.LOD();
  
  // Regular rock material
  const rockMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x777777, // Gray
    roughness: 0.8,
    metalness: 0.2
  });
  
  // Gold flecks/veins material
  const goldMaterial = new THREE.MeshStandardMaterial({
    color: 0xFFD700, // Gold
    metalness: 0.9,
    roughness: 0.3
  });
  
  // High detail rock
  const highDetailGroup = new THREE.Group();
  const rockGeometryHigh = new THREE.DodecahedronGeometry(1.4, 1);
  const rockHigh = new THREE.Mesh(rockGeometryHigh, rockMaterial);
  
  // Add gold veins
  const veinsGeometry = new THREE.SphereGeometry(0.2, 4, 4);
  for (let i = 0; i < 8; i++) {
    const goldVein = new THREE.Mesh(veinsGeometry, goldMaterial);
    goldVein.position.set(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    );
    goldVein.scale.set(
      Math.random() * 0.5 + 0.2,
      Math.random() * 0.5 + 0.2,
      Math.random() * 0.5 + 0.2
    );
    rockHigh.add(goldVein);
  }
  
  rockHigh.position.y = 0.7;
  highDetailGroup.add(rockHigh);
  rockLOD.addLevel(highDetailGroup, LOD_DISTANCES[0]);
  
  // Medium detail - with simplified gold flecks
  const mediumDetailGroup = new THREE.Group();
  const rockGeometryMedium = new THREE.DodecahedronGeometry(1.4, 0);
  const rockMedium = new THREE.Mesh(rockGeometryMedium, rockMaterial);
  
  // Add fewer gold veins for medium distance
  for (let i = 0; i < 4; i++) {
    const goldVein = new THREE.Mesh(veinsGeometry, goldMaterial);
    goldVein.position.set(
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2,
      (Math.random() - 0.5) * 2
    );
    goldVein.scale.set(
      Math.random() * 0.5 + 0.3,
      Math.random() * 0.5 + 0.3,
      Math.random() * 0.5 + 0.3
    );
    rockMedium.add(goldVein);
  }
  
  rockMedium.position.y = 0.7;
  mediumDetailGroup.add(rockMedium);
  rockLOD.addLevel(mediumDetailGroup, LOD_DISTANCES[1]);
  
  // Low detail - just basic shape with gold color tint
  const lowDetailGroup = new THREE.Group();
  const rockGeometryLow = new THREE.DodecahedronGeometry(1.4, 0);
  
  // For low detail, use a blended material
  const blendedMaterial = new THREE.MeshStandardMaterial({
    color: 0x998866, // Gray with gold tint
    metalness: 0.4,
    roughness: 0.7
  });
  
  const rockLow = new THREE.Mesh(rockGeometryLow, blendedMaterial);
  rockLow.position.y = 0.7;
  lowDetailGroup.add(rockLow);
  rockLOD.addLevel(lowDetailGroup, LOD_DISTANCES[2]);
  
  return rockLOD;
};

export const createMithrilRockMesh = (): THREE.Object3D => {
  const rockLOD = new THREE.LOD();
  
  // Mithril material with brilliant blue-gray hue
  const mithrilMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x6F8FAF, // Steel blue color
    metalness: 0.8,
    roughness: 0.3,
    emissive: 0x2C3E50,
    emissiveIntensity: 0.1
  });
  
  // High detail mithril rock (Level 0 - closest)
  const rockGeometryHigh = new THREE.DodecahedronGeometry(1.5, 2);
  const rockHigh = new THREE.Mesh(rockGeometryHigh, mithrilMaterial);
  rockHigh.position.y = 0.75;
  rockLOD.addLevel(rockHigh, LOD_DISTANCES[0]);
  
  // Medium detail mithril rock (Level 1 - medium distance)
  const rockGeometryMedium = new THREE.DodecahedronGeometry(1.5, 1);
  const rockMedium = new THREE.Mesh(rockGeometryMedium, mithrilMaterial);
  rockMedium.position.y = 0.75;
  rockLOD.addLevel(rockMedium, LOD_DISTANCES[1]);
  
  // Low detail mithril rock (Level 2 - far distance)
  const rockGeometryLow = new THREE.DodecahedronGeometry(1.5, 0);
  const rockLow = new THREE.Mesh(rockGeometryLow, mithrilMaterial);
  rockLow.position.y = 0.75;
  rockLOD.addLevel(rockLow, LOD_DISTANCES[2]);
  
  return rockLOD;
};

// Create an adamantite rock mesh with LOD support
export const createAdamantiteRockMesh = (): THREE.Object3D => {
  const rockLOD = new THREE.LOD();
  
  // Adamantite material with green hue and metallic properties
  const adamantiteMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x3CB371, // Medium sea green
    metalness: 0.9,
    roughness: 0.2,
    emissive: 0x255146,
    emissiveIntensity: 0.2
  });
  
  // High detail adamantite rock (Level 0 - closest)
  const rockGeometryHigh = new THREE.DodecahedronGeometry(1.6, 2);
  const rockHigh = new THREE.Mesh(rockGeometryHigh, adamantiteMaterial);
  rockHigh.position.y = 0.8;
  rockLOD.addLevel(rockHigh, LOD_DISTANCES[0]);
  
  // Medium detail adamantite rock (Level 1 - medium distance)
  const rockGeometryMedium = new THREE.DodecahedronGeometry(1.6, 1);
  const rockMedium = new THREE.Mesh(rockGeometryMedium, adamantiteMaterial);
  rockMedium.position.y = 0.8;
  rockLOD.addLevel(rockMedium, LOD_DISTANCES[1]);
  
  // Low detail adamantite rock (Level 2 - far distance)
  const rockGeometryLow = new THREE.DodecahedronGeometry(1.6, 0);
  const rockLow = new THREE.Mesh(rockGeometryLow, adamantiteMaterial);
  rockLow.position.y = 0.8;
  rockLOD.addLevel(rockLow, LOD_DISTANCES[2]);
  
  return rockLOD;
};

// Create a runite rock mesh with LOD support
export const createRuniteRockMesh = (): THREE.Object3D => {
  const rockLOD = new THREE.LOD();
  
  // Runite material with distinctive blue color and high metallic properties
  const runiteMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x4169E1, // Royal blue
    metalness: 1.0,
    roughness: 0.1,
    emissive: 0x1E3A8A,
    emissiveIntensity: 0.3
  });
  
  // High detail runite rock (Level 0 - closest)
  const rockGeometryHigh = new THREE.DodecahedronGeometry(1.7, 3);
  const rockHigh = new THREE.Mesh(rockGeometryHigh, runiteMaterial);
  rockHigh.position.y = 0.85;
  rockLOD.addLevel(rockHigh, LOD_DISTANCES[0]);
  
  // Medium detail runite rock (Level 1 - medium distance)
  const rockGeometryMedium = new THREE.DodecahedronGeometry(1.7, 2);
  const rockMedium = new THREE.Mesh(rockGeometryMedium, runiteMaterial);
  rockMedium.position.y = 0.85;
  rockLOD.addLevel(rockMedium, LOD_DISTANCES[1]);
  
  // Low detail runite rock (Level 2 - far distance)
  const rockGeometryLow = new THREE.DodecahedronGeometry(1.7, 1);
  const rockLow = new THREE.Mesh(rockGeometryLow, runiteMaterial);
  rockLow.position.y = 0.85;
  rockLOD.addLevel(rockLow, LOD_DISTANCES[2]);
  
  return rockLOD;
};

// Create a magic tree mesh with LOD support
export const createMagicTreeMesh = (): THREE.Object3D => {
  // Create LOD container
  const treeLOD = new THREE.LOD();
  
  // High detail magic tree (Level 0 - closest)
  const highDetailGroup = new THREE.Group();
  
  // Trunk with a dark, rich color
  const trunkGeometryHigh = new THREE.CylinderGeometry(0.6, 0.7, 4, 10);
  const trunkMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x301934, // Dark purple
    roughness: 0.7,
    metalness: 0.1
  });
  const trunkHigh = new THREE.Mesh(trunkGeometryHigh, trunkMaterial);
  trunkHigh.position.y = 2.0; // Half height
  
  // Magical glowing leaves
  const leavesGeometryHigh = new THREE.SphereGeometry(3, 10, 10);
  const leavesMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x9370DB, // Medium purple
    roughness: 0.3,
    metalness: 0.2,
    emissive: 0x8A2BE2, // Blueviolet
    emissiveIntensity: 0.3
  });
  const leavesHigh = new THREE.Mesh(leavesGeometryHigh, leavesMaterial);
  leavesHigh.position.y = 5.5; // Above trunk
  
  highDetailGroup.add(trunkHigh);
  highDetailGroup.add(leavesHigh);
  treeLOD.addLevel(highDetailGroup, LOD_DISTANCES[0]);
  
  // Medium detail magic tree (Level 1 - medium distance)
  const mediumDetailGroup = new THREE.Group();
  const trunkGeometryMed = new THREE.CylinderGeometry(0.6, 0.7, 4, 8);
  const trunkMed = new THREE.Mesh(trunkGeometryMed, trunkMaterial);
  trunkMed.position.y = 2.0;
  
  const leavesGeometryMed = new THREE.SphereGeometry(3, 8, 8);
  const leavesMed = new THREE.Mesh(leavesGeometryMed, leavesMaterial);
  leavesMed.position.y = 5.5;
  
  mediumDetailGroup.add(trunkMed);
  mediumDetailGroup.add(leavesMed);
  treeLOD.addLevel(mediumDetailGroup, LOD_DISTANCES[1]);
  
  // Low detail magic tree (Level 2 - far distance)
  const lowDetailGroup = new THREE.Group();
  const trunkGeometryLow = new THREE.CylinderGeometry(0.6, 0.7, 4, 6);
  const trunkLow = new THREE.Mesh(trunkGeometryLow, trunkMaterial);
  trunkLow.position.y = 2.0;
  
  const leavesGeometryLow = new THREE.SphereGeometry(3, 6, 6);
  const leavesLow = new THREE.Mesh(leavesGeometryLow, leavesMaterial);
  leavesLow.position.y = 5.5;
  
  lowDetailGroup.add(trunkLow);
  lowDetailGroup.add(leavesLow);
  treeLOD.addLevel(lowDetailGroup, LOD_DISTANCES[2]);
  
  return treeLOD;
};

// Create different types of fishing spots
export const createNetFishingSpotMesh = (): THREE.Mesh => {
  // Create a simple cylinder with minimal height as requested
  const cylinderGeometry = new THREE.CylinderGeometry(2, 2, 0.05, 24);
  const cylinderMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x6495ED, // Cornflower blue
    transparent: true,
    opacity: 0.7,
    emissive: 0x3366CC,
    emissiveIntensity: 0.2
  });
  const mesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
  mesh.position.y = 0.025; // Half of height to place on ground
  
  // Make the mesh raycaster-friendly
  mesh.userData.isInteractable = true;
  mesh.userData.isFishingSpot = true; // Additional marker for easy identification
  mesh.name = "net_fishing_spot"; // Add a consistent name for debugging
  
  // Add animate function to keep ripple effect
  (mesh as any).update = () => {
    const time = Date.now() * 0.001; // Convert to seconds
    // Subtle pulsing effect
    mesh.scale.set(
      1.0 + Math.sin(time * 2) * 0.1,
      1.0,
      1.0 + Math.sin(time * 2) * 0.1
    );
    
    // Update opacity for shimmering effect
    (mesh.material as THREE.MeshStandardMaterial).opacity = 0.5 + Math.sin(time * 2) * 0.2;
  };
  
  return mesh;
};

export const createCageFishingSpotMesh = (): THREE.Mesh => {
  // Create a simple cylinder with minimal height as requested
  const cylinderGeometry = new THREE.CylinderGeometry(2.2, 2.2, 0.05, 24);
  const cylinderMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x3CB371, // Medium sea green
    transparent: true,
    opacity: 0.7,
    emissive: 0x2E8B57,
    emissiveIntensity: 0.2
  });
  const mesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
  mesh.position.y = 0.025; // Half of height to place on ground
  
  // Make the mesh raycaster-friendly
  mesh.userData.isInteractable = true;
  mesh.userData.isFishingSpot = true; // Additional marker for easy identification
  mesh.name = "cage_fishing_spot"; // Add a consistent name for debugging
  
  // Add animate function to keep ripple effect
  (mesh as any).update = () => {
    const time = Date.now() * 0.001; // Convert to seconds
    // Subtle pulsing effect
    mesh.scale.set(
      1.0 + Math.sin(time * 1.5) * 0.15,
      1.0,
      1.0 + Math.sin(time * 1.5) * 0.15
    );
    
    // Update opacity for shimmering effect
    (mesh.material as THREE.MeshStandardMaterial).opacity = 0.5 + Math.sin(time * 1.5) * 0.2;
  };
  
  return mesh;
};

export const createHarpoonFishingSpotMesh = (): THREE.Mesh => {
  // Create a simple cylinder with minimal height as requested
  const cylinderGeometry = new THREE.CylinderGeometry(2.5, 2.5, 0.05, 24);
  const cylinderMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x000080, // Navy blue
    transparent: true,
    opacity: 0.7,
    emissive: 0x000033,
    emissiveIntensity: 0.2
  });
  const mesh = new THREE.Mesh(cylinderGeometry, cylinderMaterial);
  mesh.position.y = 0.025; // Half of height to place on ground
  
  // Make the mesh raycaster-friendly
  mesh.userData.isInteractable = true;
  mesh.userData.isFishingSpot = true; // Additional marker for easy identification
  mesh.name = "harpoon_fishing_spot"; // Add a consistent name for debugging
  
  // Add animate function to keep ripple effect
  (mesh as any).update = () => {
    const time = Date.now() * 0.001; // Convert to seconds
    // Subtle pulsing effect
    mesh.scale.set(
      1.0 + Math.sin(time) * 0.2,
      1.0,
      1.0 + Math.sin(time) * 0.2
    );
    
    // Update opacity for shimmering effect
    (mesh.material as THREE.MeshStandardMaterial).opacity = 0.5 + Math.sin(time * 2) * 0.25;
  };
  
  return mesh;
};

// Create resource mesh based on type and metadata
export const createResourceMesh = (
  type: ResourceType | string, 
  state: 'normal' | 'harvested' = 'normal',
  metadata?: Record<string, any>
): THREE.Object3D => {
  if (state === 'harvested') {
    // Return depleted version of resource
    switch (type) {
      case ResourceType.TREE:
      case 'tree':
        return createTreeStumpMesh();
      case ResourceType.ROCK:
      case 'rock':
        return createDepletedRockMesh();
      default:
        return new THREE.Group();
    }
  }
  
  switch (type) {
    case ResourceType.TREE:
    case 'tree':
      // Use metadata to determine specific tree type
      if (metadata?.treeType) {
        switch (metadata.treeType) {
          case 'normal_tree':
            return createNormalTreeMesh();
          case 'oak_tree':
            return createOakTreeMesh();
          case 'willow_tree':
            return createWillowTreeMesh();
          case 'maple_tree':
            return createMapleTreeMesh();
          case 'yew_tree':
            return createYewTreeMesh();
          case 'magic_tree':
            return createMagicTreeMesh();
          default:
            return createNormalTreeMesh();
        }
      }
      return createNormalTreeMesh();
      
    case ResourceType.ROCK:
    case 'rock':
      // Use metadata to determine specific rock type
      if (metadata?.rockType) {
        switch (metadata.rockType) {
          case 'copper_rock':
            return createCopperRockMesh();
          case 'tin_rock':
            return createTinRockMesh();
          case 'iron_rock':
            return createIronRockMesh();
          case 'coal_rock':
            return createCoalRockMesh();
          case 'gold_rock':
            return createGoldRockMesh();
          case 'mithril_rock':
            return createMithrilRockMesh();
          case 'adamantite_rock':
            return createAdamantiteRockMesh();
          case 'runite_rock':
            return createRuniteRockMesh();
          default:
            return createRockMesh();
        }
      }
      return createRockMesh();
      
    case ResourceType.FISHING_SPOT:
    case 'fish': // Handle 'fish' type same as FISHING_SPOT for database compatibility
      // Use metadata to determine specific fishing spot type
      if (metadata?.spotType) {
        switch (metadata.spotType) {
          case 'net':
            return createNetFishingSpotMesh();
          case 'cage':
            return createCageFishingSpotMesh();
          case 'harpoon':
            return createHarpoonFishingSpotMesh();
          default:
            return createNetFishingSpotMesh();
        }
      }
      return createNetFishingSpotMesh();
      
    default:
      console.error(`Unknown resource type: ${type}`);
      return new THREE.Group();
  }
}; 