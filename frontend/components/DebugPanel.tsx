import React from 'react';
import { Socket } from 'socket.io-client';
import { SocketController } from './game/SocketController';
import { ResourceController } from './game/ResourceController';

interface DebugPanelProps {
  socket: Socket | null;
  totalBytes: number;
  pingValue: number;
  totalMessages: number;
  position?: { x: number; y: number; z: number };
  socketController: SocketController | null;
  resourceController: ResourceController | null;
}

// Utility function to format bytes nicely
const formatBytes = (bytes: number): string => {
  if (bytes === 0) return '0 Bytes';
  
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

export const DebugPanel: React.FC<DebugPanelProps> = ({ 
  socket, 
  totalBytes, 
  pingValue, 
  totalMessages, 
  position, 
  socketController, 
  resourceController 
}) => {
  const handleForceSync = () => {
    console.log("Force syncing players");
    if (socketController) {
      socketController.forceSyncPlayers();
    }
  };

  const handleDebugSockets = () => {
    console.log("Debugging socket connections");
    if (socketController) {
      socketController.checkAndRepairPlayerReferences();
    }
  };
  
  const handleRefreshResources = () => {
    console.log("Requesting resource nodes refresh from server");
    if (socketController) {
      socketController.requestWorldData();
    }
  };

  const handleForceRenderResources = () => {
    console.log("Force rendering resource nodes");
    if (resourceController) {
      resourceController.initializeResourceNodeMeshes();
    }
  };

  const handleCreateDefaultResources = () => {
    console.log("Creating default resources");
    if (resourceController) {
      const defaultNodes = resourceController.createDefaultResources();
      resourceController.updateResourceNodes(defaultNodes);
    }
  };

  return (
    <div className="debug-panel">
      <h2>Debug</h2>
      <div className="debug-stats">
        <div>Data Transferred: {formatBytes(totalBytes)}</div>
        <div>Ping: {pingValue}ms</div>
        <div>Total Messages: {totalMessages}</div>
        {position && (
          <div>Position: X:{position.x.toFixed(2)} Y:{position.y.toFixed(2)} Z:{position.z.toFixed(2)}</div>
        )}
      </div>
      <div className="debug-buttons">
        <button onClick={handleForceSync}>Force Sync Players</button>
        <button onClick={handleDebugSockets}>Debug Sockets</button>
        <button onClick={handleRefreshResources}>Refresh Resources</button>
        <button onClick={handleForceRenderResources}>Force Render Resources</button>
        <button onClick={handleCreateDefaultResources}>Create Default Resources</button>
      </div>
    </div>
  );
}; 