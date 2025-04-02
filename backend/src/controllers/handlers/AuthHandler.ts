import { Server } from 'socket.io';
import { ExtendedSocket, PlayersStore } from '../types';
// Import MongoDB models
import User from '../../models/mongodb/userModel';
import Profile from '../../models/mongodb/profileModel';
import PlayerData from '../../models/mongodb/playerDataModel';
// Remove Supabase import and use JWT utils instead
import { verifyToken } from '../../utils/jwt';

export class AuthHandler {
  private io: Server;
  private players: PlayersStore;
  private userIdToSocketId: Record<string, string>;
  
  constructor(io: Server, players: PlayersStore, userIdToSocketId: Record<string, string>) {
    this.io = io;
    this.players = players;
    this.userIdToSocketId = userIdToSocketId;
  }
  
  /**
   * Verify a socket connection's authentication
   */
  public async verifySocketAuth(socket: ExtendedSocket): Promise<{
    isAuthenticated: boolean;
    userId?: string;
    profile?: any;
    playerData?: any;
  }> {
    const token = socket.handshake.auth.token;
    
    if (!token) {
      console.log(`Socket ${socket.id} has no auth token`);
      // Allow connection as guest for now
      return {
        isAuthenticated: false
      };
    }
    
    try {
      // Verify token with JWT util instead of Supabase
      const decoded = verifyToken(token);
      
      if (!decoded || !decoded.userId) {
        console.error(`Invalid auth token for socket ${socket.id}`);
        return {
          isAuthenticated: false
        };
      }
      
      const userId = decoded.userId;
      console.log(`Authenticated socket ${socket.id} for user ${userId}`);
      
      // Store user info in socket
      socket.user = {
        id: userId
      };
      
      // Check if player is already connected with another socket
      if (this.userIdToSocketId[userId] && this.userIdToSocketId[userId] !== socket.id) {
        const existingSocketId = this.userIdToSocketId[userId];
        console.log(`User ${userId} already connected with socket ${existingSocketId}, disconnecting old session`);
        
        // Disconnect the old socket
        const existingSocket = this.io.sockets.sockets.get(existingSocketId);
        if (existingSocket) {
          existingSocket.emit('forceDisconnect', { reason: 'logged_in_elsewhere' });
          existingSocket.disconnect(true);
        }
      }
      
      // Map user ID to socket ID
      this.userIdToSocketId[userId] = socket.id;
      
      // Get user profile from MongoDB
      const profile = await Profile.findOne({ userId }).lean();
      
      if (!profile) {
        console.error(`Profile not found for user ${userId}`);
      }
      
      // Get player data from MongoDB
      const playerData = await PlayerData.findOne({ userId }).lean();
      
      if (!playerData) {
        console.error(`Player data not found for user ${userId}`);
      }
      
      return {
        isAuthenticated: true,
        userId,
        profile,
        playerData
      };
    } catch (error) {
      console.error(`Error verifying socket auth for ${socket.id}:`, error);
      return {
        isAuthenticated: false
      };
    }
  }
  
  /**
   * Set up auth-related event listeners
   */
  public setupAuthListeners(socket: ExtendedSocket): void {
    // Handle client requesting auth verification
    socket.on('verifyAuth', async () => {
      const result = await this.verifySocketAuth(socket);
      socket.emit('authVerified', {
        isAuthenticated: result.isAuthenticated,
        userId: result.userId
      });
    });
    
    // Handle client logging out
    socket.on('logout', () => {
      if (socket.user && socket.user.id) {
        // Remove user-to-socket mapping
        if (this.userIdToSocketId[socket.user.id] === socket.id) {
          delete this.userIdToSocketId[socket.user.id];
        }
        
        // Clear user data from socket
        socket.user = undefined;
      }
      
      // Notify client
      socket.emit('loggedOut');
    });
  }
  
  /**
   * Create a guest session
   */
  public createGuestSession(socket: ExtendedSocket): string {
    const guestId = `guest-${Date.now()}-${Math.floor(Math.random() * 10000)}`;
    
    // Store in socket for future reference
    socket.data.guestId = guestId;
    
    return guestId;
  }
}

export default AuthHandler; 