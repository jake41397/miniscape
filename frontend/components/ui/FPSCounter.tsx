import React from 'react';

interface FPSCounterProps {
  fps: number;
}

const FPSCounter: React.FC<FPSCounterProps> = ({ fps }) => {
  // Determine color based on frame rate
  let fpsColor = '#4caf50'; // Green for good FPS
  if (fps < 30) {
    fpsColor = '#f44336'; // Red for low FPS
  } else if (fps < 50) {
    fpsColor = '#ff9800'; // Orange for medium FPS
  }

  return (
    <div style={{
      position: 'absolute',
      top: '10px',
      left: '120px', // Position to the right of the connection indicator
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      color: fpsColor,
      padding: '3px 6px',
      borderRadius: '4px',
      fontSize: '12px',
      fontFamily: 'monospace',
      userSelect: 'none',
      display: 'flex',
      alignItems: 'center',
      zIndex: 100, // Match ConnectionStatusIndicator's z-index
    }}>
      <span style={{ fontWeight: 'bold', marginRight: '3px' }}>FPS:</span> {fps}
    </div>
  );
};

export default FPSCounter; 