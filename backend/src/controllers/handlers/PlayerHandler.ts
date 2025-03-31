import { Server } from 'socket.io';
import supabase from '../../config/supabase';
import { savePlayerPosition } from '../../models/gameModel';
import { ExtendedSocket, Player, PlayerPosition, PlayersStore, WORLD_BOUNDS } from '../types';

export class PlayerHandler {
  private io: Server;
  private players: PlayersStore;
  private userIdToSocketId: Record<string, string>;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  
  constructor(io: Server, players: PlayersStore, userIdToSocketId: Record<string, string>) {
    this.io = io;
    this.players = players;
    this.userIdToSocketId = userIdToSocketId;
    
    // Start heartbeat checks every 10 seconds
    this.startHeartbeatChecks();
  }
  
  /**
   * Helper to check for default positions
   */
  private isDefaultPosition(x: number, y: number, z: number): boolean {
    return x === 0 && y === 1 && z === 0;
  }
  
  /**
   * Start periodic heartbeat checks to verify player connections
   */
  private startHeartbeatChecks(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    
    this.heartbeatInterval = setInterval(() => {
      // Log the current player count for debugging
      console.log(`[Heartbeat] Current player count: ${Object.keys(this.players).length}`);
      
      // Send a heartbeat ping to all players to verify they're still connected
      for (const socketId in this.players) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('ping', Date.now(), (response: number) => {
            // Response received, player is still connected
            // Update last ping time
            if (this.players[socketId]) {
              this.players[socketId].lastPing = Date.now();
            }
          });
        } else {
          // Socket not found, likely disconnected but not cleaned up
          console.log(`[Heartbeat] Socket ${socketId} not found, cleaning up stale player`);
          this.cleanupStalePlayer(socketId);
        }
      }
      
      // Broadcast the updated player count to all clients
      this.broadcastPlayerCount();
      
    }, 10000); // Check every 10 seconds
  }
  
  /**
   * Clean up a stale player that's no longer connected
   */
  private cleanupStalePlayer(socketId: string): void {
    const player = this.players[socketId];
    if (!player) return;
    
    console.log(`Cleaning up stale player: ${player.name} (${socketId})`);
    
    // Remove from players object
    delete this.players[socketId];
    
    // Remove from userIdToSocketId map if present
    if (player.userId && this.userIdToSocketId[player.userId] === socketId) {
      delete this.userIdToSocketId[player.userId];
    }
    
    // Notify other clients
    this.io.emit('playerLeft', { id: socketId });
    
    // Broadcast updated player count
    this.broadcastPlayerCount();
  }
  
  /**
   * Broadcast current player count to all clients
   */
  private broadcastPlayerCount(): void {
    const totalPlayers = Object.keys(this.players).length;
    this.io.emit('playerCount', totalPlayers);
    console.log(`Broadcasting player count to all clients: ${totalPlayers}`);
  }
  
  /**
   * Set up player movement listener
   */
  public setupMovementHandler(socket: ExtendedSocket): void {
    // Keep track of player's last position to prevent unnecessary updates
    let lastReportedPosition = { x: 0, y: 0, z: 0 };
    // Track the last position we actually broadcast to prevent spamming the network
    let lastBroadcastPosition = { x: 0, y: 0, z: 0 };
    // Set a minimum distance threshold for broadcasting position updates
    const MIN_BROADCAST_DISTANCE_SQUARED = 0.05; // About 0.22 units
    // Set a minimum time between broadcasts to prevent spam
    const MIN_BROADCAST_INTERVAL = 100; // ms
    let lastBroadcastTime = 0;
    
    socket.on('playerMove', async (position: PlayerPosition) => {
      // Update player position in server state
      if (this.players[socket.id]) {
        // Get current player data
        const player = this.players[socket.id];
        
        // Store last real position to detect if we're being reset to default
        if (!this.isDefaultPosition(player.x, player.y, player.z)) {
          lastReportedPosition = { x: player.x, y: player.y, z: player.z };
        }
        
        // Check if we're receiving a default position after having a non-default position
        const isReceivingDefault = this.isDefaultPosition(position.x, position.y, position.z);
        const hadRealPosition = !this.isDefaultPosition(lastReportedPosition.x, lastReportedPosition.y, lastReportedPosition.z);
        
        if (isReceivingDefault && hadRealPosition) {
          console.log(`Player ${socket.id} is being reset to default position (0,1,0) after having a real position. Ignoring reset.`);
          
          // Restore last known valid position instead of allowing reset to default
          this.players[socket.id].x = lastReportedPosition.x;
          this.players[socket.id].y = lastReportedPosition.y;
          this.players[socket.id].z = lastReportedPosition.z;
          
          // Send the correct position back to client to re-sync
          socket.emit('positionCorrection', {
            x: lastReportedPosition.x,
            y: lastReportedPosition.y,
            z: lastReportedPosition.z
          });
          
          return;
        }
        
        // No longer clamping to world boundaries
        const validX = position.x;
        const validZ = position.z;
        
        // Check if position has actually changed significantly from current position
        const dx = validX - player.x;
        const dy = position.y - player.y;
        const dz = validZ - player.z;
        const distanceSquared = dx * dx + dy * dy + dz * dz;
        
        // Only process significant movements (avoid processing tiny or duplicate movements)
        if (distanceSquared < 0.0001 && !isReceivingDefault) {
          // Skip processing for insignificant movements
          return;
        }
        
        // Update player position in memory regardless of broadcast decision
        this.players[socket.id].x = validX;
        this.players[socket.id].y = position.y;
        this.players[socket.id].z = validZ;
        this.players[socket.id].lastActive = Date.now();
        
        // Track movement frequency
        socket.data.lastPositionUpdate = Date.now();
        socket.data.movementCount = (socket.data.movementCount || 0) + 1;
        
        // Skip broadcasting if this is the default position (0,1,0)
        if (this.isDefaultPosition(validX, position.y, validZ)) {
          console.log(`Skipping broadcast for default position (0,1,0) for player ${socket.id}`);
          return;
        }
        
        // Calculate distance from last broadcast position to see if we need to broadcast
        const broadcastDx = validX - lastBroadcastPosition.x;
        const broadcastDy = position.y - lastBroadcastPosition.y;
        const broadcastDz = validZ - lastBroadcastPosition.z;
        const broadcastDistanceSquared = broadcastDx * broadcastDx + broadcastDy * broadcastDy + broadcastDz * broadcastDz;
        
        // Check if we've moved enough to warrant a broadcast
        const now = Date.now();
        const timeSinceLastBroadcast = now - lastBroadcastTime;
        
        // Only broadcast if:
        // 1. We've moved more than the minimum distance, OR
        // 2. It's been at least MIN_BROADCAST_INTERVAL ms since our last broadcast
        if (broadcastDistanceSquared >= MIN_BROADCAST_DISTANCE_SQUARED || timeSinceLastBroadcast >= MIN_BROADCAST_INTERVAL) {
          // Broadcast player movement to other players
          socket.broadcast.emit('playerMove', {
            id: socket.id,
            x: validX,
            y: position.y,
            z: validZ,
            timestamp: Date.now()
          });
          
          // Update last broadcast position and time
          lastBroadcastPosition = { x: validX, y: position.y, z: validZ };
          lastBroadcastTime = now;
          
          // Debug log about broadcasting
          console.log(`Broadcasting player ${socket.id} movement: distance=${Math.sqrt(broadcastDistanceSquared)}, lastBroadcast=${timeSinceLastBroadcast}ms ago`);
        } else {
          // Debug log about skipping broadcast
          console.log(`Skipping broadcast for player ${socket.id}: distance=${Math.sqrt(broadcastDistanceSquared)}, lastBroadcast=${timeSinceLastBroadcast}ms ago`);
        }
        
        // Save player position to the database occasionally
        if (socket.data.movementCount % 10 === 0) {
          if (socket.user && socket.user.id) {
            try {
              await savePlayerPosition(socket.user.id, validX, position.y, validZ);
            } catch (error) {
              console.error('Error saving player position:', error);
            }
          }
        }
      }
    });
  }
  
  /**
   * Setup handlers for player data
   */
  public setupDataHandlers(socket: ExtendedSocket): void {
    // Ping/heartbeat response handler
    socket.on('pong', (startTime: number) => {
      const latency = Date.now() - startTime;
      if (this.players[socket.id]) {
        this.players[socket.id].lastPing = Date.now();
        this.players[socket.id].latency = latency;
      }
    });
    
    // Get all players
    socket.on('getPlayers', () => {
      const playersList = Object.values(this.players)
        .filter(p => p.id !== socket.id)
        // Filter out players with default positions
        .filter(p => !this.isDefaultPosition(p.x, p.y, p.z))
        .map(p => p as Player);
      
      console.log(`Sending ${playersList.length} filtered players to ${socket.id} for getPlayers`);
      socket.emit('initPlayers', playersList);
      
      // Also send the current player count
      this.broadcastPlayerCount();
    });
    
    // Request all players (used for synchronization)
    socket.on('requestAllPlayers', () => {
      const playersList = Object.values(this.players)
        .filter(p => p.id !== socket.id)
        // Filter out players with default positions
        .filter(p => !this.isDefaultPosition(p.x, p.y, p.z))
        .map(p => p as Player);
      
      console.log(`Sending ${playersList.length} players to ${socket.id} for requestAllPlayers (filtered out default positions)`);
      socket.emit('initPlayers', playersList);
      
      // Make sure client has correct player count
      socket.emit('playerCount', Object.keys(this.players).length);
    });
    
    // Get total player count
    socket.on('getPlayerCount', () => {
      const totalPlayers = Object.keys(this.players).length;
      console.log(`Sending player count to ${socket.id}: ${totalPlayers} players online`);
      socket.emit('playerCount', totalPlayers);
    });
    
    // Handle sync check request - validate player list between client and server
    socket.on('syncPlayerList', (clientPlayerIds: string[], callback: (serverPlayerIds: string[]) => void) => {
      // Get all non-default position players
      const nonDefaultPlayers = Object.values(this.players)
        .filter(p => !this.isDefaultPosition(p.x, p.y, p.z));
      
      const serverPlayerIds = nonDefaultPlayers.map(p => p.id);
      console.log(`Sync request from ${socket.id}. Client has ${clientPlayerIds.length} players, server has ${serverPlayerIds.length} non-default players`);
      
      // Return the server's player list for comparison
      callback(serverPlayerIds);
      
      // Also send full player data if needed - filtered to exclude default positions
      socket.emit('initPlayers', nonDefaultPlayers
        .filter(p => p.id !== socket.id)
        .map(p => p as Player));
      
      // Update player count - still use all players for count
      socket.emit('playerCount', Object.keys(this.players).length);
    });
    
    // Update display name
    socket.on('updateDisplayName', async (data: { name: string }) => {
      if (this.players[socket.id]) {
        const oldName = this.players[socket.id].name;
        const newName = data.name.trim().substring(0, 16); // Limit to 16 chars
        
        // Update the player name
        this.players[socket.id].name = newName;
        
        // Broadcast the name change to all clients
        this.io.emit('playerNameChanged', {
          id: socket.id,
          oldName,
          newName
        });
        
        // If user is authenticated, save name to database
        if (socket.user && socket.user.id) {
          try {
            const { data, error } = await supabase
              .from('profiles')
              .update({ username: newName })
              .eq('id', socket.user.id);
            
            if (error) {
              console.error('Error updating username in database:', error);
            }
          } catch (error) {
            console.error('Exception updating username:', error);
          }
        }
      }
    });
  }
  
  /**
   * Handle initial player data - send existing players to new player and announce new player to others
   */
  public handleInitialPlayerData(socket: ExtendedSocket, newPlayer: Player): void {
    // Add lastPing and lastActive to player data
    newPlayer.lastPing = Date.now();
    newPlayer.lastActive = Date.now();
    
    // Only broadcast the new player if they don't have the default position
    if (!this.isDefaultPosition(newPlayer.x, newPlayer.y, newPlayer.z)) {
      // Tell all other clients about the new player
      socket.broadcast.emit('playerJoined', newPlayer);
      console.log(`Broadcasting new player ${newPlayer.name} (${socket.id}) with position (${newPlayer.x}, ${newPlayer.y}, ${newPlayer.z})`);
    } else {
      console.log(`New player ${newPlayer.name} (${socket.id}) has default position (0,1,0), skipping initial broadcast`);
    }
    
    // Send the new player the list of existing players
    const existingPlayers = Object.values(this.players)
      .filter(p => p.id !== socket.id)
      .map(p => p as Player);
    
    socket.emit('initPlayers', existingPlayers);
    
    // Broadcast updated player count to all clients
    this.broadcastPlayerCount();
  }
  
  /**
   * Handle player disconnection
   */
  public handleDisconnect(socket: ExtendedSocket): void {
    console.log(`Player disconnected: ${socket.id}`);
    
    // Get the player
    const player = this.players[socket.id];
    
    if (player) {
      // Save final position to database
      if (socket.user && socket.user.id) {
        savePlayerPosition(socket.user.id, player.x, player.y, player.z)
          .catch(error => console.error('Error saving final player position:', error));
      }
      
      // Remove player from userIdToSocketId map
      if (player.userId && this.userIdToSocketId[player.userId] === socket.id) {
        delete this.userIdToSocketId[player.userId];
      }
      
      // Remove from players object
      delete this.players[socket.id];
      
      // Notify other clients
      this.io.emit('playerLeft', { id: socket.id });
      
      console.log(`Player ${player.name} (${socket.id}) removed. Total players: ${Object.keys(this.players).length}`);
      
      // Broadcast updated player count to all clients
      this.broadcastPlayerCount();
    }
  }
  
  /**
   * Handle server shutdown or cleanup
   */
  public cleanup(): void {
    // Clear the heartbeat interval
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }
}

export default PlayerHandler; 