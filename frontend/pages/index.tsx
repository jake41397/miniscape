import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useAuth } from '../contexts/AuthContext';
import { setupSocketCleanup } from '../game/network/socket';

// Dynamic imports to avoid SSR issues
const DynamicDebugButton = dynamic(() => import('../components/DebugButton'), { 
  ssr: false 
});
const DynamicGameCanvas = dynamic(() => import('../components/GameCanvas'), { 
  ssr: false,
  loading: () => <div>Loading game engine...</div>
});

// Debug logger
const useDebugLogger = () => {
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  
  // Simple function to add timestamped debug lines
  const addDebugInfo = (message: string, data?: any) => {
    const now = new Date();
    const timeString = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;
    
    let debugMessage = `${timeString} - ${message}`;
    if (data) {
      try {
        const dataString = typeof data === 'string' ? data : JSON.stringify(data);
        debugMessage += ` ${dataString}`;
      } catch (e) {
        debugMessage += ' [data cannot be stringified]';
      }
    }
    
    setDebugInfo(prev => [...prev, debugMessage]);
    console.log(debugMessage);
  };
  
  return { debugInfo, addDebugInfo, showDebugPanel, setShowDebugPanel };
};

// Home page component with Game Canvas
export default function Home() {
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [socketError, setSocketError] = useState<string | null>(null);
  const { debugInfo, addDebugInfo, showDebugPanel, setShowDebugPanel } = useDebugLogger();
  
  // Refs to prevent duplicate operations
  const lastAuthCheck = useRef(0);
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const initAttempted = useRef(false);
  const socketRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Log important lifecycle events
  useEffect(() => {
    addDebugInfo('Home component mounted');
    addDebugInfo(`Current URL: ${typeof window !== 'undefined' ? window.location.href : 'SSR'}`);
    
    // Set up socket cleanup when component unmounts
    addDebugInfo('Setting up socket cleanup');
    const cleanup = setupSocketCleanup();
    
    // Read debug flags from URL or localStorage
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const debugParam = urlParams.get('debug');
      
      if (debugParam === 'true' || localStorage.getItem('show_debug') === 'true') {
        setShowDebugPanel(true);
        addDebugInfo('Debug panel enabled via URL or localStorage');
      }
    }
    
    return () => {
      addDebugInfo('Home component unmounting');
      cleanup();
    };
  }, []);
  
  // Monitor auth state changes
  useEffect(() => {
    addDebugInfo(`Auth state changed - session: ${!!session}, loading: ${authLoading}`);
  }, [session, authLoading]);
  
  // Handle authentication check and redirection
  useEffect(() => {
    // Avoid rapid authentication checks (prevent loops)
    const now = Date.now();
    if (now - lastAuthCheck.current < 2000) { // 2 second cooldown
      addDebugInfo(`Auth check too soon (${now - lastAuthCheck.current}ms), skipping`);
      return;
    }
    lastAuthCheck.current = now;

    // Set a maximum loading time to avoid getting stuck
    const maxLoadingTime = setTimeout(() => {
      // If we're still loading after 15 seconds, continue anyway
      if (authLoading) {
        addDebugInfo('Auth loading timeout reached (15s), continuing to game');
        setIsLoading(false);
      }
    }, 15000);

    // Clear any existing redirect timeout
    if (redirectTimeoutRef.current) {
      addDebugInfo('Clearing existing redirect timeout');
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }

    // Only check auth after auth state has loaded
    if (!authLoading) {
      // Clear the max loading timeout since auth is done loading
      clearTimeout(maxLoadingTime);
      
      addDebugInfo(`Auth loaded, proceeding to game`);
      
      // Always allow access to the game
      setIsLoading(false);
      
      // Clear any stored redirect intentions
      localStorage.removeItem('redirect_to_signin_at');
      localStorage.removeItem('auth_timeout');
    }
    
    // Add a safety cleanup to ensure we don't get stuck
    return () => {
      clearTimeout(maxLoadingTime);
      if (redirectTimeoutRef.current) {
        clearTimeout(redirectTimeoutRef.current);
        redirectTimeoutRef.current = null;
      }
    };
  }, [session, authLoading, router]);

  // Initialize socket connection directly using our client-side implementation
  const initializeSocket = async () => {
    try {
      addDebugInfo('Starting direct socket initialization with backend');
      
      // Set a timeout for socket connection
      const socketTimeout = setTimeout(() => {
        setIsLoading(false);
        addDebugInfo('Socket connection timed out after 10 seconds, proceeding anyway');
      }, 10000);
      
      // Import and use our socket client implementation
      const { initializeSocket: initSocket, getSocket } = await import('../game/network/socket');
      
      // Initialize the socket connection
      const socket = await initSocket();
      
      // Clear the timeout since initialization completed
      clearTimeout(socketTimeout);
      
      if (!socket) {
        throw new Error('Failed to initialize socket - no connection established');
      }
      
      // Check if we've connected successfully
      if (socket.connected) {
        addDebugInfo('Socket connected successfully!', { socketId: socket.id });
        localStorage.setItem('socket_initialized_at', Date.now().toString());
        setIsLoading(false);
      } else {
        addDebugInfo('Socket initialized but not yet connected - waiting for connection');
        
        // Add a listener for connection with a timeout
        const connectionTimeout = setTimeout(() => {
          addDebugInfo('Socket connection timeout reached, proceeding anyway');
          setIsLoading(false);
        }, 5000);
        
        // Add a one-time connection listener
        socket.once('connect', () => {
          clearTimeout(connectionTimeout);
          addDebugInfo('Socket connected after initialization', { socketId: socket.id });
          localStorage.setItem('socket_initialized_at', Date.now().toString());
          setIsLoading(false);
        });
        
        // Add a one-time error listener
        socket.once('connect_error', (err) => {
          clearTimeout(connectionTimeout);
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          addDebugInfo(`Socket connection error: ${errorMessage}`);
          setSocketError(errorMessage);
          setIsLoading(false);
        });
      }
    } catch (error) {
      // Handle errors gracefully
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      addDebugInfo(`Failed to initialize socket: ${errorMessage}`);
      setSocketError(errorMessage);
      setIsLoading(false);
    }
  };

  // Initialize the socket - run this regardless of auth state
  useEffect(() => {
    // Skip initialization if we're still loading auth state
    if (authLoading) {
      addDebugInfo('Auth still loading, skipping socket initialization');
      return;
    }
    
    // Check if we've already successfully initialized
    const isInitialized = localStorage.getItem('socket_initialized_at');
    const lastInitTime = isInitialized ? parseInt(isInitialized, 10) : 0;
    const now = Date.now();
    
    // If we've initialized within the last 5 seconds, don't attempt again
    // This prevents issues with component remounting in development
    if (now - lastInitTime < 5000) {
      addDebugInfo(`Socket already initialized recently (${Math.floor((now - lastInitTime)/1000)}s ago), skipping`);
      setIsLoading(false);
      return;
    }
    
    // Only set this if we're actually going to attempt initialization
    if (!initAttempted.current) {
      addDebugInfo('Starting socket initialization process');
      initAttempted.current = true;
    } else {
      addDebugInfo('Socket initialization already attempted, continuing');
      // Always proceed to game if initialization was already attempted
      setIsLoading(false);
      return;
    }

    // Initialize socket connection with a small delay
    const initializedTimer = setTimeout(() => {
      initializeSocket();
      
      // Set loading to false after a reasonable time even if connection hasn't completed
      setTimeout(() => {
        setIsLoading(false);
        addDebugInfo('Forcing game to start after timeout');
      }, 2000);
    }, 500);

    return () => {
      addDebugInfo('Cleaning up socket initialization timer');
      clearTimeout(initializedTimer);
      
      // Also clear any retry timeouts
      if (socketRetryTimeoutRef.current) {
        clearTimeout(socketRetryTimeoutRef.current);
        socketRetryTimeoutRef.current = null;
      }
    };
  }, [authLoading]);

  // Override LoadingScreen component to ensure it continues to game after delay
  const LoadingScreen = () => {
    const [dots, setDots] = useState(".");
    const [elapsedTime, setElapsedTime] = useState(0);

    useEffect(() => {
      const timer = setTimeout(() => {
        setDots(dots => dots.length < 3 ? dots + "." : ".");
      }, 500);
      
      // Count elapsed time
      const elapsedTimer = setInterval(() => {
        setElapsedTime(prev => prev + 1);
      }, 1000);
      
      // Force loading to complete after 10 seconds
      if (elapsedTime > 10) {
        addDebugInfo('Loading timeout reached (10s), forcing game to start');
        setIsLoading(false);
      }
      
      return () => {
        clearTimeout(timer);
        clearInterval(elapsedTimer);
      };
    }, [dots, elapsedTime]);

    return (
      <div style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#111',
        color: '#fff',
        zIndex: 1000,
        fontFamily: 'Monospace, monospace'
      }}>
        <h2>MiniScape</h2>
        <div>Loading game{dots}</div>
        <div style={{ marginTop: '20px', fontSize: '14px', opacity: 0.7 }}>
          {elapsedTime > 5 && "Taking longer than expected... "}
          {elapsedTime > 8 && <div><button onClick={() => setIsLoading(false)} style={{
            padding: '8px 16px',
            background: '#333',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
            marginTop: '10px'
          }}>Start Game Now</button></div>}
        </div>
      </div>
    );
  };

  // Main render function for the page
  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Head>
        <title>MiniScape</title>
        <meta name="description" content="MiniScape - A Miniature Adventure" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {showDebugPanel && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            padding: '10px',
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            zIndex: 1000,
            maxHeight: '50vh',
            overflowY: 'auto',
            fontSize: '12px',
            fontFamily: 'monospace'
          }}
        >
          <div>
            <strong>Debug Info:</strong>
            <button 
              onClick={() => setShowDebugPanel(false)}
              style={{
                float: 'right',
                background: 'transparent',
                border: '1px solid #fff',
                color: '#fff',
                cursor: 'pointer'
              }}
            >
              Close
            </button>
          </div>
          {debugInfo.map((info, i) => (
            <div key={i}>{info}</div>
          ))}
        </div>
      )}

      {socketError && (
        <div
          style={{
            position: 'fixed',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '10px',
            background: 'rgba(255, 0, 0, 0.8)',
            color: '#fff',
            zIndex: 1000,
            fontSize: '14px',
            fontFamily: 'monospace',
            textAlign: 'center'
          }}
        >
          Socket Error: {socketError}
          <button 
            onClick={() => {
              setSocketError(null);
              initializeSocket();
            }}
            style={{
              marginLeft: '10px',
              background: '#fff',
              color: '#f00',
              border: 'none',
              padding: '5px 10px',
              cursor: 'pointer'
            }}
          >
            Retry
          </button>
        </div>
      )}

      {isLoading ? (
        <LoadingScreen />
      ) : (
        <DynamicGameCanvas key={`game-canvas-${Date.now()}`} />
      )}
    
      {/* Debug button in the corner */}
      <div style={{
        position: 'fixed',
        bottom: '10px',
        left: '10px',
        zIndex: 1000,
        display: 'flex',
        flexDirection: 'column',
        gap: '5px'
      }}>
        <button 
          onClick={() => setShowDebugPanel(!showDebugPanel)}
          style={{
            background: 'rgba(0, 0, 0, 0.7)',
            color: '#fff',
            border: 'none',
            padding: '5px 10px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px'
          }}
        >
          {showDebugPanel ? 'Hide Debug' : 'Show Debug'}
        </button>
      </div>
    </div>
  );
}