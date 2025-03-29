import { PlayerController } from './PlayerController';
import { SocketController } from './SocketController';
import WorldManager from '../../game/world/WorldManager';
import ItemManager from '../../game/world/ItemManager';
import * as THREE from 'three';

export interface InputHandlerOptions {
  playerController: PlayerController;
  socketController: SocketController;
  worldManagerRef: React.MutableRefObject<WorldManager | null>;
  itemManagerRef: React.MutableRefObject<ItemManager | null>;
  raycaster: THREE.Raycaster;
  mouse: THREE.Vector2;
  camera: THREE.Camera;
  scene: THREE.Scene;
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  isGathering: React.MutableRefObject<boolean>;
  resourceNodesRef: React.MutableRefObject<any[]>;
  worldItemsRef: React.MutableRefObject<any[]>;
}

export class InputHandler {
  private playerController: PlayerController;
  private socketController: SocketController;
  private worldManagerRef: React.MutableRefObject<WorldManager | null>;
  private itemManagerRef: React.MutableRefObject<ItemManager | null>;
  private raycaster: THREE.Raycaster;
  private mouse: THREE.Vector2;
  private camera: THREE.Camera;
  private scene: THREE.Scene;
  private playerRef: React.MutableRefObject<THREE.Mesh | null>;
  private isGathering: React.MutableRefObject<boolean>;
  private resourceNodesRef: React.MutableRefObject<any[]>;
  private worldItemsRef: React.MutableRefObject<any[]>;
  
  constructor(options: InputHandlerOptions) {
    this.playerController = options.playerController;
    this.socketController = options.socketController;
    this.worldManagerRef = options.worldManagerRef;
    this.itemManagerRef = options.itemManagerRef;
    this.raycaster = options.raycaster;
    this.mouse = options.mouse;
    this.camera = options.camera;
    this.scene = options.scene;
    this.playerRef = options.playerRef;
    this.isGathering = options.isGathering;
    this.resourceNodesRef = options.resourceNodesRef;
    this.worldItemsRef = options.worldItemsRef;
  }
  
  public bindEvents(): void {
    // Add keyboard event listeners
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    
    // Add mouse event listeners
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('wheel', this.handleMouseWheel);
    window.addEventListener('click', this.handleClick);
  }
  
  public unbindEvents(): void {
    // Remove keyboard event listeners
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    
    // Remove mouse event listeners
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('wheel', this.handleMouseWheel);
    window.removeEventListener('click', this.handleClick);
  }
  
  private handleKeyDown = (e: KeyboardEvent): void => {
    // Let player controller handle movement keys
    this.playerController.handleKeyDown(e);
    
    // Handle chat toggle
    if (e.key === 'Enter') {
      // TODO: Handle chat toggle if needed
    }
  };
  
  private handleKeyUp = (e: KeyboardEvent): void => {
    // Let player controller handle movement keys
    this.playerController.handleKeyUp(e);
  };
  
  private handleMouseMove = (e: MouseEvent): void => {
    // Update mouse coordinates for raycasting
    if (e.target instanceof HTMLCanvasElement) {
      const rect = e.target.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / e.target.clientWidth) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / e.target.clientHeight) * 2 + 1;
    }
    
    // Let player controller handle camera control
    this.playerController.handleMouseMove(e);
  };
  
  private handleMouseDown = (e: MouseEvent): void => {
    // Let player controller handle camera control
    this.playerController.handleMouseDown(e);
  };
  
  private handleMouseUp = (e: MouseEvent): void => {
    // Let player controller handle camera control
    this.playerController.handleMouseUp(e);
  };
  
  private handleMouseWheel = (e: WheelEvent): void => {
    // Let player controller handle camera zoom
    this.playerController.handleMouseWheel(e);
  };
  
  private handleClick = (e: MouseEvent): void => {
    // Skip if gathering is in progress
    if (this.isGathering.current) return;
    
    // Skip if player is not initialized
    const player = this.playerRef.current;
    if (!player) return;
    
    // Update raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // Check for intersections with resource nodes
    const resourceIntersects = this.raycaster.intersectObjects(
      this.resourceNodesRef.current.map(node => node.mesh)
    );
    
    if (resourceIntersects.length > 0) {
      const intersectedNode = resourceIntersects[0].object;
      const resourceNode = this.resourceNodesRef.current.find(
        node => node.mesh === intersectedNode
      );
      
      if (resourceNode) {
        // Calculate distance to resource node
        const distance = player.position.distanceTo(resourceNode.mesh.position);
        
        if (distance <= 3) { // Within interaction range
          // Set gathering flag
          this.isGathering.current = true;
          
          // Send interaction to server
          this.socketController.sendInteractWithResource(resourceNode.id);
          
          // Auto-reset gathering flag after a delay
          setTimeout(() => {
            this.isGathering.current = false;
          }, 2000);
        }
      }
      
      return;
    }
    
    // Check for intersections with world items
    const itemIntersects = this.raycaster.intersectObjects(
      this.worldItemsRef.current.map(item => item.mesh)
    );
    
    if (itemIntersects.length > 0) {
      const intersectedItem = itemIntersects[0].object;
      const worldItem = this.worldItemsRef.current.find(
        item => item.mesh === intersectedItem
      );
      
      if (worldItem) {
        // Calculate distance to world item
        const distance = player.position.distanceTo(worldItem.mesh.position);
        
        if (distance <= 2) { // Within pickup range
          // Send pickup to server
          this.socketController.sendPickupItem(worldItem.dropId);
        }
      }
    }
  };
}

export default InputHandler; 