import * as THREE from 'three';
import { ResourceNode, WorldItem } from '../../game/world/resources';
import { WORLD_BOUNDS } from '../../game/world/WorldManager';

export interface DebugToolsOptions {
  scene: THREE.Scene;
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  resourceNodesRef: React.MutableRefObject<ResourceNode[]>;
  worldItemsRef: React.MutableRefObject<WorldItem[]>;
  playersRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
}

export class DebugTools {
  private scene: THREE.Scene;
  private playerRef: React.MutableRefObject<THREE.Mesh | null>;
  private resourceNodesRef: React.MutableRefObject<ResourceNode[]>;
  private worldItemsRef: React.MutableRefObject<WorldItem[]>;
  private playersRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  
  // Debug visualization objects
  private debugObjects: THREE.Object3D[] = [];
  private gridHelper: THREE.GridHelper | null = null;
  private axesHelper: THREE.AxesHelper | null = null;
  private boundaryLines: THREE.Line | null = null;
  
  // Debug state
  private showDebug: boolean = false;
  private showGrid: boolean = false;
  private showAxes: boolean = false;
  private showBoundaries: boolean = false;
  private showPlayerInfo: boolean = false;
  private showResourceInfo: boolean = false;
  private showItemInfo: boolean = false;
  
  constructor(options: DebugToolsOptions) {
    this.scene = options.scene;
    this.playerRef = options.playerRef;
    this.resourceNodesRef = options.resourceNodesRef;
    this.worldItemsRef = options.worldItemsRef;
    this.playersRef = options.playersRef;
  }
  
  public toggleDebug(): boolean {
    this.showDebug = !this.showDebug;
    
    if (this.showDebug) {
      this.enableAllDebugFeatures();
    } else {
      this.disableAllDebugFeatures();
    }
    
    return this.showDebug;
  }
  
  public toggleGrid(): boolean {
    this.showGrid = !this.showGrid;
    
    if (this.showGrid) {
      this.enableGridHelper();
    } else {
      this.disableGridHelper();
    }
    
    return this.showGrid;
  }
  
  public toggleAxes(): boolean {
    this.showAxes = !this.showAxes;
    
    if (this.showAxes) {
      this.enableAxesHelper();
    } else {
      this.disableAxesHelper();
    }
    
    return this.showAxes;
  }
  
  public toggleBoundaries(): boolean {
    this.showBoundaries = !this.showBoundaries;
    
    if (this.showBoundaries) {
      this.enableBoundaryLines();
    } else {
      this.disableBoundaryLines();
    }
    
    return this.showBoundaries;
  }
  
  public togglePlayerInfo(): boolean {
    this.showPlayerInfo = !this.showPlayerInfo;
    return this.showPlayerInfo;
  }
  
  public toggleResourceInfo(): boolean {
    this.showResourceInfo = !this.showResourceInfo;
    return this.showResourceInfo;
  }
  
  public toggleItemInfo(): boolean {
    this.showItemInfo = !this.showItemInfo;
    return this.showItemInfo;
  }
  
  private enableAllDebugFeatures(): void {
    this.enableGridHelper();
    this.enableAxesHelper();
    this.enableBoundaryLines();
    this.showPlayerInfo = true;
    this.showResourceInfo = true;
    this.showItemInfo = true;
  }
  
  private disableAllDebugFeatures(): void {
    this.disableGridHelper();
    this.disableAxesHelper();
    this.disableBoundaryLines();
    this.showPlayerInfo = false;
    this.showResourceInfo = false;
    this.showItemInfo = false;
  }
  
  private enableGridHelper(): void {
    if (!this.gridHelper) {
      this.gridHelper = new THREE.GridHelper(100, 20, 0x444444, 0x888888);
      this.gridHelper.position.y = 0.01; // Slightly above ground to avoid z-fighting
      this.scene.add(this.gridHelper);
      this.debugObjects.push(this.gridHelper);
    }
  }
  
  private disableGridHelper(): void {
    if (this.gridHelper) {
      this.scene.remove(this.gridHelper);
      this.gridHelper = null;
    }
  }
  
  private enableAxesHelper(): void {
    if (!this.axesHelper) {
      this.axesHelper = new THREE.AxesHelper(20);
      this.axesHelper.position.y = 0.02; // Slightly above grid
      this.scene.add(this.axesHelper);
      this.debugObjects.push(this.axesHelper);
    }
  }
  
