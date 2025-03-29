import { useEffect, useState } from 'react';

interface LoadingScreenProps {
  message?: string;
}

const LoadingScreen = ({ message = 'Loading game...' }: LoadingScreenProps) => {
  const [dots, setDots] = useState('.');
  const [loadingTime, setLoadingTime] = useState(0);
  const [showTip, setShowTip] = useState(false);

  useEffect(() => {
    // Animate loading dots
    const dotsInterval = setInterval(() => {
      setDots(prev => prev.length < 3 ? prev + '.' : '.');
    }, 300);

    // Track loading time
    const timeInterval = setInterval(() => {
      setLoadingTime(prev => prev + 1);
      
      // Show refresh tip after 10 seconds
      if (loadingTime >= 10 && !showTip) {
        setShowTip(true);
      }
    }, 1000);

    return () => {
      clearInterval(dotsInterval);
      clearInterval(timeInterval);
    };
  }, [loadingTime, showTip]);

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      height: '100vh',
      backgroundColor: '#1a1a1a',
      color: '#ffffff',
      fontFamily: 'Arial, sans-serif'
    }}>
      <h1 style={{
        fontSize: '2rem',
        marginBottom: '1rem'
      }}>
        MiniScape
      </h1>
      
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: '1rem'
      }}>
        <div style={{
          width: '200px',
          height: '6px',
          backgroundColor: '#333333',
          borderRadius: '3px',
          overflow: 'hidden',
          position: 'relative'
        }}>
          <div style={{
            position: 'absolute',
            height: '100%',
            width: `${Math.min(loadingTime * 10, 100)}%`,
            backgroundColor: '#4CAF50',
            borderRadius: '3px',
            transition: 'width 0.3s ease'
          }}></div>
        </div>
      </div>
      
      <p style={{ fontSize: '1rem' }}>
        {message}{dots}
      </p>
      
      {showTip && (
        <div style={{
          marginTop: '2rem',
          padding: '0.5rem 1rem',
          backgroundColor: 'rgba(255, 255, 255, 0.1)',
          borderRadius: '4px',
          maxWidth: '80%',
          textAlign: 'center'
        }}>
          <p>Taking longer than expected? Try refreshing the page.</p>
        </div>
      )}
    </div>
  );
};

export default LoadingScreen; 