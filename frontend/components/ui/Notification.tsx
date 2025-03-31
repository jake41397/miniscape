import React, { useState, useEffect } from 'react';

interface NotificationProps {
  message: string;
  duration?: number;
  type?: 'info' | 'success' | 'error' | 'warning';
  onClose?: () => void;
}

const Notification: React.FC<NotificationProps> = ({
  message,
  duration = 3000,
  type = 'info',
  onClose
}) => {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => {
      setVisible(false);
      if (onClose) onClose();
    }, duration);

    return () => clearTimeout(timer);
  }, [duration, onClose]);

  // Get background color based on type
  const getBackgroundColor = () => {
    switch (type) {
      case 'success':
        return 'bg-green-700';
      case 'error':
        return 'bg-red-700';
      case 'warning':
        return 'bg-yellow-600';
      case 'info':
      default:
        return 'bg-blue-700';
    }
  };

  // If not visible, don't render anything
  if (!visible) return null;

  return (
    <div className="fixed top-5 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
      <div className={`${getBackgroundColor()} text-white px-4 py-2 rounded-md shadow-lg max-w-md`}>
        {message}
      </div>
    </div>
  );
};

export default Notification; 