  private disableAxesHelper(): void {
    if (this.axesHelper) {
      this.scene.remove(this.axesHelper);
      this.axesHelper = null;
    }
  }
  
  private enableBoundaryLines(): void {
    if (!this.boundaryLines) {
      const lineGeometry = new THREE.BufferGeometry();
      const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
      
      // Define the outline of the world boundary box
      const linePoints = [
        new THREE.Vector3(WORLD_BOUNDS.minX, 0.03, WORLD_BOUNDS.minZ),
        new THREE.Vector3(WORLD_BOUNDS.maxX, 0.03, WORLD_BOUNDS.minZ),
        new THREE.Vector3(WORLD_BOUNDS.maxX, 0.03, WORLD_BOUNDS.maxZ),
        new THREE.Vector3(WORLD_BOUNDS.minX, 0.03, WORLD_BOUNDS.maxZ),
        new THREE.Vector3(WORLD_BOUNDS.minX, 0.03, WORLD_BOUNDS.minZ)
      ];
      
      lineGeometry.setFromPoints(linePoints);
      this.boundaryLines = new THREE.Line(lineGeometry, lineMaterial);
      this.scene.add(this.boundaryLines);
      this.debugObjects.push(this.boundaryLines);
    }
  }
  
  private disableBoundaryLines(): void {
    if (this.boundaryLines) {
      this.scene.remove(this.boundaryLines);
      this.boundaryLines = null;
    }
  }
  
  public logDebugInfo(): void {
    if (!this.showDebug) return;
    
    if (this.showPlayerInfo) {
      this.logPlayerInfo();
    }
    
    if (this.showResourceInfo) {
      this.logResourceInfo();
    }
    
    if (this.showItemInfo) {
      this.logItemInfo();
    }
  }
  
  private logPlayerInfo(): void {
    const player = this.playerRef.current;
    if (!player) return;
    
    console.log('===== Player Info =====');
    console.log(`Position: (${player.position.x.toFixed(2)}, ${player.position.y.toFixed(2)}, ${player.position.z.toFixed(2)})`);
    console.log(`Other Players: ${this.playersRef.current.size}`);
    
    // Log all other players
    this.playersRef.current.forEach((mesh, id) => {
      console.log(`  - ${id}: (${mesh.position.x.toFixed(2)}, ${mesh.position.y.toFixed(2)}, ${mesh.position.z.toFixed(2)})`);
    });
  }
  
  private logResourceInfo(): void {
    console.log('===== Resource Nodes =====');
    console.log(`Total Nodes: ${this.resourceNodesRef.current.length}`);
    
    // Group by type
    const nodesByType: Record<string, number> = {};
    this.resourceNodesRef.current.forEach(node => {
      if (!nodesByType[node.type]) {
        nodesByType[node.type] = 0;
      }
      nodesByType[node.type]++;
    });
    
    // Log counts by type
    Object.entries(nodesByType).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
  }
  
  private logItemInfo(): void {
    console.log('===== World Items =====');
    console.log(`Total Items: ${this.worldItemsRef.current.length}`);
    
    // Group by type
    const itemsByType: Record<string, number> = {};
    this.worldItemsRef.current.forEach(item => {
      if (!itemsByType[item.itemType]) {
        itemsByType[item.itemType] = 0;
      }
      itemsByType[item.itemType]++;
    });
    
    // Log counts by type
    Object.entries(itemsByType).forEach(([type, count]) => {
      console.log(`  - ${type}: ${count}`);
    });
  }
  
  public cleanup(): void {
    // Remove all debug objects from scene
    this.debugObjects.forEach(obj => {
      this.scene.remove(obj);
      
      // Dispose of geometries and materials if possible
      if (obj instanceof THREE.Mesh || obj instanceof THREE.Line) {
        if (obj.geometry) {
          obj.geometry.dispose();
        }
        
        if (obj.material) {
          if (Array.isArray(obj.material)) {
            obj.material.forEach(material => material.dispose());
          } else {
            obj.material.dispose();
          }
        }
      }
    });
    
    // Clear debug objects array
    this.debugObjects = [];
    
    // Clear references
    this.gridHelper = null;
    this.axesHelper = null;
    this.boundaryLines = null;
  }
}

export default DebugTools; 