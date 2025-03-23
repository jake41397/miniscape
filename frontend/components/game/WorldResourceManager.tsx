import { useEffect } from 'react';
import * as THREE from 'three';
import { getSocket } from '../../game/network/socket';
import soundManager from '../../game/audio/soundManager';
import { ResourceNode, ResourceType, createResourceMesh } from '../../game/world/resources';

interface WorldResourceManagerProps {
  scene: THREE.Scene;
  resourceNodesRef: React.MutableRefObject<ResourceNode[]>;
}

export interface WorldResourceManagerInterface {
  createWorldResources: () => void;
  gatherResource: (resourceId: string) => Promise<void>;
}

const WorldResourceManager: React.FC<WorldResourceManagerProps & {
  onInit: (manager: WorldResourceManagerInterface) => void;
}> = ({ scene, resourceNodesRef, onInit }) => {
  // Create resource nodes in the world
  const createWorldResources = () => {
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
  };
  
  // Function for gathering resources
  const gatherResource = async (resourceId: string) => {
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
      }, 2000);
    }
  };
  
  // Initialize the manager
  useEffect(() => {
    onInit({
      createWorldResources,
      gatherResource
    });
    
    // Initialize resources
    createWorldResources();
  }, []);
  
  return null; // This component doesn't render anything visible
};

export default WorldResourceManager; 