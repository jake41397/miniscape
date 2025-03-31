import React, { useState, useEffect } from 'react';
import Notification from '../ui/Notification';

interface NotificationData {
  id: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warning';
  duration?: number;
}

const NotificationController: React.FC = () => {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);

  useEffect(() => {
    // Handler for the show-notification event
    const handleShowNotification = (event: CustomEvent) => {
      const { message, type = 'info', duration = 3000 } = event.detail;
      
      // Add new notification with unique id
      const id = Date.now();
      setNotifications(prev => [...prev, { id, message, type, duration }]);
    };

    // Add event listener
    document.addEventListener('show-notification', handleShowNotification as EventListener);

    // Cleanup
    return () => {
      document.removeEventListener('show-notification', handleShowNotification as EventListener);
    };
  }, []);

  // Handle removing a notification
  const handleClose = (id: number) => {
    setNotifications(prev => prev.filter(notification => notification.id !== id));
  };

  return (
    <>
      {notifications.map(notification => (
        <Notification
          key={notification.id}
          message={notification.message}
          type={notification.type}
          duration={notification.duration}
          onClose={() => handleClose(notification.id)}
        />
      ))}
    </>
  );
};

export default NotificationController; 