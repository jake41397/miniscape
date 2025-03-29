import { Server } from 'socket.io';
import { ExtendedSocket, PlayersStore } from '../types';

export class ChatHandler {
  private io: Server;
  private players: PlayersStore;
  
  // Rate limiting settings
  private messageRateLimit = 5; // messages per time period
  private rateLimitPeriod = 10000; // 10 seconds
  private messageCounts: Map<string, { count: number, resetTime: number }> = new Map();
  
  constructor(io: Server, players: PlayersStore) {
    this.io = io;
    this.players = players;
  }
  
  /**
   * Set up chat message handler
   */
  public setupChatHandler(socket: ExtendedSocket): void {
    socket.on('chatMessage', (data: { message: string }) => {
      // Skip empty messages
      if (!data.message || !data.message.trim()) return;
      
      // Get player name
      const playerName = this.players[socket.id]?.name || 'Unknown';
      
      // Check rate limiting
      if (this.isRateLimited(socket.id)) {
        // Send a private message to the user about rate limiting
        socket.emit('chatMessage', {
          name: 'System',
          text: 'You are sending messages too quickly. Please wait a moment.',
          playerId: 'system',
          timestamp: Date.now()
        });
        return;
      }
      
      // Filter inappropriate content (basic)
      const filteredMessage = this.filterMessage(data.message);
      
      // Log chat message
      console.log(`Chat from ${playerName} (${socket.id}): ${filteredMessage}`);
      
      // Broadcast message to all clients
      this.io.emit('chatMessage', {
        name: playerName,
        text: filteredMessage,
        playerId: socket.id,
        timestamp: Date.now()
      });
    });
    
    // Support legacy 'chat' event
    socket.on('chat', (message: string) => {
      if (!message || !message.trim()) return;
      
      // Reformat to match the new structure and pass to the main handler
      socket.emit('chatMessage', { message });
    });
  }
  
  /**
   * Send system message to a specific user
   */
  public sendSystemMessage(socket: ExtendedSocket, message: string): void {
    socket.emit('chatMessage', {
      name: 'System',
      text: message,
      playerId: 'system',
      timestamp: Date.now()
    });
  }
  
  /**
   * Broadcast system message to all users
   */
  public broadcastSystemMessage(message: string): void {
    this.io.emit('chatMessage', {
      name: 'System',
      text: message,
      playerId: 'system',
      timestamp: Date.now()
    });
  }
  
  /**
   * Check if a user is sending messages too quickly
   */
  private isRateLimited(socketId: string): boolean {
    const now = Date.now();
    
    // Get or initialize rate limit data for this user
    let rateData = this.messageCounts.get(socketId);
    if (!rateData) {
      rateData = { count: 0, resetTime: now + this.rateLimitPeriod };
      this.messageCounts.set(socketId, rateData);
    }
    
    // Reset count if the period has passed
    if (now > rateData.resetTime) {
      rateData.count = 0;
      rateData.resetTime = now + this.rateLimitPeriod;
    }
    
    // Increment message count
    rateData.count++;
    
    // Check if over limit
    return rateData.count > this.messageRateLimit;
  }
  
  /**
   * Basic message filtering
   */
  private filterMessage(message: string): string {
    // Make a copy of the original message
    let filtered = message;
    
    // Basic profanity filter - just an example
    const profanityWords = ['badword1', 'badword2', 'badword3'];
    
    // Replace each bad word with asterisks
    profanityWords.forEach(word => {
      const regex = new RegExp(word, 'gi');
      filtered = filtered.replace(regex, '*'.repeat(word.length));
    });
    
    // Limit message length
    if (filtered.length > 200) {
      filtered = filtered.substring(0, 200) + '...';
    }
    
    return filtered;
  }
}

export default ChatHandler; 