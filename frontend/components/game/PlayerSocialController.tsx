import React, { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import PlayerContextMenu from '../ui/PlayerContextMenu';

interface PlayerSocialControllerProps {
  playerRef: React.MutableRefObject<THREE.Mesh | null>;
  playersRef: React.MutableRefObject<Map<string, THREE.Mesh>>;
  onPlayerFollow?: (playerId: string) => void;
  onPlayerMessage?: (playerId: string) => void;
  socketController?: any; // Socket controller for messaging
}

const PlayerSocialController: React.FC<PlayerSocialControllerProps> = ({
  playerRef,
  playersRef,
  onPlayerFollow,
  onPlayerMessage,
  socketController
}) => {
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [targetPlayer, setTargetPlayer] = useState<{
    id: string;
    name: string;
    position: THREE.Vector3;
  } | null>(null);
  
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const mouseRef = useRef<THREE.Vector2>(new THREE.Vector2());
  
  useEffect(() => {
    // Handle right click on other players
    const handleRightClick = (event: MouseEvent) => {
      if (event.button !== 2) return; // Not a right-click
      
      // Find the actual renderer canvas element
      const rendererCanvas = document.querySelector('canvas');
      if (!rendererCanvas) {
        console.error("Cannot find renderer canvas for raycasting");
        return;
      }
      
      // Update mouse position for raycasting using the canvas dimensions
      const rect = rendererCanvas.getBoundingClientRect();
      mouseRef.current.x = ((event.clientX - rect.left) / rendererCanvas.clientWidth) * 2 - 1;
      mouseRef.current.y = -((event.clientY - rect.top) / rendererCanvas.clientHeight) * 2 + 1;
      
      // Create a list of meshes representing other players
      const otherPlayerMeshes: THREE.Mesh[] = [];
      const playerIdMap = new Map<THREE.Mesh, string>();
      const playerNameMap = new Map<THREE.Mesh, string>();
      
      playersRef.current.forEach((mesh, playerId) => {
        if (mesh && mesh !== playerRef.current) {
          otherPlayerMeshes.push(mesh);
          playerIdMap.set(mesh, playerId);
          
          // Get player name from name tag if available
          const nameTag = mesh.userData.nameTag;
          const playerName = nameTag ? nameTag.userData.playerName : `Player-${playerId}`;
          playerNameMap.set(mesh, playerName);
        }
      });
      
      // Set up raycaster
      if (!playerRef.current || !playerRef.current.parent) return;
      const camera = playerRef.current.parent.children.find(
        child => child instanceof THREE.Camera
      ) as THREE.Camera;
      
      if (!camera) return;
      
      raycasterRef.current.setFromCamera(mouseRef.current, camera);
      
      // Check for intersections with other players
      const intersects = raycasterRef.current.intersectObjects(otherPlayerMeshes, true);
      
      if (intersects.length > 0) {
        // Find the first player mesh in the intersects
        const intersection = intersects.find(intersect => {
          let currentObj = intersect.object;
          while (currentObj) {
            if (playerIdMap.has(currentObj as THREE.Mesh)) {
              return true;
            }
            if (!currentObj.parent) break;
            currentObj = currentObj.parent;
          }
          return false;
        });
        
        if (intersection) {
          // Find the parent player mesh that was clicked
          let targetMesh = intersection.object;
          while (targetMesh && !playerIdMap.has(targetMesh as THREE.Mesh)) {
            if (!targetMesh.parent) break;
            targetMesh = targetMesh.parent;
          }
          
          if (targetMesh && playerIdMap.has(targetMesh as THREE.Mesh)) {
            const playerId = playerIdMap.get(targetMesh as THREE.Mesh) as string;
            const playerName = playerNameMap.get(targetMesh as THREE.Mesh) || `Player-${playerId}`;
            
            // Show context menu
            setContextMenuPosition({ x: event.clientX, y: event.clientY });
            setTargetPlayer({
              id: playerId,
              name: playerName,
              position: (targetMesh as THREE.Mesh).position.clone()
            });
            
            // Prevent the default context menu
            event.preventDefault();
            return false;
          }
        }
      }
    };
    
    // Attach event listeners
    document.addEventListener('contextmenu', handleRightClick);
    
    return () => {
      document.removeEventListener('contextmenu', handleRightClick);
    };
  }, [playerRef, playersRef]);
  
  const handleCloseMenu = () => {
    setContextMenuPosition(null);
    setTargetPlayer(null);
  };
  
  const handleFollowPlayer = (playerId: string) => {
    console.log(`Following player: ${playerId}`);
    if (onPlayerFollow) {
      onPlayerFollow(playerId);
    }
  };
  
  const handleTradePlayer = (playerId: string) => {
    console.log(`Requesting trade with player: ${playerId}`);
    if (socketController) {
      socketController.sendTradeRequest(playerId);
    }
  };
  
  const handleMessagePlayer = (playerId: string) => {
    console.log(`Messaging player: ${playerId}`);
    if (onPlayerMessage) {
      onPlayerMessage(playerId);
    }
  };
  
  const handleReportPlayer = (playerId: string) => {
    console.log(`Reporting player: ${playerId}`);
    // Show report dialog or send report request
  };
  
  return (
    <>
      {contextMenuPosition && targetPlayer && (
        <PlayerContextMenu
          position={contextMenuPosition}
          targetPlayer={targetPlayer}
          onClose={handleCloseMenu}
          onFollow={handleFollowPlayer}
          onTrade={handleTradePlayer}
          onMessage={handleMessagePlayer}
          onReport={handleReportPlayer}
        />
      )}
    </>
  );
};

export default PlayerSocialController; 