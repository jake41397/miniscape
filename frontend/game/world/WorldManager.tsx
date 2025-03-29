import * as THREE from 'three';
import { 
  ResourceNode, 
  ResourceType, 
  WorldItem, 
  createResourceMesh, 
  createItemMesh,
  updateDroppedItems,
  updateResourceLOD
} from './resources';

// World boundaries
const WORLD_BOUNDS = {
  minX: -50, 
  maxX: 50,
  minZ: -50,
  maxZ: 50
};

interface WorldManagerProps {
  scene: THREE.Scene;
  onResourceNodesCreated: (nodes: ResourceNode[]) => void;
  onWorldItemsCreated: (items: WorldItem[]) => void;
}

class WorldManager {
  private scene: THREE.Scene;
  private resourceNodes: ResourceNode[] = [];
  private worldItems: WorldItem[] = [];
  private onResourceNodesCreated: (nodes: ResourceNode[]) => void;
  private onWorldItemsCreated: (items: WorldItem[]) => void;
  private camera: THREE.Camera | null = null;
  
  // Geometries and materials for proper disposal
  private groundGeometry?: THREE.PlaneGeometry;
  private groundMaterial?: THREE.MeshStandardMaterial;
  private markerGeometry?: THREE.SphereGeometry;
  private markerMaterial?: THREE.MeshBasicMaterial;

  constructor(props: WorldManagerProps) {
    this.scene = props.scene;
    this.onResourceNodesCreated = props.onResourceNodesCreated;
    this.onWorldItemsCreated = props.onWorldItemsCreated;
    
    this.initialize();
  }

  // Set camera for LOD calculations
  public setCamera(camera: THREE.Camera) {
    this.camera = camera;
  }

  private initialize() {
    if (!this.scene) return;

    // Create a ground plane
    this.groundGeometry = new THREE.PlaneGeometry(100, 100);
    this.groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x4caf50,  // Green color for grass
      roughness: 0.8,
      metalness: 0.2
    });
    const ground = new THREE.Mesh(this.groundGeometry, this.groundMaterial);
    
    // Rotate the ground to be horizontal (x-z plane)
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    this.scene.add(ground);
    
    // Create a simple grid for reference
    const gridHelper = new THREE.GridHelper(100, 20);
    this.scene.add(gridHelper);
    
    // Create boundary markers
    this.createBoundaryMarkers();

    // Create world resources
    this.createWorldResources();
    
    // Initialize empty world items array and pass to parent
    this.worldItems = [];
    this.onWorldItemsCreated(this.worldItems);
  }

  private createBoundaryMarkers() {
    // Use a bright color for visibility
    this.markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.markerGeometry = new THREE.SphereGeometry(0.5);
    
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
      const marker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
      marker.position.set(point.x, 1, point.z); // Position at y=1 to be visible above ground
      this.scene.add(marker);
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
    this.scene.add(boundaryLine);
  }

  private createWorldResources() {
    // Clear existing resources
    this.resourceNodes.forEach(node => {
      if (node.mesh) {
        this.scene.remove(node.mesh);
      }
    });
    this.resourceNodes = [];
    
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
      
      this.scene.add(mesh);
      
      // Store reference to mesh in resource node
      this.resourceNodes.push({
        ...resource,
        mesh: mesh as unknown as THREE.Mesh
      });
    });

    // Pass the created resource nodes to parent component
    this.onResourceNodesCreated(this.resourceNodes);
  }

  public cleanup() {
    // Dispose of geometries and materials
    this.groundGeometry?.dispose();
    this.groundMaterial?.dispose();
    this.markerGeometry?.dispose();
    this.markerMaterial?.dispose();
    
    // Dispose of resource meshes
    this.resourceNodes.forEach((node) => {
      if (node.mesh) {
        this.scene.remove(node.mesh);
        
        // Handle standard meshes
        if (node.mesh.geometry) {
          node.mesh.geometry.dispose();
        }
        
        // Handle materials
        if (Array.isArray(node.mesh.material)) {
          node.mesh.material.forEach(mat => {
            if (mat) mat.dispose();
          });
        } else if (node.mesh.material) {
          node.mesh.material.dispose();
        }
        
        // Check if it's actually a LOD object
        const meshAsAny = node.mesh as any;
        if (meshAsAny.levels && Array.isArray(meshAsAny.levels)) {
          for (let i = 0; i < meshAsAny.levels.length; i++) {
            const level = meshAsAny.levels[i];
            if (level && level.object) {
              if (level.object.geometry) {
                level.object.geometry.dispose();
              }
              if (Array.isArray(level.object.material)) {
                level.object.material.forEach((mat: THREE.Material) => {
                  if (mat) mat.dispose();
                });
              } else if (level.object.material) {
                level.object.material.dispose();
              }
            }
          }
        }
      }
    });
    
    // Dispose of world item meshes
    this.worldItems.forEach((item) => {
      if (item.mesh) {
        this.scene.remove(item.mesh);
        if (item.mesh.geometry) item.mesh.geometry.dispose();
        if (Array.isArray(item.mesh.material)) {
          item.mesh.material.forEach(material => material.dispose());
        } else if (item.mesh.material) {
          item.mesh.material.dispose();
        }
      }
    });
  }
  
  // Add methods to update or manage world items
  public addWorldItem(item: WorldItem) {
    // Create mesh for the item if it doesn't exist
    if (!item.mesh) {
      const mesh = createItemMesh(item.itemType);
      mesh.position.set(item.x, item.y, item.z);
      mesh.userData.dropId = item.dropId;
      this.scene.add(mesh);
      item.mesh = mesh;
    }
    
    this.worldItems.push(item);
    this.onWorldItemsCreated(this.worldItems);
  }
  
  public removeWorldItem(dropId: string) {
    const itemIndex = this.worldItems.findIndex(item => item.dropId === dropId);
    
    if (itemIndex >= 0) {
      const item = this.worldItems[itemIndex];
      
      if (item.mesh) {
        this.scene.remove(item.mesh);
        if (item.mesh.geometry) item.mesh.geometry.dispose();
        if (Array.isArray(item.mesh.material)) {
          item.mesh.material.forEach(material => material.dispose());
        } else if (item.mesh.material) {
          item.mesh.material.dispose();
        }
      }
      
      this.worldItems.splice(itemIndex, 1);
      this.onWorldItemsCreated(this.worldItems);
    }
  }
  
  public updateItems(delta: number) {
    // Update LOD for resource nodes based on camera position
    if (this.camera) {
      updateResourceLOD(this.resourceNodes, this.camera);
    }
    
    // Update dropped items animation
    updateDroppedItems(this.worldItems, delta);
  }
}

// Export constants and types
export { WORLD_BOUNDS };
export default WorldManager; 