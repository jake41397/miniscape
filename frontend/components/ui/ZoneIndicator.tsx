import React from 'react';

interface ZoneIndicatorProps {
    currentZone: string;
}

const ZoneIndicator: React.FC<ZoneIndicatorProps> = ({ currentZone }) => {
    // Avoid rendering if zone is empty or not set
    if (!currentZone) return null;

    return (
        <div style={{
            position: 'absolute',
            top: '10px',
            left: '50%',
            transform: 'translateX(-50%)',
            padding: '5px 15px',
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            color: 'white',
            borderRadius: '20px',
            fontFamily: 'sans-serif',
            fontSize: '14px',
            fontWeight: 'bold',
            zIndex: 100,
            whiteSpace: 'nowrap', // Prevent wrapping
            pointerEvents: 'none', // Don't block clicks
        }}>
            {currentZone}
        </div>
    );
};

export default ZoneIndicator; 