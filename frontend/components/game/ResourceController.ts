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
    console.log(`%c 🌳 ResourceController.updateResourceNodes called with ${nodes.length} nodes`, "background: #4CAF50; color: white; font-size: 14px;");
    console.log("Node IDs:", nodes.map(node => node.id).join(', '));
    
    // Log the full node data structure for debugging
    console.log("Complete resource nodes data:", JSON.stringify(nodes));
    
    // Add extra debug logging for metadata
    nodes.forEach(node => {
      console.log(`Node ${node.id} (${node.type}) metadata:`, node.metadata);
    });
    
    // If no nodes received, create default resources
    if (nodes.length === 0) {
      console.warn("%c ⚠️ No resource nodes received from server! Creating default resources.", "background: #FFC107; color: black; font-size: 14px;");
      nodes = this.createDefaultResources();
    }
    
    // Check if any nodes match our expected resources
    const expectedIds = ['tree-1', 'tree-2', 'tree-3', 'rock-1', 'rock-2', 'fish-1'];
    const foundIds = nodes.map(node => node.id).filter(id => expectedIds.includes(id));
    console.log(`Found ${foundIds.length}/${expectedIds.length} expected resource IDs:`, foundIds);
    
    // Check resource node types to ensure they're compatible with ResourceType enum
    const validTypes = Object.values(ResourceType);
    const invalidTypeNodes = nodes.filter(node => !validTypes.includes(node.type as any));
    if (invalidTypeNodes.length > 0) {
      console.warn(`Found ${invalidTypeNodes.length} nodes with invalid types:`, 
        invalidTypeNodes.map(n => `${n.id}: ${n.type}`));
      
      // Convert string types to enum values
      nodes.forEach(node => {
        const typeStr = String(node.type).toLowerCase();
        // Map string types to enum values
        if (typeStr === 'tree') {
          node.type = ResourceType.TREE;
        } else if (typeStr === 'rock') {
          node.type = ResourceType.ROCK;
        } else if (typeStr === 'fish') {
          node.type = ResourceType.FISH;
        }
      });
      
      console.log("Resource types converted to enum values");
    }
    
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
  
  public updateResourceNodeState(nodeId: string, data: { 
    available?: boolean, 
    state?: 'normal' | 'harvested',
    remainingResources?: number
  }): void {
    // Find resource node
    const node = this.resourceNodesRef.current.find(n => n.id === nodeId);
    if (!node) {
      console.log(`Resource node not found: ${nodeId}`);
      return;
    }
    
    console.log(`Updating resource node ${nodeId} state:`, data);
    
    // Update node properties
    if (data.remainingResources !== undefined) {
      node.remainingResources = data.remainingResources;
    }
    
    // Handle state change
    if (data.state !== undefined && node.state !== data.state) {
      node.state = data.state;
      this.updateResourceNodeMesh(node);
    }
    
    // Handle availability change (this is separate from state - unavailable could be temporary)
    if (data.available !== undefined) {
      // If the mesh exists, update its appearance
      if (node.mesh) {
        // Get all materials (could be a single material or an array)
        const materials = Array.isArray(node.mesh.material) 
          ? node.mesh.material 
          : [node.mesh.material as THREE.Material];
        
        // Update each material
        materials.forEach(material => {
          if (material) {
            material.opacity = data.available ? 1.0 : 0.5;
            material.transparent = !data.available;
          }
        });
        
        // Also apply to any children
        node.mesh.traverse((child) => {
          if (child instanceof THREE.Mesh && child.material) {
            const childMaterials = Array.isArray(child.material) 
              ? child.material 
              : [child.material as THREE.Material];
            
            childMaterials.forEach(material => {
              if (material) {
                material.opacity = data.available ? 1.0 : 0.5;
                material.transparent = !data.available;
              }
            });
          }
        });
      }
    }
  }
  
  /**
   * Update a resource node's mesh based on its state
   */
  private updateResourceNodeMesh(node: ResourceNode): void {
    // Remove old mesh from scene if it exists
    if (node.mesh) {
      this.scene.remove(node.mesh);
      
      // Dispose of geometry and materials
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
      
      // Also clean up any children
      node.mesh.children.forEach(child => {
        if (child instanceof THREE.Mesh) {
          if (child.geometry) child.geometry.dispose();
          if (child.material) {
            if (Array.isArray(child.material)) {
              child.material.forEach(m => m.dispose());
            } else {
              child.material.dispose();
            }
          }
        }
      });
    }
    
    // Create new mesh based on node type and state
    const mesh = createResourceMesh(node.type as ResourceType, node.state || 'normal', node.metadata);
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
    node.mesh = mesh as THREE.Mesh;
    
    // Play sound effect based on state change
    if (node.state === 'harvested') {
      if (node.type === ResourceType.TREE) {
        soundManager.play('treeFall' as any);
      } else if (node.type === ResourceType.ROCK) {
        soundManager.play('rockBreak' as any);
      }
    }
  }
  
  public initializeResourceNodeMeshes(): void {
    console.log(`%c 🔨 Initializing meshes for ${this.resourceNodesRef.current?.length || 0} resources`, "background: #03A9F4; color: white;");
    
    // Create meshes for each resource
    this.resourceNodesRef.current?.forEach(node => {
      // Check if resource node already has a mesh
      if (node.mesh) {
        console.log(`Resource ${node.id} already has a mesh, skipping`);
        return;
      }
      
      console.log(`Creating mesh for resource ${node.id} (${node.type}) at (${node.x}, ${node.y}, ${node.z})`);
      this.createResourceNodeMesh(node);
    });
  }
  
  private initializeWorldItemMeshes(): void {
    this.worldItemsRef.current.forEach(item => {
      this.createWorldItemMesh(item);
    });
  }
  
  private createResourceNodeMesh(node: ResourceNode): void {
    try {
      console.log(`Creating mesh for node: ${node.id}, type: ${node.type}, state: ${node.state || 'normal'}`);
      
      // Ensure node.type is a valid ResourceType
      let nodeType: ResourceType;
      if (typeof node.type === 'string') {
        // Convert string type to enum if needed
        const typeStr = String(node.type).toLowerCase();
        if (typeStr === 'tree') {
          nodeType = ResourceType.TREE;
        } else if (typeStr === 'rock') {
          nodeType = ResourceType.ROCK;
        } else if (typeStr === 'fish') {
          nodeType = ResourceType.FISH;
        } else {
          console.error(`Invalid resource type: ${node.type}`);
          nodeType = ResourceType.TREE; // Default to tree as a fallback
        }
      } else {
        nodeType = node.type;
      }
      
      // Create mesh based on node type and state
      const mesh = createResourceMesh(nodeType, node.state || 'normal', node.metadata);
      mesh.position.set(node.x, node.y, node.z);
      
      // Add shadow casting
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      
      // Store resource ID in userData for raycasting
      mesh.userData.resourceId = node.id;
      mesh.userData.resourceType = nodeType;
      
      // Add to scene
      this.scene.add(mesh);
      
      // Store mesh with resource node
      node.mesh = mesh as THREE.Mesh;
      
      console.log(`Successfully created mesh for ${node.id}`);
    } catch (error) {
      console.error(`Error creating mesh for resource ${node.id}:`, error);
    }
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
  
  /**
   * Creates a set of default resources when none are received from the server
   */
  public createDefaultResources(): ResourceNode[] {
    console.log("%c 🌳 Creating default resource nodes", "background: #4CAF50; color: white; font-size: 14px;");
    
    // Define default resource nodes
    const defaultResources: ResourceNode[] = [
      // Trees in Lumbridge area
      { id: 'tree-1', type: ResourceType.TREE, x: 10, y: 1, z: 10 },
      { id: 'tree-2', type: ResourceType.TREE, x: 15, y: 1, z: 15 },
      { id: 'tree-3', type: ResourceType.TREE, x: 20, y: 1, z: 10 },
      
      // Rocks in Barbarian Village
      { id: 'rock-1', type: ResourceType.ROCK, x: -20, y: 1, z: -20 },
      { id: 'rock-2', type: ResourceType.ROCK, x: -25, y: 1, z: -15 },
      
      // Fishing spots
      { id: 'fish-1', type: ResourceType.FISH, x: 30, y: 1, z: -30 },
    ];
    
    console.log(`Created ${defaultResources.length} default resources:`, 
      defaultResources.map(r => `${r.id} (${r.type}) at (${r.x}, ${r.y}, ${r.z})`));
    
    return defaultResources;
  }

  /**
   * Handle clicking on a resource node
   * @param resourceId The ID of the resource that was clicked
   * @param socket The socket connection to use
   */
  public handleResourceClick(resourceId: string, socket: any): void {
    // Find the resource node
    const resourceNode = this.resourceNodesRef.current.find(n => n.id === resourceId);
    if (!resourceNode) {
      console.error(`Resource node not found: ${resourceId}`);
      return;
    }

    console.log(`Clicked on resource: ${resourceId} (${resourceNode.type})`);

    // Start gathering
    socket.emit('start_gathering', { resourceId });
    
    // Set up listeners for resource gathering events if they don't exist yet
    if (!socket._resourceListenersInitialized) {
      // Listen for gathering success
      socket.on('gather_success', (data: { resourceId: string, itemType: string, remainingResources: number }) => {
        console.log(`Gathered ${data.itemType} from ${data.resourceId} (${data.remainingResources} remaining)`);
        
        // Update the resource node state
        this.updateResourceNodeState(data.resourceId, { 
          remainingResources: data.remainingResources 
        });
        
        // Play appropriate sound based on resource type
        const node = this.resourceNodesRef.current.find(n => n.id === data.resourceId);
        if (node) {
          if (node.type === ResourceType.TREE || node.type === 'tree') {
            soundManager.play('chop');
          } else if (node.type === ResourceType.ROCK || node.type === 'rock') {
            soundManager.play('mine');
          } else if (node.type === ResourceType.FISHING_SPOT || node.type === 'fish') {
            soundManager.play('splash');
          }
        }
      });
      
      // Listen for gathering errors
      socket.on('gather_error', (data: { message: string }) => {
        console.error(`Gathering error: ${data.message}`);
      });
      
      // Listen for resource depletion
      socket.on('resource_depleted', (data: { resourceId: string }) => {
        console.log(`Resource ${data.resourceId} depleted`);
        
        // Update resource visual state
        this.updateResourceNodeState(data.resourceId, { 
          state: 'harvested',
          remainingResources: 0
        });
        
        // Play depletion sound
        const node = this.resourceNodesRef.current.find(n => n.id === data.resourceId);
        if (node) {
          if (node.type === ResourceType.TREE || node.type === 'tree') {
            soundManager.play('treeFall');
          } else if (node.type === ResourceType.ROCK || node.type === 'rock') {
            soundManager.play('rockBreak');
          }
        }
      });
      
      // Listen for resource respawn
      socket.on('resource_respawned', (data: { resourceId: string }) => {
        console.log(`Resource ${data.resourceId} respawned`);
        
        // Update resource visual state
        this.updateResourceNodeState(data.resourceId, { 
          state: 'normal'
        });
        
        // Play respawn sound (subtle pop or shimmer)
        soundManager.play('respawn');
      });
      
      // Listen for XP gained
      socket.on('xp_gained', (data: { 
        skill: string, 
        amount: number, 
        total: number, 
        level: number, 
        leveledUp: boolean 
      }) => {
        console.log(`Gained ${data.amount} ${data.skill} XP (total: ${data.total}, level: ${data.level})`);
        
        // Update XP UI if you have one
        // You might dispatch this to your UI state manager
        
        // Play XP sound
        soundManager.play('xp');
      });
      
      // Listen for level up
      socket.on('level_up', (data: { skill: string, level: number }) => {
        console.log(`Leveled up ${data.skill} to ${data.level}!`);
        
        // Show level up message and play celebration sound
        soundManager.play('levelUp');
      });
      
      // Mark that we've initialized the resource listeners
      socket._resourceListenersInitialized = true;
    }
  }

  /**
   * Stop gathering resources
   * @param socket The socket connection to use
   */
  public stopGathering(socket: any): void {
    socket.emit('stop_gathering');
  }
}

export default ResourceController; 