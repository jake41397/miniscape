import React, { useEffect } from 'react';
import { getSocket } from '../../game/network/socket';

interface CustomNotificationEvent extends CustomEvent {
  detail: {
    message: string;
    type?: 'info' | 'success' | 'error' | 'warning';
    duration?: number;
  }
}

// Redirect notifications to chat panel
const NotificationController: React.FC = () => {
  useEffect(() => {
    // Handler for the show-notification event
    const handleShowNotification = async (event: CustomNotificationEvent) => {
      const { message, type = 'info' } = event.detail;
      
      // Get socket connection
      const socket = await getSocket();
      
      if (socket) {
        // Convert notification type to chat message type
        let messageType: string;
        switch (type) {
          case 'success':
            messageType = 'success';
            break;
          case 'error':
            messageType = 'error';
            break;
          case 'warning':
            messageType = 'warning';
            break;
          case 'info':
          default:
            messageType = 'system';
            break;
        }
        
        // Instead of using socket.emit directly, use document.dispatchEvent
        // to trigger a chat message directly through the chat system
        const chatEvent = new CustomEvent('chat-message', {
          detail: {
            content: message,
            type: messageType,
            timestamp: Date.now()
          },
          bubbles: true
        });
        document.dispatchEvent(chatEvent);
      }
    };

    // Add event listener
    document.addEventListener('show-notification', handleShowNotification as unknown as EventListener);

    // Cleanup
    return () => {
      document.removeEventListener('show-notification', handleShowNotification as unknown as EventListener);
    };
  }, []);

  // Return empty fragment - no visual component needed anymore
  return null;
};

export default NotificationController; 