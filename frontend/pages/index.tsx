import { useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import { useRouter } from 'next/router';
import dynamic from 'next/dynamic';
import { useAuth } from '../contexts/AuthContext';
import { setupSocketCleanup } from '../game/network/socket';
import LoadingScreen from '../components/LoadingScreen';

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
      // If we're still loading after 5 seconds, continue anyway
      if (authLoading) {
        addDebugInfo('Auth loading timeout reached (5s), continuing to game');
        setIsLoading(false);
      }
    }, 5000);

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
        addDebugInfo('Socket connection timed out after 5 seconds, proceeding anyway');
      }, 5000);
      
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
        }, 2500);
        
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
      }, 1000);
    }, 100);

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

  // Main render function for the page
  return (
    <div className="game-container">
      <Head>
        <title>MiniScape</title>
        <meta name="description" content="A minimalist social RPG" />
      </Head>

      {isLoading ? (
        <LoadingScreen message={socketError ? 'Connection error, retrying...' : 'Loading game...'} />
      ) : (
        <main>
          {/* Game canvas component */}
          <DynamicGameCanvas />
          
          {/* Debug panel if enabled */}
          {showDebugPanel && (
            <div className="debug-panel">
              <h3>Debug Info</h3>
              <pre>{debugInfo.join('\n')}</pre>
              <DynamicDebugButton />
            </div>
          )}
        </main>
      )}
    </div>
  );
}