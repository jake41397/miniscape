import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { getSocketStatus } from '../game/network/socket';

interface SessionStatusProps {
  compact?: boolean;
}

const SessionStatus: React.FC<SessionStatusProps> = ({ compact = false }) => {
  const { session, loading } = useAuth();
  const [socketStatus, setSocketStatus] = useState({
    connected: false,
    id: null as string | null,
    reconnectAttempts: 0,
    paused: false
  });
  const [expanded, setExpanded] = useState(!compact);
  const [refreshCount, setRefreshCount] = useState(0);
  
  // Update socket status periodically
  useEffect(() => {
    const updateSocketStatus = () => {
      try {
        const status = getSocketStatus();
        setSocketStatus(status);
      } catch (e) {
        console.error('Error getting socket status:', e);
      }
    };
    
    // Initial update
    updateSocketStatus();
    
    // Update every 2 seconds
    const intervalId = setInterval(updateSocketStatus, 2000);
    
    return () => clearInterval(intervalId);
  }, []);
  
  // Force a refresh of the component
  const forceRefresh = () => {
    setRefreshCount(prev => prev + 1);
  };
  
  if (compact) {
    return (
      <div 
        onClick={() => setExpanded(!expanded)}
        style={{
          position: 'fixed',
          top: '0',
          left: '0',
          zIndex: 9999,
          cursor: 'pointer',
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: 'white',
          padding: '5px',
          borderBottomRightRadius: '5px',
          fontSize: '10px',
          fontFamily: 'monospace',
          display: 'flex',
          alignItems: 'center',
          gap: '5px'
        }}
      >
        <div style={{ 
          width: '10px', 
          height: '10px', 
          borderRadius: '50%',
          backgroundColor: session ? '#4caf50' : loading ? '#ff9800' : '#f44336'
        }} />
        
        {expanded && (
          <div>
            <span>{session ? 'Auth: ✓' : loading ? 'Auth: ⟳' : 'Auth: ✗'}</span>
            <span style={{ marginLeft: '10px' }}>
              {socketStatus.connected ? 'Socket: ✓' : 'Socket: ✗'}
            </span>
          </div>
        )}
      </div>
    );
  }
  
  return (
    <div style={{
      position: 'fixed',
      top: '10px',
      left: '10px',
      zIndex: 9999,
      backgroundColor: 'rgba(0,0,0,0.8)',
      color: 'white',
      padding: '10px',
      borderRadius: '4px',
      fontSize: '12px',
      fontFamily: 'monospace',
      maxWidth: '300px'
    }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '5px'
      }}>
        <strong>Session Status</strong>
        <button
          onClick={forceRefresh}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: 'white',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          ⟳
        </button>
      </div>
      
      <div>
        <div style={{ marginBottom: '5px' }}>
          <span style={{ 
            display: 'inline-block',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: session ? '#4caf50' : loading ? '#ff9800' : '#f44336',
            marginRight: '5px'
          }} />
          <span>
            Auth: {session ? 'Authenticated' : loading ? 'Loading...' : 'Not Authenticated'}
          </span>
        </div>
        
        {session && (
          <div style={{ fontSize: '10px', marginBottom: '5px', marginLeft: '15px' }}>
            User: {session.user?.email}
          </div>
        )}
        
        <div style={{ marginBottom: '5px' }}>
          <span style={{ 
            display: 'inline-block',
            width: '10px',
            height: '10px',
            borderRadius: '50%',
            backgroundColor: socketStatus.connected ? '#4caf50' : socketStatus.paused ? '#f44336' : '#ff9800',
            marginRight: '5px'
          }} />
          <span>
            Socket: {socketStatus.connected ? 'Connected' : socketStatus.paused ? 'Paused' : 'Disconnected'}
          </span>
        </div>
        
        {socketStatus.id && (
          <div style={{ fontSize: '10px', marginBottom: '5px', marginLeft: '15px' }}>
            ID: {socketStatus.id}
          </div>
        )}
        
        {socketStatus.reconnectAttempts > 0 && (
          <div style={{ fontSize: '10px', marginBottom: '5px', marginLeft: '15px' }}>
            Reconnect attempts: {socketStatus.reconnectAttempts}
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionStatus; 