import * as THREE from 'three';
import { ResourceNode, ResourceType, WorldItem, createResourceMesh, createItemMesh } from '../../game/world/resources';
import WorldManager from '../../game/world/WorldManager';
import ItemManager from '../../game/world/ItemManager';
import soundManager from '../../game/audio/soundManager';

export interface ResourceControllerOptions {
  scene: THREE.Scene;
  resourceNodesRef: React.MutableRefObject<ResourceNode[]>;
  worldItemsRef: React.MutableRefObject<WorldItem[]>;
  worldManagerRef: React.MutableRefObject<WorldManager | null>;
  itemManagerRef: React.MutableRefObject<ItemManager | null>;
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
}

export class ResourceController {
  private scene: THREE.Scene;
  private resourceNodesRef: React.MutableRefObject<ResourceNode[]>;
  private worldItemsRef: React.MutableRefObject<WorldItem[]>;
  private worldManagerRef: React.MutableRefObject<WorldManager | null>;
  private itemManagerRef: React.MutableRefObject<ItemManager | null>;
  private playerRef: React.MutableRefObject<THREE.Mesh | null>;
  
  constructor(options: ResourceControllerOptions) {
    this.scene = options.scene;
    this.resourceNodesRef = options.resourceNodesRef;
    this.worldItemsRef = options.worldItemsRef;
    this.worldManagerRef = options.worldManagerRef;
    this.itemManagerRef = options.itemManagerRef;
    this.playerRef = options.playerRef;
  }
  
  public initializeWorldManager(): void {
    // Create a new WorldManager instance if it doesn't exist
    if (!this.worldManagerRef.current) {
      this.worldManagerRef.current = new WorldManager({
        scene: this.scene,
        onResourceNodesCreated: (nodes) => {
          this.resourceNodesRef.current = nodes;
        },
        onWorldItemsCreated: (items) => {
          this.worldItemsRef.current = items;
        }
      });
    }
  }
  
  public initializeItemManager(): void {
    // Create a new ItemManager instance if it doesn't exist
    if (!this.itemManagerRef.current) {
      this.itemManagerRef.current = new ItemManager({
        scene: this.scene,
        playerRef: this.playerRef,
        onWorldItemsUpdated: (items) => {
          this.worldItemsRef.current = items;
        }
      });
    }
  }
  
  public updateResourceNodes(nodes: ResourceNode[]): void {
    // Remove old resource nodes
    this.clearResourceNodes();
    
    // Store new resource nodes
    this.resourceNodesRef.current = nodes;
    
    // Create meshes for new resource nodes
    this.initializeResourceNodeMeshes();
  }
  
  public updateWorldItems(items: WorldItem[]): void {
    // Remove old world items
    this.clearWorldItems();
    
    // Store new world items
    this.worldItemsRef.current = items;
    
    // Create meshes for new world items
    this.initializeWorldItemMeshes();
  }
  
  public addResourceNode(node: ResourceNode): void {
    // Check if node already exists
    const existingIndex = this.resourceNodesRef.current.findIndex(n => n.id === node.id);
    if (existingIndex !== -1) {
      return;
    }
    
    // Add node to list
    this.resourceNodesRef.current.push(node);
    
    // Create mesh for new node
    this.createResourceNodeMesh(node);
  }
  
  public addWorldItem(item: WorldItem): void {
    // Check if item already exists
    const existingIndex = this.worldItemsRef.current.findIndex(i => i.dropId === item.dropId);
    if (existingIndex !== -1) {
      return;
    }
    
    // Add item to list
    this.worldItemsRef.current.push(item);
    
    // Create mesh for new item
    this.createWorldItemMesh(item);
    
    // Play drop sound
    soundManager.play('itemDrop');
  }
  
  public removeWorldItem(itemId: string): void {
    // Find world item
    const index = this.worldItemsRef.current.findIndex(item => item.dropId === itemId);
    if (index === -1) {
      return;
    }
    
    const item = this.worldItemsRef.current[index];
    
    // Remove mesh from scene
    if (item.mesh) {
      this.scene.remove(item.mesh);
      
      // Clean up geometry and material
      if (item.mesh.geometry) {
        item.mesh.geometry.dispose();
      }
      
      if (item.mesh.material) {
        if (Array.isArray(item.mesh.material)) {
          item.mesh.material.forEach(m => m.dispose());
        } else {
          item.mesh.material.dispose();
        }
      }
    }
    
    // Remove item from list
    this.worldItemsRef.current.splice(index, 1);
  }
  
