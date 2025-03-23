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
  let geometry;
  let material;
  let mesh;
  
  // Choose geometry and color based on item type
  switch (itemType) {
    case 'log':
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
      // Default fallback - simple box
      geometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
      material = new THREE.MeshStandardMaterial({
        color: 0xCCCCCC, // Default gray
        emissive: 0xCCCCCC,
        emissiveIntensity: 0.1
      });
      mesh = new THREE.Mesh(geometry, material);
  }
  
  mesh.position.y = 0.15; // Position slightly above ground to avoid z-fighting
  
  // Add animation properties
  mesh.userData.animateY = true;
  mesh.userData.baseY = mesh.position.y;
  mesh.userData.phase = Math.random() * Math.PI * 2; // Random phase for varied motion
  mesh.userData.rotationSpeed = (Math.random() * 0.3) + 0.2; // Random rotation speed
  
  // Add subtle glow/highlight effect
  const glowColor = new THREE.Color(0xffffff);
  glowColor.lerp(new THREE.Color(material.color.getHex()), 0.5);
  
  // Set shadow casting
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  
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