import React, { useState, useEffect } from 'react';
import { useGame } from '../../contexts/GameContext';
import { ZONES } from '../../game/world/zones';

interface ZoneIndicatorProps {
    currentZone: string;
}

const ZoneIndicator: React.FC<ZoneIndicatorProps> = ({ currentZone }) => {
    const { gameState } = useGame();
    const [showWarning, setShowWarning] = useState(false);
    const [warningOpacity, setWarningOpacity] = useState(1);
    const [fadeInterval, setFadeInterval] = useState<NodeJS.Timeout | null>(null);

    // Get zone details
    const zoneInfo = Object.values(ZONES).find(
        zone => zone.name.toLowerCase() === currentZone.toLowerCase()
    );
    
    // Handle zone change effects
    useEffect(() => {
        // Clear any existing interval
        if (fadeInterval) {
            clearInterval(fadeInterval);
            setFadeInterval(null);
        }
        
        // Reset warning state
        setWarningOpacity(1);
        
        // Show a warning if entering a PvP zone
        if (zoneInfo?.pvpEnabled) {
            setShowWarning(true);
            
            // Fade out warning after 5 seconds
            const intervalId = setInterval(() => {
                setWarningOpacity(prev => {
                    const newOpacity = Math.max(0, prev - 0.05);
                    if (newOpacity <= 0) {
                        clearInterval(intervalId);
                        setShowWarning(false);
                        return 0;
                    }
                    return newOpacity;
                });
            }, 100);
            
            setFadeInterval(intervalId);
            
            return () => {
                clearInterval(intervalId);
            };
        }
    }, [currentZone, zoneInfo]);

    // Determine zone colors based on safety
    const getZoneColor = () => {
        if (!zoneInfo) return '#ffffff';
        
        if (zoneInfo.pvpEnabled) {
            return '#ff3333'; // Red for dangerous areas
        } else if (zoneInfo.safeZone) {
            return '#33cc33'; // Green for safe zones
        } else {
            return '#ffcc00'; // Yellow for neutral zones
        }
    };

    return (
        <div className="zone-indicator">
            <div className="zone-name" style={{ color: getZoneColor() }}>
                <span className="zone-dot" style={{ backgroundColor: getZoneColor() }}></span>
                {currentZone}
            </div>
            
            {zoneInfo && (
                <div className="zone-description">
                    {zoneInfo.description}
                    {zoneInfo.requiredLevel && (
                        <span className="zone-level"> (Level {zoneInfo.requiredLevel}+)</span>
                    )}
                </div>
            )}
            
            {showWarning && zoneInfo?.pvpEnabled && (
                <div className="zone-warning" style={{ opacity: warningOpacity }}>
                    ⚠️ WARNING: PvP enabled! Players can attack you here!
                </div>
            )}
            
            <style jsx>{`
                .zone-indicator {
                    position: absolute;
                    top: 10px;
                    left: 10px;
                    background-color: rgba(0, 0, 0, 0.6);
                    color: white;
                    padding: 8px 12px;
                    border-radius: 4px;
                    font-family: 'Runescape', sans-serif;
                    z-index: 10;
                    max-width: 300px;
                }
                
                .zone-name {
                    font-size: 18px;
                    font-weight: bold;
                    display: flex;
                    align-items: center;
                }
                
                .zone-dot {
                    width: 8px;
                    height: 8px;
                    border-radius: 50%;
                    display: inline-block;
                    margin-right: 8px;
                }
                
                .zone-description {
                    font-size: 12px;
                    margin-top: 4px;
                    color: #cccccc;
                }
                
                .zone-level {
                    color: #ffcc00;
                }
                
                .zone-warning {
                    margin-top: 6px;
                    color: #ff9999;
                    font-weight: bold;
                    font-size: 14px;
                    animation: pulse 2s infinite;
                }
                
                @keyframes pulse {
                    0% { opacity: 0.7; }
                    50% { opacity: 1; }
                    100% { opacity: 0.7; }
                }
            `}</style>
        </div>
    );
};

export default ZoneIndicator; 