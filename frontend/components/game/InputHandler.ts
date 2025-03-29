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
  private isWalkingToItem: boolean = false;
  private isWalkingToLocation: boolean = false;
  private clickIndicator: THREE.Mesh | null = null;
  
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
    console.log('InputHandler: Binding event listeners');
    
    // Add keyboard event listeners
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    
    // Add mouse event listeners
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    window.addEventListener('wheel', this.handleMouseWheel);
    
    // Click events can be tricky across browsers, so add multiple listeners
    // Regular click event
    window.addEventListener('click', this.handleClick);
    
    // Also handle pointerdown event (more reliable on some browsers/devices)
    window.addEventListener('pointerdown', this.handlePointerDown);
    
    // Add event debug message for troubleshooting
    console.log('InputHandler: All input event listeners bound successfully');
  }
  
  public unbindEvents(): void {
    console.log('InputHandler: Removing event listeners');
    
    // Remove keyboard event listeners
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    
    // Remove mouse event listeners
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    window.removeEventListener('wheel', this.handleMouseWheel);
    
    // Remove click event listeners
    window.removeEventListener('click', this.handleClick);
    window.removeEventListener('pointerdown', this.handlePointerDown);
    
    console.log('InputHandler: All input event listeners removed');
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
    // Skip if player is not initialized
    const player = this.playerRef.current;
    if (!player) return;
    
    // Only process left mouse button clicks (button 0)
    if (e.button !== 0) return;
    
    // Make sure we're clicking on the canvas
    if (!(e.target instanceof HTMLCanvasElement)) {
      return;
    }
    
    // Get canvas position and update mouse coordinates for raycasting
    const rect = e.target.getBoundingClientRect();
    this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    
    // Update the raycaster
    this.raycaster.setFromCamera(this.mouse, this.camera);
    
    // First, check for resource node interactions
    const resourceMeshes = this.resourceNodesRef.current
      .filter(node => node.mesh)
      .map(node => node.mesh);
    
    if (resourceMeshes.length > 0) {
      const resourceIntersects = this.raycaster.intersectObjects(resourceMeshes);
      
      if (resourceIntersects.length > 0) {
        this.handleResourceInteraction(resourceIntersects[0].object);
        return; // Stop processing if we interacted with a resource
      }
    }
    
    // Then check for world item interactions
    const itemMeshes = this.worldItemsRef.current
      .filter(item => item.mesh)
      .map(item => item.mesh);
    
    if (itemMeshes.length > 0) {
      const itemIntersects = this.raycaster.intersectObjects(itemMeshes);
      
      if (itemIntersects.length > 0) {
        this.handleItemInteraction(itemIntersects[0].object);
        return; // Stop processing if we interacted with an item
      }
    }
    
    // Finally, process ground clicks if no other interactions happened
    const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const targetPoint = new THREE.Vector3();
    
    if (this.raycaster.ray.intersectPlane(groundPlane, targetPoint)) {
      // Keep player at the same height
      targetPoint.y = player.position.y;
      
      // Log the destination
      console.log(`Moving to ground location: (${targetPoint.x.toFixed(2)}, ${targetPoint.z.toFixed(2)})`);
      
      // First, clean up any existing indicators
      this.removeClickIndicator();
      
      // Reset movement flags
      this.isWalkingToItem = false;
      this.isWalkingToLocation = true;
      
      // Create new click indicator
      this.createClickIndicator(targetPoint);
      
      // Start moving player to target location
      this.playerController.moveToPosition(targetPoint)
        .then(() => {
          if (this.isWalkingToLocation) {
            this.isWalkingToLocation = false;
            this.removeClickIndicator();
          }
        })
        .catch(err => {
          console.error("Error walking to location:", err);
          this.isWalkingToLocation = false;
          this.removeClickIndicator();
        });
    }
  };
  
  /**
   * Handle interaction with a resource node
   */
  private handleResourceInteraction(object: THREE.Object3D): void {
    // Find the corresponding resource node data
    const resourceNode = this.resourceNodesRef.current.find(
      node => node.mesh === object
    );
    
    if (!resourceNode || !this.playerRef.current) return;
    
    // Calculate distance to the resource node
    const player = this.playerRef.current;
    const distance = player.position.distanceTo(resourceNode.mesh.position);
    
    if (distance <= 3) {
      // Within range - gather immediately
      if (!this.isGathering.current) {
        this.isGathering.current = true;
        this.socketController.sendInteractWithResource(resourceNode.id);
        
        // Reset gathering flag after delay
        setTimeout(() => {
          this.isGathering.current = false;
        }, 2000);
      }
    } else {
      // Too far - move closer first
      this.removeClickIndicator();
      
      // Calculate a position near the resource
      const nodeDirection = new THREE.Vector3()
        .subVectors(resourceNode.mesh.position, player.position)
        .normalize();
        
      // Position 1.5 units away from the resource
      const targetPosition = new THREE.Vector3()
        .copy(resourceNode.mesh.position)
        .sub(nodeDirection.multiplyScalar(1.5));
        
      // Keep the same Y position
      targetPosition.y = player.position.y;
      
      // Create an indicator
      this.createClickIndicator(targetPosition);
      
      // Set walk flags
      this.isWalkingToItem = false;
      this.isWalkingToLocation = true;
      
      // Start movement
      this.playerController.moveToPosition(targetPosition)
        .then(() => {
          if (this.isWalkingToLocation) {
            this.isWalkingToLocation = false;
            this.removeClickIndicator();
            
            // Try to gather if we're now close enough
            const newDistance = player.position.distanceTo(resourceNode.mesh.position);
            if (newDistance <= 3 && !this.isGathering.current) {
              this.isGathering.current = true;
              this.socketController.sendInteractWithResource(resourceNode.id);
              
              setTimeout(() => {
                this.isGathering.current = false;
              }, 2000);
            }
          }
        })
        .catch(err => {
          console.error("Error walking to resource:", err);
          this.isWalkingToLocation = false;
          this.removeClickIndicator();
        });
    }
  }
  
  /**
   * Handle interaction with a world item
   */
  private handleItemInteraction(object: THREE.Object3D): void {
    // Find the corresponding item data
    const worldItem = this.worldItemsRef.current.find(
      item => item.mesh === object
    );
    
    if (!worldItem || !this.playerRef.current) return;
    
    // Calculate distance to the item
    const player = this.playerRef.current;
    const distance = player.position.distanceTo(worldItem.mesh.position);
    
    if (distance <= 2) {
      // Within range - pickup immediately
      this.socketController.sendPickupItem(worldItem.dropId);
    } else {
      // Too far - move closer first
      this.removeClickIndicator();
      
      // Set target position
      const targetPosition = worldItem.mesh.position.clone();
      targetPosition.y = player.position.y;
      
      // Create indicator
      this.createClickIndicator(targetPosition);
      
      // Set walk flags
      this.isWalkingToItem = true;
      this.isWalkingToLocation = false;
      
      // Start movement
      this.playerController.moveToPosition(targetPosition)
        .then(() => {
          if (this.isWalkingToItem) {
            this.isWalkingToItem = false;
            this.removeClickIndicator();
            
            // Try to pickup if item still exists
            const updatedItem = this.worldItemsRef.current.find(
              item => item.dropId === worldItem.dropId
            );
            
            if (updatedItem) {
              this.socketController.sendPickupItem(worldItem.dropId);
            }
          }
        })
        .catch(err => {
          console.error("Error walking to item:", err);
          this.isWalkingToItem = false;
          this.removeClickIndicator();
        });
    }
  }
  
  /**
   * Creates a visual indicator where the user clicked
   */
  private createClickIndicator(position: THREE.Vector3): void {
    // Remove any existing indicator first
    this.removeClickIndicator();
    
    console.log(`Creating click indicator at ${position.x.toFixed(2)}, ${position.z.toFixed(2)}`);
    
    // Create a circular indicator
    const geometry = new THREE.CircleGeometry(0.8, 24);
    geometry.rotateX(-Math.PI / 2); // Make it horizontal
    
    // Material with glow effect
    const material = new THREE.MeshBasicMaterial({
      color: 0xffcc00, // Bright yellow
      transparent: true,
      opacity: 0.8,
      side: THREE.DoubleSide,
      depthWrite: false // Prevent z-fighting
    });
    
    // Create the indicator mesh
    const indicator = new THREE.Mesh(geometry, material);
    indicator.position.copy(position);
    indicator.position.y += 0.05; // Lift above ground
    
    // Add ring effect
    const ringGeometry = new THREE.RingGeometry(0.8, 1.0, 24);
    ringGeometry.rotateX(-Math.PI / 2);
    
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: 0xff9900, // Orange tint
      transparent: true,
      opacity: 0.6,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    
    const ring = new THREE.Mesh(ringGeometry, ringMaterial);
    ring.position.set(0, -0.01, 0); // Slightly below main indicator
    
    // Add ring as child for easier management
    indicator.add(ring);
    
    // Add to scene
    this.scene.add(indicator);
    
    // Store reference
    this.clickIndicator = indicator;
    
    // Add automatic cleanup with fade effect
    const startTime = Date.now();
    const duration = 5000; // 5 seconds
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      
      if (elapsed < duration && indicator.parent) {
        // Calculate new scale with pulsing effect
        const scale = 1 + 0.2 * Math.sin((elapsed / 300) * Math.PI);
        indicator.scale.set(scale, 1, scale);
        
        // Rotate the ring for better visibility
        ring.rotation.y += 0.03;
        
        // Calculate opacity (fade out)
        const opacity = 0.8 * (1 - elapsed / duration);
        (indicator.material as THREE.MeshBasicMaterial).opacity = opacity;
        (ring.material as THREE.MeshBasicMaterial).opacity = opacity * 0.75;
        
        requestAnimationFrame(animate);
      } else if (indicator.parent && this.clickIndicator === indicator) {
        // Only auto-remove if this is still the current indicator
        this.removeClickIndicator();
      }
    };
    
    // Start animation
    animate();
  }
  
  private removeClickIndicator(): void {
    if (this.clickIndicator && this.scene) {
      // Remove from scene
      this.scene.remove(this.clickIndicator);
      
      // Clean up any children
      while (this.clickIndicator.children.length > 0) {
        const child = this.clickIndicator.children[0];
        
        // Dispose of geometry and materials if they exist
        if ((child as THREE.Mesh).geometry) {
          (child as THREE.Mesh).geometry.dispose();
        }
        
        if ((child as THREE.Mesh).material) {
          const material = (child as THREE.Mesh).material;
          if (Array.isArray(material)) {
            material.forEach(m => m.dispose());
          } else {
            material.dispose();
          }
        }
        
        // Remove from parent
        this.clickIndicator.remove(child);
      }
      
      // Dispose of geometry and material
      if (this.clickIndicator.geometry) {
        this.clickIndicator.geometry.dispose();
      }
      
      if (this.clickIndicator.material) {
        const material = this.clickIndicator.material;
        if (Array.isArray(material)) {
          material.forEach(m => m.dispose());
        } else {
          material.dispose();
        }
      }
      
      // Clear reference
      this.clickIndicator = null;
      
      console.log('Click indicator removed and resources disposed');
    }
  }
  
  /**
   * Handle pointer down events (acts as a backup for click events)
   * This is more reliable on some browsers and touch devices
   */
  private handlePointerDown = (e: PointerEvent): void => {
    // Only handle left-click equivalent pointerdown events (button 0)
    if (e.button !== 0) return;
    
    // Only process primary pointer inputs
    if (!e.isPrimary) return;
    
    // Delegate to regular click handler
    this.handleClick(e);
  };
}

export default InputHandler; 