  public updateResourceNodeState(nodeId: string, isAvailable: boolean): void {
    // Find resource node
    const node = this.resourceNodesRef.current.find(n => n.id === nodeId);
    if (!node) {
      return;
    }
    
    // Update mesh appearance based on availability
    if (node.mesh) {
      const material = node.mesh.material as THREE.MeshStandardMaterial;
      if (Array.isArray(material)) {
        material.forEach(m => {
          m.opacity = isAvailable ? 1.0 : 0.5;
          m.transparent = !isAvailable;
        });
      } else if (material) {
        material.opacity = isAvailable ? 1.0 : 0.5;
        material.transparent = !isAvailable;
      }
    }
  }
  
  private initializeResourceNodeMeshes(): void {
    this.resourceNodesRef.current.forEach(node => {
      this.createResourceNodeMesh(node);
    });
  }
  
  private initializeWorldItemMeshes(): void {
    this.worldItemsRef.current.forEach(item => {
      this.createWorldItemMesh(item);
    });
  }
  
  private createResourceNodeMesh(node: ResourceNode): void {
    // Get node color based on type
    let color: number;
    let geometry: THREE.BufferGeometry;
    
    switch (node.type) {
      case ResourceType.TREE:
        color = 0x228B22; // Forest Green
        geometry = new THREE.CylinderGeometry(0.5, 0.7, 3, 8);
        break;
      case ResourceType.ROCK:
        color = 0x808080; // Gray
        geometry = new THREE.DodecahedronGeometry(0.8, 1);
        break;
      case ResourceType.FISH:
        color = 0x6495ED; // Blue
        geometry = new THREE.CylinderGeometry(1.5, 1.5, 0.2, 16);
        break;
      default:
        color = 0xFFFFFF; // White
        geometry = new THREE.BoxGeometry(1, 1, 1);
        break;
    }
    
    // Create material
    const material = new THREE.MeshStandardMaterial({
      color: color,
      roughness: 0.8,
    });
    
    // Create mesh
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(node.x, node.y, node.z);
    
    // Add shadow casting
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    
    // Store resource ID in userData for raycasting
    mesh.userData.resourceId = node.id;
    mesh.userData.resourceType = node.type;
    
    // Add to scene
    this.scene.add(mesh);
    
    // Store mesh with resource node
    node.mesh = mesh;
  }
  
  private createWorldItemMesh(item: WorldItem): void {
    // Create mesh for the item
    const mesh = createItemMesh(item.itemType);
    mesh.position.set(item.x, item.y, item.z);
    
    // Store item ID in userData for raycasting
    mesh.userData.dropId = item.dropId;
    mesh.userData.itemType = item.itemType;
    
    // Add to scene
    this.scene.add(mesh);
    
    // Store mesh with world item
    item.mesh = mesh;
  }
  
  private clearResourceNodes(): void {
    // Remove resource node meshes from scene and dispose resources
    this.resourceNodesRef.current.forEach(node => {
      if (node.mesh) {
        this.scene.remove(node.mesh);
        
        if (node.mesh.geometry) {
          node.mesh.geometry.dispose();
        }
        
        if (node.mesh.material) {
          if (Array.isArray(node.mesh.material)) {
            node.mesh.material.forEach(m => m.dispose());
          } else {
            node.mesh.material.dispose();
          }
        }
      }
    });
    
    // Clear resource nodes array
    this.resourceNodesRef.current = [];
  }
  
  private clearWorldItems(): void {
    // Remove world item meshes from scene and dispose resources
    this.worldItemsRef.current.forEach(item => {
      if (item.mesh) {
        this.scene.remove(item.mesh);
        
        if (item.mesh.geometry) {
          item.mesh.geometry.dispose();
        }
        
        if (item.mesh.material) {
          if (Array.isArray(item.mesh.material)) {
            item.mesh.material.forEach(m => m.dispose());
          } else {
            item.mesh.material.dispose();
          }
        }
      }
    });
    
    // Clear world items array
    this.worldItemsRef.current = [];
  }
  
  public cleanup(): void {
    // Clear all resources and items
    this.clearResourceNodes();
    this.clearWorldItems();
  }
}

export default ResourceController; 