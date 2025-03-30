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
import ResourceController from '../../components/game/ResourceController';

// World boundaries
const WORLD_BOUNDS = {
  minX: -250, 
  maxX: 250,
  minZ: -250,
  maxZ: 250
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
  private resourceController: ResourceController | null = null;
  
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
  
  // Get the resource controller instance
  public getResourceController(): ResourceController | null {
    return this.resourceController;
  }
  
  // Set the resource controller
  public setResourceController(controller: ResourceController): void {
    this.resourceController = controller;
  }

  private initialize() {
    if (!this.scene) return;

    // Create multiple ground planes for different regions
    
    // Main Lumbridge area (center) - green grass
    this.groundGeometry = new THREE.PlaneGeometry(600, 600);
    this.groundMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x4caf50,  // Green color for grass
      roughness: 0.8,
      metalness: 0.2
    });
    const mainGround = new THREE.Mesh(this.groundGeometry, this.groundMaterial);
    mainGround.rotation.x = -Math.PI / 2;
    mainGround.position.y = 0;
    this.scene.add(mainGround);
    
    // Wilderness area - volcanic ring around the map
    // Create a large outer ring for the wilderness (20x larger)
    const outerWildernessRadius = 5000; // Increased from 250 to 5000
    const innerWildernessRadius = 300; // Doubled from 150 to 300
    const wildernessRingGeometry = new THREE.RingGeometry(innerWildernessRadius, outerWildernessRadius, 64);
    const wildernessMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x3E2723,  // Very dark brown for volcanic ground
      roughness: 0.9,
      metalness: 0.3,
      emissive: 0x330000,  // Slight red glow
      emissiveIntensity: 0.2
    });
    
    const wildernessGround = new THREE.Mesh(wildernessRingGeometry, wildernessMaterial);
    wildernessGround.rotation.x = -Math.PI / 2;
    wildernessGround.position.y = -0.1; // Slightly below other terrain
    this.scene.add(wildernessGround);
    
    // Add lava pools in the wilderness
    this.createLavaPools();
    
    // Barbarian Village area (west) - rocky terrain
    const barbarianGeometry = new THREE.PlaneGeometry(100, 100);
    const barbarianMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x8D6E63,  // Light brown for rocky area
      roughness: 0.9,
      metalness: 0.1
    });
    const barbarianGround = new THREE.Mesh(barbarianGeometry, barbarianMaterial);
    barbarianGround.rotation.x = -Math.PI / 2;
    barbarianGround.position.set(-90, -0.05, 0); // Slightly below other terrain and to the west
    this.scene.add(barbarianGround);
    
    // Grand Exchange area (east) - paved/urban
    const exchangeGeometry = new THREE.PlaneGeometry(100, 100);
    const exchangeMaterial = new THREE.MeshStandardMaterial({ 
      color: 0x9E9E9E,  // Gray for urban/paved area
      roughness: 0.7,
      metalness: 0.3
    });
    const exchangeGround = new THREE.Mesh(exchangeGeometry, exchangeMaterial);
    exchangeGround.rotation.x = -Math.PI / 2;
    exchangeGround.position.set(90, -0.05, 0); // Slightly below other terrain and to the east
    this.scene.add(exchangeGround);
    
    // Create a larger grid for reference
    const gridHelper = new THREE.GridHelper(5000, 500); // Increased from 500 to 5000
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
    
    // Place markers at corners and midpoints of the safe zone
    const safeZonePoints = [
      // Corners of the safe central area
      { x: -300, z: -300 },
      { x: -300, z: 300 },
      { x: 300, z: -300 },
      { x: 300, z: 300 },
    ];
    
    // Create and add markers to scene
    safeZonePoints.forEach(point => {
      const marker = new THREE.Mesh(this.markerGeometry, this.markerMaterial);
      marker.position.set(point.x, 1, point.z); // Position at y=1 to be visible above ground
      this.scene.add(marker);
    });
    
    // Create visible lines along the safe zone boundaries
    const lineGeometry = new THREE.BufferGeometry();
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
    
    // Define the outline of the safe zone (on ground level)
    const linePoints = [
      // Safe zone square
      new THREE.Vector3(-300, 0.1, -300),
      new THREE.Vector3(300, 0.1, -300),
      new THREE.Vector3(300, 0.1, 300),
      new THREE.Vector3(-300, 0.1, 300),
      new THREE.Vector3(-300, 0.1, -300)
    ];
    
    lineGeometry.setFromPoints(linePoints);
    const boundaryLine = new THREE.Line(lineGeometry, lineMaterial);
    this.scene.add(boundaryLine);
    
    // Add zone identifier signs
    this.createZoneSign("LUMBRIDGE", 0, 20, 0, 0x4CAF50);
    this.createZoneSign("WILDERNESS", 0, 30, -500, 0xFF5722, 2.0); // Larger sign for the Wilderness
    this.createZoneSign("DEEP WILDERNESS", 0, 40, -2000, 0xF44336, 3.0); // Even larger sign for Deep Wilderness
    this.createZoneSign("BARBARIAN VILLAGE", -90, 20, 0, 0x795548);
    this.createZoneSign("GRAND EXCHANGE", 90, 20, 0, 0x9E9E9E);
    
    // Add additional wilderness warning markers
    this.createWildernessWarningMarkers();
  }
  
  // Create additional warning markers in the wilderness
  private createWildernessWarningMarkers() {
    // Warning material
    const warningMaterial = new THREE.MeshBasicMaterial({ color: 0xFF0000 }); // Red
    
    // Place warning posts at various wilderness depths
    const warningLocations = [
      { x: 0, z: -350, text: "WARNING: Entering Wilderness" },
      { x: 350, z: 0, text: "WARNING: PvP Zone" },
      { x: -350, z: 0, text: "WARNING: PvP Zone" },
      { x: 0, z: 350, text: "WARNING: PvP Zone" },
      { x: 0, z: -1000, text: "DANGER: Deep Wilderness" },
      { x: 1000, z: 0, text: "DANGER: Deep Wilderness" },
      { x: -1000, z: 0, text: "DANGER: Deep Wilderness" },
      { x: 0, z: 1000, text: "DANGER: Deep Wilderness" },
    ];
    
    warningLocations.forEach(location => {
      // Create warning post
      const postGeometry = new THREE.BoxGeometry(0.5, 3, 0.5);
      const post = new THREE.Mesh(postGeometry, warningMaterial);
      post.position.set(location.x, 5.5, location.z);
      this.scene.add(post);
      
      // Create warning sign
      this.createWarningSign(location.text, location.x, 7, location.z);
    });
  }
  
  // Create a warning sign
  private createWarningSign(text: string, x: number, y: number, z: number) {
    // Create sign canvas
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    
    if (context) {
      // Draw warning sign
      context.fillStyle = 'rgba(0, 0, 0, 0.8)';
      context.fillRect(0, 0, 256, 128);
      
      // Add hazard stripes to border
      context.strokeStyle = '#FFFF00'; // Yellow
      context.lineWidth = 10;
      context.strokeRect(5, 5, 246, 118);
      
      // Draw text
      context.font = 'Bold 18px Arial';
      context.fillStyle = '#FF0000'; // Red text
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      
      // Split text into lines if needed
      const words = text.split(' ');
      let line = '';
      let lines = [];
      for (let i = 0; i < words.length; i++) {
        const testLine = line + words[i] + ' ';
        if (context.measureText(testLine).width > 230) {
          lines.push(line);
          line = words[i] + ' ';
        } else {
          line = testLine;
        }
      }
      lines.push(line);
      
      // Draw each line
      const lineHeight = 20;
      const startY = 64 - ((lines.length - 1) * lineHeight / 2);
      lines.forEach((line, i) => {
        context.fillText(line, 128, startY + i * lineHeight);
      });
      
      // Create sprite from canvas
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(7, 3.5, 1);
      sprite.position.set(x, y, z);
      
      // Add sprite
      this.scene.add(sprite);
    }
  }

  // Helper method to create 3D text signs for zones
  private createZoneSign(text: string, x: number, y: number, z: number, color: number, scale: number = 1.0) {
    // Create a simple plane with text as a sprite
    const canvas = document.createElement('canvas');
    canvas.width = 512; // Larger canvas for better text quality
    canvas.height = 128;
    const context = canvas.getContext('2d');
    
    if (context) {
      // Draw background
      context.fillStyle = 'rgba(0, 0, 0, 0.7)';
      context.fillRect(0, 0, 512, 128);
      
      // Draw border
      context.strokeStyle = '#' + color.toString(16).padStart(6, '0');
      context.lineWidth = 5;
      context.strokeRect(5, 5, 502, 118);
      
      // Draw text
      context.font = `Bold ${Math.floor(36 * scale)}px Arial`;
      context.fillStyle = '#FFFFFF'; // White text
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, 256, 64);
      
      // Create sprite from canvas
      const texture = new THREE.CanvasTexture(canvas);
      const spriteMaterial = new THREE.SpriteMaterial({ 
        map: texture,
        transparent: true
      });
      const sprite = new THREE.Sprite(spriteMaterial);
      sprite.scale.set(20 * scale, 10 * scale, 1);
      sprite.position.set(x, y, z);
      
      // Add sprite
      this.scene.add(sprite);
    }
  }

  private createWorldResources() {
    // Clear existing resources
    this.resourceNodes.forEach(node => {
      if (node.mesh) {
        this.scene.remove(node.mesh);
      }
    });
    this.resourceNodes = [];
    
    console.log("%c 🌳 INITIALIZING WORLD RESOURCES", "background: #FF5722; color: white; font-size: 16px; font-weight: bold;");
    
    // Define resource nodes - EXPANDED WITH MANY MORE RESOURCES AND ADJUSTED FOR RING LAYOUT
    const resources: ResourceNode[] = [
      // LUMBRIDGE AREA (CENTER) - Basic resources
      // Normal trees in Lumbridge
      { id: 'tree-1', type: ResourceType.TREE, x: 10, y: 1, z: 10, metadata: { treeType: 'tree' } },
      { id: 'tree-2', type: ResourceType.TREE, x: 15, y: 1, z: 15, metadata: { treeType: 'tree' } },
      { id: 'tree-3', type: ResourceType.TREE, x: 20, y: 1, z: 10, metadata: { treeType: 'tree' } },
      { id: 'tree-4', type: ResourceType.TREE, x: 5, y: 1, z: 20, metadata: { treeType: 'tree' } },
      { id: 'tree-5', type: ResourceType.TREE, x: 25, y: 1, z: 5, metadata: { treeType: 'tree' } },
      { id: 'tree-6', type: ResourceType.TREE, x: -5, y: 1, z: 15, metadata: { treeType: 'tree' } },
      { id: 'tree-7', type: ResourceType.TREE, x: -15, y: 1, z: 10, metadata: { treeType: 'tree' } },
      { id: 'tree-8', type: ResourceType.TREE, x: 12, y: 1, z: -8, metadata: { treeType: 'tree' } },
      { id: 'tree-9', type: ResourceType.TREE, x: 8, y: 1, z: -12, metadata: { treeType: 'tree' } },
      { id: 'tree-10', type: ResourceType.TREE, x: -10, y: 1, z: -5, metadata: { treeType: 'tree' } },
      
      // Oak trees near Lumbridge
      { id: 'oak_tree-1', type: ResourceType.TREE, x: 30, y: 1, z: 20, metadata: { treeType: 'oak_tree' } },
      { id: 'oak_tree-2', type: ResourceType.TREE, x: 35, y: 1, z: 25, metadata: { treeType: 'oak_tree' } },
      { id: 'oak_tree-3', type: ResourceType.TREE, x: 40, y: 1, z: 15, metadata: { treeType: 'oak_tree' } },
      { id: 'oak_tree-4', type: ResourceType.TREE, x: 45, y: 1, z: 20, metadata: { treeType: 'oak_tree' } },
      { id: 'oak_tree-5', type: ResourceType.TREE, x: 35, y: 1, z: 30, metadata: { treeType: 'oak_tree' } },
      { id: 'oak_tree-6', type: ResourceType.TREE, x: 25, y: 1, z: 35, metadata: { treeType: 'oak_tree' } },
      
      // Willow trees near river
      { id: 'willow_tree-1', type: ResourceType.TREE, x: -20, y: 1, z: 30, metadata: { treeType: 'willow_tree' } },
      { id: 'willow_tree-2', type: ResourceType.TREE, x: -25, y: 1, z: 35, metadata: { treeType: 'willow_tree' } },
      { id: 'willow_tree-3', type: ResourceType.TREE, x: -15, y: 1, z: 40, metadata: { treeType: 'willow_tree' } },
      { id: 'willow_tree-4', type: ResourceType.TREE, x: -30, y: 1, z: 45, metadata: { treeType: 'willow_tree' } },
      { id: 'willow_tree-5', type: ResourceType.TREE, x: -35, y: 1, z: 50, metadata: { treeType: 'willow_tree' } },
      
      // Basic rocks in Lumbridge
      { id: 'rock-lumb-1', type: ResourceType.ROCK, x: 15, y: 1, z: -40, metadata: { rockType: 'copper_rock' } },
      { id: 'rock-lumb-2', type: ResourceType.ROCK, x: 20, y: 1, z: -45, metadata: { rockType: 'tin_rock' } },
      { id: 'rock-lumb-3', type: ResourceType.ROCK, x: 25, y: 1, z: -40, metadata: { rockType: 'copper_rock' } },
      { id: 'rock-lumb-4', type: ResourceType.ROCK, x: 30, y: 1, z: -45, metadata: { rockType: 'tin_rock' } },
      
      // BARBARIAN VILLAGE (WEST) - Mining focused
      // Rocks in Barbarian Village
      { id: 'rock-1', type: ResourceType.ROCK, x: -80, y: 1, z: -20, metadata: { rockType: 'copper_rock' } },
      { id: 'rock-2', type: ResourceType.ROCK, x: -85, y: 1, z: -15, metadata: { rockType: 'tin_rock' } },
      { id: 'rock-3', type: ResourceType.ROCK, x: -90, y: 1, z: -20, metadata: { rockType: 'iron_rock' } },
      { id: 'rock-4', type: ResourceType.ROCK, x: -95, y: 1, z: -25, metadata: { rockType: 'coal_rock' } },
      { id: 'rock-5', type: ResourceType.ROCK, x: -100, y: 1, z: -30, metadata: { rockType: 'copper_rock' } },
      { id: 'rock-6', type: ResourceType.ROCK, x: -105, y: 1, z: -15, metadata: { rockType: 'tin_rock' } },
      { id: 'rock-7', type: ResourceType.ROCK, x: -110, y: 1, z: -20, metadata: { rockType: 'iron_rock' } },
      { id: 'rock-8', type: ResourceType.ROCK, x: -115, y: 1, z: -25, metadata: { rockType: 'coal_rock' } },
      { id: 'rock-9', type: ResourceType.ROCK, x: -90, y: 1, z: -30, metadata: { rockType: 'iron_rock' } },
      { id: 'rock-10', type: ResourceType.ROCK, x: -100, y: 1, z: -35, metadata: { rockType: 'coal_rock' } },
      
      // Some trees in Barbarian Village
      { id: 'barb-tree-1', type: ResourceType.TREE, x: -80, y: 1, z: 20, metadata: { treeType: 'tree' } },
      { id: 'barb-tree-2', type: ResourceType.TREE, x: -90, y: 1, z: 25, metadata: { treeType: 'tree' } },
      { id: 'barb-oak-1', type: ResourceType.TREE, x: -100, y: 1, z: 15, metadata: { treeType: 'oak_tree' } },
      
      // GRAND EXCHANGE (EAST) - Mixed resources
      // Trees near Grand Exchange
      { id: 'ge-tree-1', type: ResourceType.TREE, x: 80, y: 1, z: 20, metadata: { treeType: 'tree' } },
      { id: 'ge-tree-2', type: ResourceType.TREE, x: 90, y: 1, z: 15, metadata: { treeType: 'tree' } },
      { id: 'ge-oak-1', type: ResourceType.TREE, x: 100, y: 1, z: 25, metadata: { treeType: 'oak_tree' } },
      { id: 'ge-oak-2', type: ResourceType.TREE, x: 110, y: 1, z: 30, metadata: { treeType: 'oak_tree' } },
      { id: 'ge-willow-1', type: ResourceType.TREE, x: 105, y: 1, z: 40, metadata: { treeType: 'willow_tree' } },
      
      // Rocks near Grand Exchange
      { id: 'ge-rock-1', type: ResourceType.ROCK, x: 90, y: 1, z: -20, metadata: { rockType: 'copper_rock' } },
      { id: 'ge-rock-2', type: ResourceType.ROCK, x: 100, y: 1, z: -25, metadata: { rockType: 'tin_rock' } },
      { id: 'ge-rock-3', type: ResourceType.ROCK, x: 110, y: 1, z: -30, metadata: { rockType: 'iron_rock' } },
      
      // WILDERNESS RING - High level resources scattered around the ring
      // Make these way further out in the expanded wilderness
      // Maple trees in wilderness (northern section)
      { id: 'maple_tree-1', type: ResourceType.TREE, x: 0, y: 1, z: -2000, metadata: { treeType: 'maple_tree' } },
      { id: 'maple_tree-2', type: ResourceType.TREE, x: 200, y: 1, z: -2200, metadata: { treeType: 'maple_tree' } },
      { id: 'maple_tree-3', type: ResourceType.TREE, x: 400, y: 1, z: -1950, metadata: { treeType: 'maple_tree' } },
      { id: 'maple_tree-4', type: ResourceType.TREE, x: -200, y: 1, z: -2000, metadata: { treeType: 'maple_tree' } },
      { id: 'maple_tree-5', type: ResourceType.TREE, x: -400, y: 1, z: -1950, metadata: { treeType: 'maple_tree' } },
      { id: 'maple_tree-6', type: ResourceType.TREE, x: 600, y: 1, z: -2400, metadata: { treeType: 'maple_tree' } },
      { id: 'maple_tree-7', type: ResourceType.TREE, x: -600, y: 1, z: -2400, metadata: { treeType: 'maple_tree' } },
      
      // Yew trees in wilderness (eastern section)
      { id: 'yew_tree-1', type: ResourceType.TREE, x: 2000, y: 1, z: 200, metadata: { treeType: 'yew_tree' } },
      { id: 'yew_tree-2', type: ResourceType.TREE, x: 2000, y: 1, z: 400, metadata: { treeType: 'yew_tree' } },
      { id: 'yew_tree-3', type: ResourceType.TREE, x: 1950, y: 1, z: 600, metadata: { treeType: 'yew_tree' } },
      { id: 'yew_tree-4', type: ResourceType.TREE, x: 1950, y: 1, z: -200, metadata: { treeType: 'yew_tree' } },
      { id: 'yew_tree-5', type: ResourceType.TREE, x: 2200, y: 1, z: 0, metadata: { treeType: 'yew_tree' } },
      { id: 'yew_tree-6', type: ResourceType.TREE, x: 2400, y: 1, z: 300, metadata: { treeType: 'yew_tree' } },
      
      // Gold rocks in wilderness (western section)
      { id: 'wild-rock-1', type: ResourceType.ROCK, x: -2000, y: 1, z: 200, metadata: { rockType: 'gold_rock' } },
      { id: 'wild-rock-2', type: ResourceType.ROCK, x: -2000, y: 1, z: 400, metadata: { rockType: 'gold_rock' } },
      { id: 'wild-rock-3', type: ResourceType.ROCK, x: -1950, y: 1, z: 600, metadata: { rockType: 'gold_rock' } },
      { id: 'wild-rock-4', type: ResourceType.ROCK, x: -2200, y: 1, z: 0, metadata: { rockType: 'gold_rock' } },
      { id: 'wild-rock-5', type: ResourceType.ROCK, x: -2400, y: 1, z: 300, metadata: { rockType: 'gold_rock' } },
      
      // Mithril rocks in wilderness (southern section)
      { id: 'wild-rock-6', type: ResourceType.ROCK, x: 200, y: 1, z: 2000, metadata: { rockType: 'mithril_rock' } },
      { id: 'wild-rock-7', type: ResourceType.ROCK, x: 400, y: 1, z: 1950, metadata: { rockType: 'mithril_rock' } },
      { id: 'wild-rock-8', type: ResourceType.ROCK, x: -200, y: 1, z: 2000, metadata: { rockType: 'mithril_rock' } },
      { id: 'wild-rock-9', type: ResourceType.ROCK, x: -400, y: 1, z: 1950, metadata: { rockType: 'mithril_rock' } },
      { id: 'wild-rock-10', type: ResourceType.ROCK, x: 0, y: 1, z: 2200, metadata: { rockType: 'mithril_rock' } },
      { id: 'wild-rock-11', type: ResourceType.ROCK, x: 300, y: 1, z: 2400, metadata: { rockType: 'mithril_rock' } },
      
      // Adamantite rocks in wilderness (northeastern section)
      { id: 'wild-rock-addy-1', type: ResourceType.ROCK, x: 1500, y: 1, z: -1500, metadata: { rockType: 'adamantite_rock' } },
      { id: 'wild-rock-addy-2', type: ResourceType.ROCK, x: 1600, y: 1, z: -1600, metadata: { rockType: 'adamantite_rock' } },
      { id: 'wild-rock-addy-3', type: ResourceType.ROCK, x: 1700, y: 1, z: -1700, metadata: { rockType: 'adamantite_rock' } },
      { id: 'wild-rock-addy-4', type: ResourceType.ROCK, x: 1800, y: 1, z: -1800, metadata: { rockType: 'adamantite_rock' } },
      { id: 'wild-rock-addy-5', type: ResourceType.ROCK, x: 1900, y: 1, z: -1900, metadata: { rockType: 'adamantite_rock' } },
      
      // Runite rocks in wilderness (northwestern section)
      { id: 'wild-rock-rune-1', type: ResourceType.ROCK, x: -1500, y: 1, z: -1500, metadata: { rockType: 'runite_rock' } },
      { id: 'wild-rock-rune-2', type: ResourceType.ROCK, x: -1600, y: 1, z: -1600, metadata: { rockType: 'runite_rock' } },
      { id: 'wild-rock-rune-3', type: ResourceType.ROCK, x: -1700, y: 1, z: -1700, metadata: { rockType: 'runite_rock' } },
      
      // Magic trees in deep wilderness (southwestern section)
      { id: 'magic_tree-1', type: ResourceType.TREE, x: -1500, y: 1, z: 1500, metadata: { treeType: 'magic_tree' } },
      { id: 'magic_tree-2', type: ResourceType.TREE, x: -1600, y: 1, z: 1600, metadata: { treeType: 'magic_tree' } },
      { id: 'magic_tree-3', type: ResourceType.TREE, x: -1700, y: 1, z: 1700, metadata: { treeType: 'magic_tree' } },
      { id: 'magic_tree-4', type: ResourceType.TREE, x: -1800, y: 1, z: 1800, metadata: { treeType: 'magic_tree' } },
      
      // Fishing spots inside safe area
      { id: 'fishing_spot-1', type: ResourceType.FISHING_SPOT, x: 30, y: 1, z: -30, metadata: { spotType: 'net', fishTypes: ['shrimp', 'sardine'] } },
      { id: 'fishing_spot-2', type: ResourceType.FISHING_SPOT, x: 25, y: 1, z: -30, metadata: { spotType: 'net', fishTypes: ['shrimp', 'sardine'] } },
      { id: 'fishing_spot-3', type: ResourceType.FISHING_SPOT, x: 35, y: 1, z: -35, metadata: { spotType: 'net', fishTypes: ['shrimp', 'sardine'] } },
      { id: 'fishing_spot-4', type: ResourceType.FISHING_SPOT, x: 40, y: 1, z: -40, metadata: { spotType: 'net', fishTypes: ['shrimp', 'sardine'] } },
    ];
    
    console.log(`%c 🌳 Creating ${resources.length} default resource nodes`, "background: #4CAF50; color: white; font-size: 14px;");
    
    // Create meshes for each resource and add to scene
    resources.forEach(resource => {
      console.log(`Creating resource: ${resource.id} of type ${resource.type} at (${resource.x}, ${resource.y}, ${resource.z})`);
      try {
        const mesh = createResourceMesh(resource.type as ResourceType, resource.state || 'normal', resource.metadata);
        mesh.position.set(resource.x, resource.y, resource.z);
        
        // Store resource ID in userData for raycasting identification
        mesh.userData.resourceId = resource.id;
        mesh.userData.resourceType = resource.type;
        mesh.userData.metadata = resource.metadata;
        
        // Create label for the resource
        this.createResourceLabel(resource, mesh);
        
        this.scene.add(mesh);
        
        // Store reference to mesh in resource node
        this.resourceNodes.push({
          ...resource,
          mesh: mesh as unknown as THREE.Mesh
        });
      } catch (error) {
        console.error(`Failed to create resource mesh for ${resource.id} of type ${resource.type}:`, error);
      }
    });

    // Define and create fishing spots - near water areas and in wilderness areas
    const fishingSpots: ResourceNode[] = [
      // Lumbridge fishing spots
      { id: 'fishing_spot_lumbridge_1', type: ResourceType.FISHING_SPOT, x: 20, y: 1, z: 30, metadata: { spotType: 'net', fishTypes: ['shrimp', 'sardine'] } },
      { id: 'fishing_spot_lumbridge_2', type: ResourceType.FISHING_SPOT, x: 25, y: 1, z: 30, metadata: { spotType: 'net', fishTypes: ['shrimp', 'sardine'] } },
      
      // Wilderness fishing spots (higher level fish) - around the lava pools
      { id: 'fishing_spot_wilderness_1', type: ResourceType.FISHING_SPOT, x: 800, y: 1, z: 800, metadata: { spotType: 'harpoon', fishTypes: ['trout', 'salmon'] } },
      { id: 'fishing_spot_wilderness_2', type: ResourceType.FISHING_SPOT, x: -800, y: 1, z: -800, metadata: { spotType: 'harpoon', fishTypes: ['trout', 'salmon'] } },
      { id: 'fishing_spot_wilderness_3', type: ResourceType.FISHING_SPOT, x: -800, y: 1, z: 800, metadata: { spotType: 'harpoon', fishTypes: ['trout', 'salmon', 'shark'] } },
      { id: 'fishing_spot_wilderness_4', type: ResourceType.FISHING_SPOT, x: 800, y: 1, z: -800, metadata: { spotType: 'harpoon', fishTypes: ['trout', 'salmon', 'shark'] } },
      
      // Deep wilderness fishing spots (highest level)
      { id: 'fishing_spot_deep_wild_1', type: ResourceType.FISHING_SPOT, x: 1200, y: 1, z: 0, metadata: { spotType: 'harpoon', fishTypes: ['shark', 'swordfish'] } },
      { id: 'fishing_spot_deep_wild_2', type: ResourceType.FISHING_SPOT, x: 0, y: 1, z: 1200, metadata: { spotType: 'harpoon', fishTypes: ['shark', 'swordfish'] } },
      
      // Barbarian Village fishing spots
      { id: 'fishing_spot_barbarian_1', type: ResourceType.FISHING_SPOT, x: -80, y: 1, z: 50, metadata: { spotType: 'cage', fishTypes: ['trout', 'salmon', 'pike'] } },
      { id: 'fishing_spot_barbarian_2', type: ResourceType.FISHING_SPOT, x: -85, y: 1, z: 55, metadata: { spotType: 'cage', fishTypes: ['trout', 'salmon', 'pike'] } },
      
      // Grand Exchange area fishing spots
      { id: 'fishing_spot_ge_1', type: ResourceType.FISHING_SPOT, x: 90, y: 1, z: 70, metadata: { spotType: 'net', fishTypes: ['shrimp', 'sardine'] } },
      { id: 'fishing_spot_ge_2', type: ResourceType.FISHING_SPOT, x: 95, y: 1, z: 75, metadata: { spotType: 'net', fishTypes: ['shrimp', 'sardine'] } },
    ];
    
    console.log(`%c 🎣 Adding ${fishingSpots.length} fishing spots`, "background: #2196F3; color: white; font-size: 14px;");
    
    // Add fishing spots to resources
    this.addResourcesToScene(fishingSpots);

    // Pass the created resource nodes to parent component
    console.log(`%c 🏆 Total resources created: ${this.resourceNodes.length}`, "background: #9C27B0; color: white; font-size: 14px;");
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
  
  // Add new method to add resources to the scene
  private addResourcesToScene(resources: ResourceNode[]): void {
    console.log(`%c 🌊 Adding ${resources.length} resource nodes to scene`, "background: #2196F3; color: white;");
    
    // Debug log resource details
    resources.forEach(resource => {
      console.log(`Resource ${resource.id} (${resource.type}) metadata:`, resource.metadata);
    });
    
    // Create meshes for each resource and add to scene
    resources.forEach(resource => {
      // Ensure we're using the ResourceType enum
      const resourceType = resource.type as unknown as ResourceType;
      
      try {
        const mesh = createResourceMesh(resourceType, resource.state || 'normal', resource.metadata);
        mesh.position.set(resource.x, resource.y, resource.z);
        
        // Store resource ID in userData for raycasting identification
        mesh.userData.resourceId = resource.id;
        mesh.userData.resourceType = resource.type;
        mesh.userData.metadata = resource.metadata;
        
        this.scene.add(mesh);
        
        // Create label for the resource
        this.createResourceLabel(resource, mesh);
        
        // Store reference to mesh in resource node
        this.resourceNodes.push({
          ...resource,
          mesh: mesh as unknown as THREE.Mesh
        });
      } catch (error) {
        console.error(`Failed to create resource mesh for ${resource.id} of type ${resource.type}:`, error);
      }
    });
  }

  // Create a label for a resource node
  private createResourceLabel(resource: ResourceNode, mesh: THREE.Object3D): void {
    // Determine label text based on resource type and metadata
    let labelText = "";
    
    if (resource.type === ResourceType.TREE) {
      const treeType = resource.metadata?.treeType || 'tree';
      const displayTreeType = treeType.replace('_tree', '').replace('_', ' ');
      labelText = `Chop ${displayTreeType}`;
    } 
    else if (resource.type === ResourceType.ROCK) {
      const rockType = resource.metadata?.rockType || 'rock';
      const displayRockType = rockType.replace('_rock', '').replace('_', ' ');
      labelText = `Mine ${displayRockType}`;
    }
    else if (resource.type === ResourceType.FISHING_SPOT) {
      const spotType = resource.metadata?.spotType || 'fishing spot';
      const fishTypes = resource.metadata?.fishTypes || [];
      
      if (fishTypes.length > 0) {
        const displayFishType = fishTypes[0].replace('_', ' ');
        labelText = `Fish ${displayFishType}`;
      } else {
        labelText = `Fishing spot`;
      }
    }
    
    if (labelText) {
      // Create canvas for label text
      const canvas = document.createElement('canvas');
      canvas.width = 256;
      canvas.height = 64;
      const context = canvas.getContext('2d');
      
      if (context) {
        // Draw background with transparency
        context.fillStyle = 'rgba(0, 0, 0, 0.6)';
        context.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw border
        context.strokeStyle = '#FFFFFF';
        context.lineWidth = 2;
        context.strokeRect(2, 2, canvas.width - 4, canvas.height - 4);
        
        // Draw text
        context.font = 'bold 20px Arial';
        context.fillStyle = '#FFFFFF';
        context.textAlign = 'center';
        context.textBaseline = 'middle';
        context.fillText(labelText, canvas.width / 2, canvas.height / 2);
        
        // Create sprite from canvas
        const texture = new THREE.CanvasTexture(canvas);
        const material = new THREE.SpriteMaterial({ 
          map: texture, 
          transparent: true,
          depthTest: false // Always show on top
        });
        
        const sprite = new THREE.Sprite(material);
        sprite.scale.set(5, 1.5, 1);
        
        // Position label above resource
        const meshHeight = mesh.scale.y || 1;
        const labelHeight = resource.type === ResourceType.TREE ? 6 : 2; // Trees are taller
        sprite.position.set(0, labelHeight, 0);
        
        // Add label as a child of the resource mesh
        mesh.add(sprite);
      }
    }
  }

  // Create lava pools in the wilderness
  private createLavaPools() {
    // Create several lava pools across the wilderness (with more spread out positions)
    const lavaPools = [
      { x: 400, z: 0, radius: 30 },
      { x: -400, z: 0, radius: 40 },
      { x: 0, z: 400, radius: 50 },
      { x: 0, z: -400, radius: 36 },
      { x: 300, z: 300, radius: 24 },
      { x: -300, z: -300, radius: 44 },
      { x: 300, z: -300, radius: 30 },
      { x: -300, z: 300, radius: 36 },
      { x: 800, z: 800, radius: 60 },
      { x: -800, z: -800, radius: 70 },
      { x: 800, z: -800, radius: 55 },
      { x: -800, z: 800, radius: 65 },
      { x: 1200, z: 0, radius: 80 },
      { x: -1200, z: 0, radius: 90 },
      { x: 0, z: 1200, radius: 100 },
      { x: 0, z: -1200, radius: 85 },
    ];
    
    // Lava material with glow effect
    const lavaMaterial = new THREE.MeshStandardMaterial({
      color: 0xFF5722,  // Orange-red color
      emissive: 0xFF3D00,
      emissiveIntensity: 0.8,
      roughness: 0.2,
      metalness: 0.0
    });
    
    lavaPools.forEach(pool => {
      const lavaGeometry = new THREE.CircleGeometry(pool.radius, 32);
      const lavaMesh = new THREE.Mesh(lavaGeometry, lavaMaterial);
      lavaMesh.rotation.x = -Math.PI / 2;
      lavaMesh.position.set(pool.x, 0.05, pool.z); // Slightly above ground
      
      // Add pulsing animation data to userData
      lavaMesh.userData.animationData = {
        baseIntensity: 0.8,
        pulseSpeed: 1 + Math.random() * 2,
        timeOffset: Math.random() * Math.PI * 2
      };
      
      this.scene.add(lavaMesh);
      
      // Add some smoke particles above lava (simple representation)
      const smokeGeometry = new THREE.PlaneGeometry(pool.radius * 1.5, pool.radius * 1.5);
      const smokeTexture = new THREE.CanvasTexture(this.createSmokeTexture());
      const smokeMaterial = new THREE.MeshBasicMaterial({
        map: smokeTexture,
        transparent: true,
        opacity: 0.4
      });
      
      const smokeMesh = new THREE.Mesh(smokeGeometry, smokeMaterial);
      smokeMesh.position.set(pool.x, pool.radius * 0.5, pool.z);
      smokeMesh.rotation.x = -Math.PI / 2;
      this.scene.add(smokeMesh);
    });
  }
  
  // Create a smoke texture using canvas
  private createSmokeTexture(): HTMLCanvasElement {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    
    if (context) {
      // Create a radial gradient for smoke effect
      const gradient = context.createRadialGradient(
        64, 64, 0,
        64, 64, 64
      );
      
      gradient.addColorStop(0, 'rgba(255, 255, 255, 0.7)');
      gradient.addColorStop(0.5, 'rgba(150, 150, 150, 0.3)');
      gradient.addColorStop(1, 'rgba(100, 100, 100, 0)');
      
      context.fillStyle = gradient;
      context.fillRect(0, 0, 128, 128);
    }
    
    return canvas;
  }

  /**
   * Update the state of a resource node
   */
  public updateResourceState(resourceId: string, state: 'normal' | 'harvested'): void {
    const resourceNode = this.resourceNodes.find(node => node.id === resourceId);
    if (!resourceNode) return;
    
    // Update state
    resourceNode.state = state;
    
    // Update mesh
    this.updateResourceNodeMesh(resourceNode);
  }

  /**
   * Update the mesh for a resource node based on its state
   */
  private updateResourceNodeMesh(node: ResourceNode): void {
    // Remove old mesh from scene if it exists
    if (node.mesh) {
      this.scene.remove(node.mesh);
      
      // Dispose of geometry and materials to prevent memory leaks
      if ((node.mesh as any).geometry) {
        (node.mesh as any).geometry.dispose();
      }
      
      if ((node.mesh as any).material) {
        if (Array.isArray((node.mesh as any).material)) {
          (node.mesh as any).material.forEach((m: THREE.Material) => m.dispose());
        } else {
          (node.mesh as any).material.dispose();
        }
      }
    }
    
    // Create new mesh based on node type, state, and metadata
    const mesh = createResourceMesh(node.type, node.state || 'normal', node.metadata);
    mesh.position.set(node.x, node.y, node.z);
    
    // Add to scene
    this.scene.add(mesh);
    
    // Store mesh with resource node
    node.mesh = mesh as THREE.Mesh;
    
    // Play appropriate sound effect if available
    if (node.state === 'harvested') {
      if (node.type === ResourceType.TREE || node.type === 'tree') {
        // Play tree fall sound if available
        if ((window as any).soundManager?.play) {
          (window as any).soundManager.play('treeFall');
        }
      } else if (node.type === ResourceType.ROCK || node.type === 'rock') {
        // Play rock break sound if available
        if ((window as any).soundManager?.play) {
          (window as any).soundManager.play('rockBreak');
        }
      }
    }
  }
}

// Export constants and types
export { WORLD_BOUNDS };
export default WorldManager; 