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

// Create a tree mesh
export const createTreeMesh = (): THREE.Group => {
  const treeGroup = new THREE.Group();
  
  // Create trunk (cylinder)
  const trunkGeometry = new THREE.CylinderGeometry(0.5, 0.6, 3, 8);
  const trunkMaterial = new THREE.MeshStandardMaterial({ color: 0x8B4513 }); // Brown
  const trunk = new THREE.Mesh(trunkGeometry, trunkMaterial);
  trunk.position.y = 1.5; // Half height
  
  // Create leaves (sphere)
  const leavesGeometry = new THREE.SphereGeometry(2, 8, 8);
  const leavesMaterial = new THREE.MeshStandardMaterial({ color: 0x2E8B57 }); // Sea green
  const leaves = new THREE.Mesh(leavesGeometry, leavesMaterial);
  leaves.position.y = 4; // Above trunk
  
  // Add to group
  treeGroup.add(trunk);
  treeGroup.add(leaves);
  
  return treeGroup;
};

// Create a rock mesh
export const createRockMesh = (): THREE.Mesh => {
  const rockGeometry = new THREE.DodecahedronGeometry(1.5, 0);
  const rockMaterial = new THREE.MeshStandardMaterial({ 
    color: 0x696969, // Dark gray
    roughness: 0.8 
  });
  const rock = new THREE.Mesh(rockGeometry, rockMaterial);
  rock.position.y = 0.75; // Half height
  
  return rock;
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
  const geometry = new THREE.BoxGeometry(0.5, 0.5, 0.5);
  
  let color = 0xCCCCCC; // Default gray
  
  // Set color based on item type
  switch (itemType) {
    case 'log':
      color = 0x8B4513; // Brown
      break;
    case 'coal':
      color = 0x36454F; // Dark gray
      break;
    case 'fish':
      color = 0x6495ED; // Blue
      break;
  }
  
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive: color,
    emissiveIntensity: 0.2
  });
  
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = 0.25; // Half height
  
  // Add slight animation
  mesh.userData.animateY = true;
  mesh.userData.baseY = 0.25;
  mesh.userData.phase = Math.random() * Math.PI * 2; // Random phase
  
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

// Update dropped items animation (call in animation loop)
export const updateDroppedItems = (items: WorldItem[], deltaTime: number) => {
  const time = Date.now() / 1000;
  
  items.forEach(item => {
    if (item.mesh && item.mesh.userData.animateY) {
      // Make it hover up and down slightly
      const phase = item.mesh.userData.phase || 0;
      const baseY = item.mesh.userData.baseY || 0.25;
      item.mesh.position.y = baseY + Math.sin(time * 2 + phase) * 0.1;
      
      // Also rotate it slowly
      item.mesh.rotation.y += deltaTime * 0.5;
    }
  });
}; 