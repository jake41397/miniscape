import * as THREE from 'three';

// Resource node types
export enum ResourceType {
  TREE = 'tree',
  ROCK = 'rock',
  FISH = 'fish'
}

// World resource node
export interface ResourceNode {
  id: string;
  type: ResourceType;
  x: number;
  y: number;
  z: number;
  mesh?: THREE.Mesh;
  lodMeshes?: THREE.Object3D[]; // Array of LOD meshes
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
  const spotGeometry = new THREE.CircleGeometry(2, 16);
  const spotMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x6495ED, // Cornflower blue
    transparent: true,
    opacity: 0.7
  });
  const spot = new THREE.Mesh(spotGeometry, spotMaterial);
  // Rotate to be horizontal
  spot.rotation.x = -Math.PI / 2;
  spot.position.y = 0.05; // Just above ground
  
  return spot;
};

// Create a dropped item mesh
export const createItemMesh = (itemType: string): THREE.Mesh => {
  console.log(`Creating item mesh for type: '${itemType}'`);
  
  let geometry;
  let material;
  let mesh;
  
  // Normalize itemType to lowercase for consistent handling
  const type = String(itemType).toLowerCase();
  
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
  
  // Add animation properties
  mesh.userData.animateY = true;
  mesh.userData.baseY = mesh.position.y;
  mesh.userData.phase = Math.random() * Math.PI * 2; // Random phase for varied motion
  mesh.userData.rotationSpeed = (Math.random() * 0.3) + 0.2; // Random rotation speed
  
  // Set shadow casting
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  
  console.log(`Created mesh for '${itemType}' at initial y: ${mesh.position.y}`);
  return mesh;
};

// Creates a mesh for a resource node based on its type
export const createResourceMesh = (type: ResourceType): THREE.Object3D => {
  switch (type) {
    case ResourceType.TREE:
      return createTreeMesh();
    case ResourceType.ROCK:
      return createRockMesh();
    case ResourceType.FISH:
      return createFishingSpotMesh();
    default:
      // Default fallback
      const defaultGeometry = new THREE.BoxGeometry(1, 1, 1);
      const defaultMaterial = new THREE.MeshStandardMaterial({ color: 0xFF0000 });
      return new THREE.Mesh(defaultGeometry, defaultMaterial);
  }
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