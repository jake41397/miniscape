import React from 'react';

interface ConnectionStatusIndicatorProps {
    isConnected: boolean;
    playerCount?: number;
}

const ConnectionStatusIndicator: React.FC<ConnectionStatusIndicatorProps> = ({ isConnected, playerCount }) => {
    return (
        <div style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            display: 'flex',
            alignItems: 'center',
            padding: '5px 10px',
            backgroundColor: isConnected ? 'rgba(0, 128, 0, 0.5)' : 'rgba(255, 0, 0, 0.5)',
            color: 'white',
            borderRadius: '5px',
            fontFamily: 'sans-serif',
            fontSize: '12px',
            zIndex: 100,
            transition: 'background-color 0.3s ease', // Smooth transition
        }}>
            <div style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isConnected ? '#0f0' : '#f00',
                marginRight: '5px',
                transition: 'background-color 0.3s ease', // Smooth transition
            }}></div>
            {playerCount !== undefined ? `Online: ${playerCount}` : (isConnected ? 'Connected' : 'Disconnected')}
        </div>
    );
};

export default ConnectionStatusIndicator; 