import React from 'react';
import { Socket } from 'socket.io-client';
import { ChatRefHandle } from '../chat/Chat';
import { SocketController } from './SocketController';
import soundManager from '../../game/audio/soundManager';
import { SoundCategory } from '../../game/audio/soundManager';

interface ChatMessage {
  type: 'self' | 'other' | 'system' | 'player';
  text: string;
  sender?: string;
}

export interface UIControllerOptions {
  chatRef: React.MutableRefObject<ChatRefHandle | null>;
  socketController: SocketController;
  setPlayerName: (name: string) => void;
  setCurrentZone: (zone: string) => void;
  setSoundEnabled: (enabled: boolean) => void;
  setIsSettingsOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
  setDisplayName: (name: string) => void;
  setIsHorizontalInverted: (inverted: boolean | ((prev: boolean) => boolean)) => void;
}

export class UIController {
  private chatRef: React.MutableRefObject<ChatRefHandle | null>;
  private socketController: SocketController;
  private setPlayerName: (name: string) => void;
  private setCurrentZone: (zone: string) => void;
  private setSoundEnabled: (enabled: boolean) => void;
  private setIsSettingsOpen: (isOpen: boolean | ((prev: boolean) => boolean)) => void;
  private setDisplayName: (name: string) => void;
  private setIsHorizontalInverted: (inverted: boolean | ((prev: boolean) => boolean)) => void;
  
  // Keep local message history
  private chatMessages: ChatMessage[] = [];
  private soundEnabled: boolean = true;
  
  constructor(options: UIControllerOptions) {
    this.chatRef = options.chatRef;
    this.socketController = options.socketController;
    this.setPlayerName = options.setPlayerName;
    this.setCurrentZone = options.setCurrentZone;
    this.setSoundEnabled = options.setSoundEnabled;
    this.setIsSettingsOpen = options.setIsSettingsOpen;
    this.setDisplayName = options.setDisplayName;
    this.setIsHorizontalInverted = options.setIsHorizontalInverted;
  }
  
  public updatePlayerName(name: string): void {
    // Update both player name and display name
    this.setPlayerName(name);
    this.setDisplayName(name);
    console.log(`UIController: Updated player name to "${name}"`);
  }
  
  public updateZone(zone: string): void {
    this.setCurrentZone(zone);
    
    // Show zone change message in chat
    this.addChatMessage({
      type: 'system',
      content: `You have entered ${zone}.`
    });
  }
  
  public toggleSettings(): void {
    this.setIsSettingsOpen((prev) => !prev);
  }
  
  public toggleSound(): void {
    this.soundEnabled = !this.soundEnabled;
    soundManager.setEnabled(this.soundEnabled);
  }
  
  public toggleCameraInversion(): void {
    this.setIsHorizontalInverted((prev) => !prev);
  }
  
  public updateDisplayName(name: string): void {
    if (!name.trim()) return;
    
    console.log(`UIController: Updating display name to "${name.trim()}"`);
    this.setDisplayName(name.trim());
    this.setPlayerName(name.trim());
    this.socketController.updateDisplayName(name.trim());
  }
  
  public sendChatMessage(message: string): void {
    // Skip empty messages
    if (!message.trim()) return;
    
    // Send the message to the server
    this.socketController.sendChatMessage(message);
    
    // Add the message to the chat locally (for immediate feedback)
    this.addChatMessage({
      type: 'self',
      content: message
    });
  }
  
  public addChatMessage(message: { type: string, content: string, sender?: string }): void {
    if (!this.chatRef.current) return;
    
    // Map message type to chat system format
    let chatMessageType: 'self' | 'other' | 'system';
    
    switch (message.type) {
      case 'self':
        chatMessageType = 'self';
        break;
      case 'player':
        chatMessageType = 'other';
        break;
      default:
        chatMessageType = 'system';
        break;
    }
    
    // Create chat message for our internal tracking
    const chatMessage: ChatMessage = {
      type: chatMessageType,
      text: message.content,
      sender: message.sender || ''
    };
    
    // Store in our message history
    this.chatMessages.push(chatMessage);
    
    // Update chat bubbles
    if (this.chatRef.current) {
      this.chatRef.current.updateChatBubbles();
    }
    
    // Play sound for new messages, but not for self messages
    if (chatMessageType !== 'self') {
      // Set UI category volume temporarily for this sound
      soundManager.setCategoryVolume(SoundCategory.UI, 0.3);
      soundManager.play('chatMessage');
      // Reset UI category volume
      soundManager.setCategoryVolume(SoundCategory.UI, 0.8);
    }
  }
  
  public receiveChatMessage(data: { sender: string, message: string }): void {
    if (!data.message.trim()) return;
    
    this.addChatMessage({
      type: 'player',
      content: data.message,
      sender: data.sender
    });
  }
  
  public receiveSystemMessage(message: string): void {
    this.addChatMessage({
      type: 'system',
      content: message
    });
  }
  
  public clearChat(): void {
    // Clear our local message history
    this.chatMessages = [];
    
    // Update chat bubbles
    if (this.chatRef.current) {
      this.chatRef.current.updateChatBubbles();
    }
  }
  
  public showDropNotification(item: { itemType: string, quantity: number }): void {
    this.addChatMessage({
      type: 'system',
      content: `${item.quantity > 1 ? `${item.quantity}x ` : ''}${item.itemType} dropped.`
    });
  }
  
  public showPickupNotification(item: { itemType: string, quantity: number }): void {
    this.addChatMessage({
      type: 'system',
      content: `You picked up ${item.quantity > 1 ? `${item.quantity}x ` : ''}${item.itemType}.`
    });
    
    // Play pickup sound
    soundManager.play('itemPickup');
  }
  
  public showResourceGatherNotification(resourceType: string, itemType: string, quantity: number): void {
    this.addChatMessage({
      type: 'system',
      content: `You gathered ${quantity > 1 ? `${quantity}x ` : ''}${itemType} from the ${resourceType}.`
    });
    
    // Play gathering sound based on resource type
    switch (resourceType.toLowerCase()) {
      case 'tree':
        soundManager.play('woodcutting');
        break;
      case 'rock':
        soundManager.play('mining');
        break;
      case 'fish':
        soundManager.play('fishing');
        break;
    }
  }
  
  public showPlayerJoinNotification(playerName: string): void {
    this.addChatMessage({
      type: 'system',
      content: `${playerName} has joined the game.`
    });
    
    // Play player join sound with lower volume
    soundManager.setCategoryVolume(SoundCategory.UI, 0.3);
    soundManager.play('playerJoin');
    soundManager.setCategoryVolume(SoundCategory.UI, 0.8);
  }
  
  public showPlayerLeaveNotification(playerName: string): void {
    this.addChatMessage({
      type: 'system',
      content: `${playerName} has left the game.`
    });
  }
}

export default UIController; 