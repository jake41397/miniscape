import { useCallback } from 'react';
import * as THREE from 'three';
import { 
  ResourceNode, 
  ResourceType, 
  WorldItem, 
  createResourceMesh, 
  createItemMesh,
  updateDroppedItems
} from '../../game/world/resources';
import soundManager from '../../game/audio/soundManager';

interface WorldManagerProps {
  scene: THREE.Scene;
  resourceNodesRef: React.MutableRefObject<ResourceNode[]>;
  worldItemsRef: React.MutableRefObject<WorldItem[]>;
}

export const useWorldManager = ({ 
  scene, 
  resourceNodesRef, 
  worldItemsRef 
}: WorldManagerProps) => {

  // Create the ground plane and basic environment
  const createEnvironment = useCallback(() => {
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
    
    // Add ambient light
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);
    
    // Add directional light (sun)
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(10, 20, 10);
    scene.add(directionalLight);

    return { ground, gridHelper, ambientLight, directionalLight };
  }, [scene]);

  // Create boundary markers
  const createBoundaryMarkers = useCallback(() => {
    const WORLD_BOUNDS = {
      minX: -50, 
      maxX: 50,
      minZ: -50,
      maxZ: 50
    };

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
    const markers: THREE.Mesh[] = [];
    boundaryPoints.forEach(point => {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(point.x, 1, point.z); // Position at y=1 to be visible above ground
      scene.add(marker);
      markers.push(marker);
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
    
    console.log('Boundary markers created at world bounds', WORLD_BOUNDS);
    
    return { markers, boundaryLine };
  }, [scene]);

  // Create resource nodes in the world
  const createWorldResources = useCallback(() => {
    // Clear existing resources
    resourceNodesRef.current.forEach(node => {
      if (node.mesh) {
        scene.remove(node.mesh);
      }
    });
    resourceNodesRef.current = [];
    
    // Define resource nodes
    const resources: ResourceNode[] = [
      // Trees in Lumbridge area
      { id: 'tree-1', type: ResourceType.TREE, x: 10, y: 0, z: 10 },
      { id: 'tree-2', type: ResourceType.TREE, x: 15, y: 0, z: 15 },
      { id: 'tree-3', type: ResourceType.TREE, x: 20, y: 0, z: 10 },
      
      // Rocks in Barbarian Village
      { id: 'rock-1', type: ResourceType.ROCK, x: -20, y: 0, z: -20 },
      { id: 'rock-2', type: ResourceType.ROCK, x: -25, y: 0, z: -15 },
      
      // Fishing spots
      { id: 'fish-1', type: ResourceType.FISH, x: 30, y: 0, z: -30 },
    ];
    
    // Create meshes for each resource and add to scene
    resources.forEach(resource => {
      const mesh = createResourceMesh(resource.type);
      mesh.position.set(resource.x, resource.y, resource.z);
      
      // Store resource ID in userData for raycasting identification
      mesh.userData.resourceId = resource.id;
      mesh.userData.resourceType = resource.type;
      
      scene.add(mesh);
      
      // Store reference to mesh in resource node
      resourceNodesRef.current.push({
        ...resource,
        mesh: mesh as THREE.Mesh
      });
    });

    return resourceNodesRef.current;
  }, [scene, resourceNodesRef]);

  // Function to handle resource gathering
  const gatherResource = useCallback((resourceId: string, onGather: (resourceId: string) => void) => {
    console.log('Gathering resource:', resourceId);
    
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
      
      // Visual feedback
      if (resourceNode.mesh) {
        const originalColor = (resourceNode.mesh.material as THREE.MeshStandardMaterial).color.clone();
        
        // Flash the resource
        (resourceNode.mesh.material as THREE.MeshStandardMaterial).color.set(0xffff00);
        
        // Reset after delay
        setTimeout(() => {
          if (resourceNode.mesh) {
            (resourceNode.mesh.material as THREE.MeshStandardMaterial).color.copy(originalColor);
          }
        }, 2000);
      }
    }
    
    // Call the provided callback
    onGather(resourceId);
  }, [resourceNodesRef]);

  // Handle adding item to the world
  const addItemToWorld = useCallback((data: any) => {
    console.log('Item dropped:', data);
    
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
  }, [scene, worldItemsRef]);

  // Handle removing item from the world
  const removeItemFromWorld = useCallback((dropId: string) => {
    console.log('Item removed:', dropId);
    
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
  }, [scene, worldItemsRef]);

  // Function to pick up an item
  const pickupItem = useCallback((dropId: string, onPickup: (dropId: string) => void) => {
    console.log('Picking up item:', dropId);
    
    // Play sound
    soundManager.play('itemPickup');
    
    // Call the provided callback
    onPickup(dropId);
  }, []);

  // Update animated items in the world
  const updateWorldItems = useCallback((delta: number) => {
    updateDroppedItems(worldItemsRef.current, delta);
  }, [worldItemsRef]);

  // Cleanup all world resources
  const cleanup = useCallback(() => {
    // Cleanup resources
    resourceNodesRef.current.forEach(node => {
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
    resourceNodesRef.current = [];

    // Cleanup items
    worldItemsRef.current.forEach(item => {
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
    worldItemsRef.current = [];
  }, [scene, resourceNodesRef, worldItemsRef]);

  return {
    createEnvironment,
    createBoundaryMarkers,
    createWorldResources,
    gatherResource,
    addItemToWorld,
    removeItemFromWorld,
    pickupItem,
    updateWorldItems,
    cleanup
  };
};

export default useWorldManager; 