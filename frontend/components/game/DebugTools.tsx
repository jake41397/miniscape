import { useCallback } from 'react';
import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer';

// Debug configuration
const DEBUG = {
  showPositionMarkers: false,
  showVelocityVectors: false,
  logNetworkStats: false
};

interface DebugToolsProps {
  scene: THREE.Scene;
  playersRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
}

export const useDebugTools = ({
  scene,
  playersRef
}: DebugToolsProps) => {
  
  // Update debug visuals for player positions and velocity vectors
  const updateDebugVisuals = useCallback(() => {
    if (!DEBUG.showPositionMarkers && !DEBUG.showVelocityVectors) return;
    
    // Process each player
    playersRef.current.forEach((playerMesh, playerId) => {
      // Skip if no target position
      if (!playerMesh.userData.targetPosition) return;
      
      // Create position marker if it doesn't exist
      if (DEBUG.showPositionMarkers) {
        if (!playerMesh.userData.positionMarker) {
          const markerGeometry = new THREE.SphereGeometry(0.2);
          const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
          const marker = new THREE.Mesh(markerGeometry, markerMaterial);
          marker.position.copy(playerMesh.userData.targetPosition);
          scene.add(marker);
          playerMesh.userData.positionMarker = marker;
        } else {
          // Update position marker to show server-reported position
          playerMesh.userData.positionMarker.position.copy(playerMesh.userData.targetPosition);
        }
        
        // Add line connecting player to marker to visualize discrepancy
        if (!playerMesh.userData.discrepancyLine) {
          const lineGeometry = new THREE.BufferGeometry();
          const lineMaterial = new THREE.LineBasicMaterial({ color: 0xff0000 });
          const line = new THREE.Line(lineGeometry, lineMaterial);
          scene.add(line);
          playerMesh.userData.discrepancyLine = line;
        }
        
        // Update line to connect player mesh with position marker
        const points = [
          playerMesh.position.clone(),
          playerMesh.userData.positionMarker.position.clone()
        ];
        playerMesh.userData.discrepancyLine.geometry.setFromPoints(points);
        
        // Calculate and display discrepancy distance
        const distance = playerMesh.position.distanceTo(playerMesh.userData.positionMarker.position);
        if (!playerMesh.userData.discrepancyLabel) {
          const discDiv = document.createElement('div');
          discDiv.className = 'debug-label';
          discDiv.style.color = 'red';
          discDiv.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
          discDiv.style.padding = '2px 5px';
          discDiv.style.fontSize = '10px';
          discDiv.style.userSelect = 'none';
          discDiv.style.pointerEvents = 'none';
          
          const discLabel = new CSS2DObject(discDiv);
          discLabel.position.set(0, 3, 0);
          playerMesh.add(discLabel);
          playerMesh.userData.discrepancyLabel = discLabel;
        }
        
        // Update label with current discrepancy
        const discDiv = playerMesh.userData.discrepancyLabel.element as HTMLDivElement;
        discDiv.textContent = `Diff: ${distance.toFixed(2)}`;
        discDiv.style.color = distance > 1 ? 'red' : distance > 0.5 ? 'yellow' : 'green';
      }
      
      // Update velocity vectors if enabled
      if (DEBUG.showVelocityVectors && playerMesh.userData.serverVelocity) {
        if (!playerMesh.userData.velocityArrow) {
          // Create a velocity vector arrow
          const arrowDir = new THREE.Vector3(
            playerMesh.userData.serverVelocity.x,
            0,
            playerMesh.userData.serverVelocity.z
          ).normalize();
          
          const velocityLength = Math.sqrt(
            Math.pow(playerMesh.userData.serverVelocity.x, 2) + 
            Math.pow(playerMesh.userData.serverVelocity.z, 2)
          );
          
          const arrowHelper = new THREE.ArrowHelper(
            arrowDir,
            playerMesh.position.clone().add(new THREE.Vector3(0, 1, 0)),
            velocityLength * 2, // Scale for visibility
            0x00ff00
          );
          
          scene.add(arrowHelper);
          playerMesh.userData.velocityArrow = arrowHelper;
        } else {
          // Update the velocity arrow
          const arrowDir = new THREE.Vector3(
            playerMesh.userData.serverVelocity.x,
            0,
            playerMesh.userData.serverVelocity.z
          );
          
          const velocityLength = arrowDir.length();
          
          if (velocityLength > 0) {
            arrowDir.normalize();
            
            // Update arrow position, direction, and length
            playerMesh.userData.velocityArrow.position.copy(
              playerMesh.position.clone().add(new THREE.Vector3(0, 1, 0))
            );
            playerMesh.userData.velocityArrow.setDirection(arrowDir);
            playerMesh.userData.velocityArrow.setLength(velocityLength * 2);
          }
        }
      }
    });
  }, [scene, playersRef]);
  
  // Toggle debug features
  const toggleDebugFeature = useCallback((feature: keyof typeof DEBUG) => {
    DEBUG[feature] = !DEBUG[feature];
    
    // If turning off position markers, clean up existing markers
    if (feature === 'showPositionMarkers' && !DEBUG.showPositionMarkers) {
      playersRef.current.forEach((playerMesh) => {
        if (playerMesh.userData.positionMarker) {
          scene.remove(playerMesh.userData.positionMarker);
          playerMesh.userData.positionMarker = null;
        }
        
        if (playerMesh.userData.discrepancyLine) {
          scene.remove(playerMesh.userData.discrepancyLine);
          playerMesh.userData.discrepancyLine = null;
        }
        
        if (playerMesh.userData.discrepancyLabel) {
          if (playerMesh.userData.discrepancyLabel.parent) {
            playerMesh.userData.discrepancyLabel.parent.remove(playerMesh.userData.discrepancyLabel);
          }
          playerMesh.userData.discrepancyLabel = null;
        }
      });
    }
    
    // If turning off velocity vectors, clean up existing arrows
    if (feature === 'showVelocityVectors' && !DEBUG.showVelocityVectors) {
      playersRef.current.forEach((playerMesh) => {
        if (playerMesh.userData.velocityArrow) {
          scene.remove(playerMesh.userData.velocityArrow);
          playerMesh.userData.velocityArrow = null;
        }
      });
    }
    
    console.log(`Debug feature ${feature} is now ${DEBUG[feature] ? 'enabled' : 'disabled'}`);
  }, [scene, playersRef]);
  
  // Cleanup all debug visuals
  const cleanupDebugVisuals = useCallback(() => {
    playersRef.current.forEach((playerMesh) => {
      // Clean up position markers
      if (playerMesh.userData.positionMarker) {
        scene.remove(playerMesh.userData.positionMarker);
        playerMesh.userData.positionMarker = null;
      }
      
      if (playerMesh.userData.discrepancyLine) {
        scene.remove(playerMesh.userData.discrepancyLine);
        playerMesh.userData.discrepancyLine = null;
      }
      
      if (playerMesh.userData.discrepancyLabel) {
        if (playerMesh.userData.discrepancyLabel.parent) {
          playerMesh.userData.discrepancyLabel.parent.remove(playerMesh.userData.discrepancyLabel);
        }
        playerMesh.userData.discrepancyLabel = null;
      }
      
      // Clean up velocity arrows
      if (playerMesh.userData.velocityArrow) {
        scene.remove(playerMesh.userData.velocityArrow);
        playerMesh.userData.velocityArrow = null;
      }
    });
  }, [scene, playersRef]);
  
  return {
    DEBUG,
    updateDebugVisuals,
    toggleDebugFeature,
    cleanupDebugVisuals
  };
};

export default useDebugTools; 