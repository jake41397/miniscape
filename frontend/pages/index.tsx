import type { NextPage } from 'next';
import Head from 'next/head';
import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { setupSocketCleanup } from '../game/network/socket';

// Debug logger
const debugLog = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[DEBUG][${timestamp}][Home] ${message}`, data || '');
  
  // Store debug logs in localStorage for persistence across refreshes
  try {
    const logs = JSON.parse(localStorage.getItem('miniscape_debug_logs') || '[]');
    logs.push({ timestamp, page: 'home', message, data: data ? JSON.stringify(data) : undefined });
    // Keep only the most recent 100 logs
    if (logs.length > 100) logs.shift();
    localStorage.setItem('miniscape_debug_logs', JSON.stringify(logs));
  } catch (e) {
    console.error('Error storing debug logs:', e);
  }
};

// Dynamically import the GameCanvas component with no SSR
// This is necessary since Three.js uses browser APIs
const DynamicGameCanvas = dynamic(() => import('../components/GameCanvas'), {
  ssr: false,
  loading: () => (
    <div style={{ 
      display: 'flex', 
      justifyContent: 'center', 
      alignItems: 'center', 
      width: '100%', 
      height: '100%', 
      fontSize: '24px',
      fontWeight: 'bold' 
    }}>
      Loading game engine...
    </div>
  ),
});

// Dynamically import the DebugButton component with no SSR
const DynamicDebugButton = dynamic(() => import('../components/DebugButton'), {
  ssr: false,
});

// Dynamically import the SessionStatus component with no SSR
const DynamicSessionStatus = dynamic(() => import('../components/SessionStatus'), {
  ssr: false,
});

// Dynamically import the DebugViewLogs component with no SSR
const DynamicDebugViewLogs = dynamic(() => import('../components/DebugViewLogs'), {
  ssr: false,
});

const Home: NextPage = () => {
  const [isLoading, setIsLoading] = useState(true);
  const [socketError, setSocketError] = useState<string | null>(null);
  const initAttempted = useRef(false);
  const router = useRouter();
  const { session, loading: authLoading } = useAuth();
  const redirectAttempted = useRef(false);
  const lastAuthCheck = useRef(0);
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [showDebugPanel, setShowDebugPanel] = useState(false);
  const socketRetryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Add debug info handler
  const addDebugInfo = (info: string, data?: any) => {
    debugLog(info, data);
    setDebugInfo(prev => [...prev, `${new Date().toISOString().substr(11, 8)} - ${info}`]);
  };
  
  // Log component mounting
  useEffect(() => {
    addDebugInfo('Home component mounted');
    
    // Show debug panel when in dev or if query param is present
    if (process.env.NODE_ENV === 'development' || router.query.debug === 'true') {
      setShowDebugPanel(true);
    }
    
    // Check URL for issues
    addDebugInfo(`Current URL: ${window.location.href}`);
    if (window.location.hash) {
      addDebugInfo(`Hash detected in URL: ${window.location.hash}`);
      // Remove hash
      history.replaceState(null, '', window.location.pathname);
      addDebugInfo('Hash removed from URL');
    }
    
    return () => {
      addDebugInfo('Home component unmounting');
    };
  }, []);
  
  // Dump auth state on changes
  useEffect(() => {
    addDebugInfo(`Auth state changed - session: ${!!session}, loading: ${authLoading}`);
    if (session) {
      // Log limited session info for debugging
      const sessionDetails = { 
        userId: session.user?.id,
        email: session.user?.email,
        expiresAt: new Date(session.expires_at! * 1000).toISOString()
      };
      addDebugInfo('Session details:', sessionDetails);
    }
  }, [session, authLoading]);

  // Clean up any socket connections when component unmounts
  useEffect(() => {
    // Setup socket cleanup for navigation
    addDebugInfo('Setting up socket cleanup');
    setupSocketCleanup();
    
    return () => {
      // Clear any pending redirects
      if (redirectTimeoutRef.current) {
        addDebugInfo('Cleaning up redirect timeout on unmount');
        clearTimeout(redirectTimeoutRef.current);
      }
    };
  }, []);

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
      // If we're still loading after 15 seconds, force a navigation to signin page
      if (authLoading) {
        addDebugInfo('Auth loading timeout reached (15s), forcing navigation to signin');
        try {
          localStorage.setItem('redirect_to_signin_at', Date.now().toString());
          localStorage.setItem('auth_timeout', 'true');
          window.location.href = '/auth/signin';
        } catch (err) {
          addDebugInfo(`Redirect error: ${err instanceof Error ? err.message : 'Unknown error'}`);
          window.location.replace('/auth/signin');
        }
      }
    }, 15000);

    // Clear any existing redirect timeout
    if (redirectTimeoutRef.current) {
      addDebugInfo('Clearing existing redirect timeout');
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }

    // Only check auth after auth state has loaded and we haven't already tried to redirect
    if (!authLoading) {
      // Clear the max loading timeout since auth is done loading
      clearTimeout(maxLoadingTime);
      
      addDebugInfo(`Auth loaded, checking session (exists: ${!!session})`);
      
      // If no session, redirect to login immediately with direct navigation
      if (!session && !redirectAttempted.current) {
        redirectAttempted.current = true;
        addDebugInfo('No valid session, executing direct navigation to login...');
        
        try {
          // Store redirect attempt time
          localStorage.setItem('redirect_to_signin_at', Date.now().toString());
          
          // Use window.location.href for more reliable direct navigation in production
          window.location.href = '/auth/signin';
        } catch (err) {
          addDebugInfo(`Redirect error: ${err instanceof Error ? err.message : 'Unknown error'}`);
          // As a backup, try a forced reload to the signin page
          window.location.replace('/auth/signin');
        }
      } else if (session) {
        addDebugInfo('Valid session found, continuing to game initialization');
        // Clear any stored redirect intentions
        localStorage.removeItem('redirect_to_signin_at');
        localStorage.removeItem('auth_timeout');
      }
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
      
      // Set a timer to retry in 5 seconds
      const retryTimeoutId = setTimeout(() => {
        addDebugInfo('Attempting socket recovery after error');
        initializeSocket();
      }, 5000);
      
      // Store the timeout ID so we can clear it if needed
      socketRetryTimeoutRef.current = retryTimeoutId;
    }
  };

  // Initialize the socket - only run this if we have a valid session
  useEffect(() => {
    // Skip initialization if:
    // 1. We're still loading auth state
    // 2. We have no session (should redirect)
    if (authLoading) {
      addDebugInfo('Auth still loading, skipping socket initialization');
      return;
    }
    
    if (!session) {
      addDebugInfo('No session, skipping socket initialization');
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
    }

    // Initialize socket connection with a small delay
    const initializedTimer = setTimeout(() => {
      initializeSocket();
      
      // Set loading to false after a reasonable time even if connection hasn't completed
      setTimeout(() => {
        setIsLoading(false);
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
  }, [session, authLoading]);

  // View debug logs button
  const viewDebugLogs = () => {
    try {
      const logs = JSON.parse(localStorage.getItem('miniscape_debug_logs') || '[]');
      console.log('--- DEBUG LOGS ---');
      logs.forEach((log: any) => {
        console.log(`[${log.timestamp}][${log.page}] ${log.message}`, log.data || '');
      });
      console.log('--- END DEBUG LOGS ---');
      alert('Debug logs have been printed to the console');
    } catch (e) {
      console.error('Error displaying debug logs:', e);
    }
  };

  // Show loading state when checking auth or initializing game
  if (authLoading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        width: '100%', 
        height: '100%', 
        fontSize: '24px',
        fontWeight: 'bold',
        flexDirection: 'column'
      }}>
        <div>Checking login status...</div>
        
        {showDebugPanel && (
          <div style={{
            marginTop: '20px',
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#666',
            maxHeight: '50vh',
            overflowY: 'auto',
            padding: '10px',
            backgroundColor: '#f0f0f0',
            borderRadius: '4px',
            width: '80%',
            maxWidth: '800px'
          }}>
            <div><strong>Debug Info:</strong></div>
            {debugInfo.map((info, i) => (
              <div key={i}>{info}</div>
            ))}
            
            <button 
              onClick={viewDebugLogs}
              style={{
                marginTop: '10px',
                padding: '5px 10px',
                backgroundColor: '#333',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              View All Logs
            </button>
          </div>
        )}
        
        {/* Add the diagnostic button regardless of showDebugPanel */}
        <DynamicDebugButton />
        
        {/* Always show SessionStatus in compact mode */}
        <DynamicSessionStatus compact={true} />
      </div>
    );
  }

  // Don't render anything if we don't have a session
  if (!session) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        width: '100%', 
        height: '100%', 
        fontSize: '24px',
        fontWeight: 'bold',
        flexDirection: 'column'
      }}>
        <div>Redirecting to login...</div>
        
        {showDebugPanel && (
          <div style={{
            marginTop: '20px',
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#666',
            maxHeight: '50vh',
            overflowY: 'auto',
            padding: '10px',
            backgroundColor: '#f0f0f0',
            borderRadius: '4px',
            width: '80%',
            maxWidth: '800px'
          }}>
            <div><strong>Debug Info:</strong></div>
            {debugInfo.map((info, i) => (
              <div key={i}>{info}</div>
            ))}
            
            <button 
              onClick={() => {
                addDebugInfo('Force redirect to signin button clicked');
                // Use direct navigation for reliability
                window.location.href = '/auth/signin';
              }}
              style={{
                marginTop: '10px',
                padding: '5px 10px',
                backgroundColor: '#f44336', // More visible red color
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Force Redirect Now
            </button>
          </div>
        )}
        
        {/* Add the diagnostic button regardless of showDebugPanel */}
        <DynamicDebugButton />
        
        {/* Always show SessionStatus in compact mode */}
        <DynamicSessionStatus compact={true} />
      </div>
    );
  }

  return (
    <div style={{ width: '100%', height: '100%' }}>
      <Head>
        <title>MiniScape - Browser MMO</title>
        <meta name="description" content="A browser-based MMO inspired by RuneScape" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      <main style={{ width: '100%', height: '100%' }}>
        {isLoading ? (
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            width: '100%', 
            height: '100%', 
            fontSize: '24px',
            fontWeight: 'bold',
            flexDirection: 'column'
          }}>
            <div>Game is loading...</div>
            {socketError && (
              <div style={{
                color: 'red',
                fontSize: '16px',
                marginTop: '10px',
                maxWidth: '500px',
                textAlign: 'center'
              }}>
                Warning: {socketError}
                <div style={{ marginTop: '10px' }}>
                  Continuing anyway...
                </div>
              </div>
            )}
            
            {showDebugPanel && (
              <div style={{
                marginTop: '20px',
                fontSize: '12px',
                fontFamily: 'monospace',
                color: '#666',
                maxHeight: '50vh',
                overflowY: 'auto',
                padding: '10px',
                backgroundColor: '#f0f0f0',
                borderRadius: '4px',
                width: '80%',
                maxWidth: '800px'
              }}>
                <div><strong>Debug Info:</strong></div>
                {debugInfo.map((info, i) => (
                  <div key={i}>{info}</div>
                ))}
                
                <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                  <button 
                    onClick={() => {
                      addDebugInfo('Retry button clicked');
                      initAttempted.current = false;
                      setIsLoading(true);
                      window.location.reload();
                    }}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '#333',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Retry Connection
                  </button>
                  
                  <button 
                    onClick={() => {
                      addDebugInfo('Skip loading clicked');
                      setIsLoading(false);
                    }}
                    style={{
                      padding: '5px 10px',
                      backgroundColor: '#444',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer'
                    }}
                  >
                    Skip Loading
                  </button>
                </div>
              </div>
            )}
            
            {/* Add the diagnostic button */}
            <DynamicDebugButton />
            
            {/* Always show SessionStatus in compact mode during loading */}
            <DynamicSessionStatus compact={true} />
          </div>
        ) : (
          <>
            <DynamicGameCanvas />
            {showDebugPanel && (
              <div style={{
                position: 'fixed',
                bottom: '10px',
                right: '10px',
                zIndex: 1000
              }}>
                <button
                  onClick={() => {
                    const elem = document.getElementById('debug-panel');
                    if (elem) elem.style.display = elem.style.display === 'none' ? 'block' : 'none';
                  }}
                  style={{
                    padding: '5px 10px',
                    backgroundColor: 'rgba(0,0,0,0.5)',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Debug
                </button>
                <div 
                  id="debug-panel"
                  style={{
                    display: 'none',
                    marginTop: '10px',
                    fontSize: '12px',
                    fontFamily: 'monospace',
                    backgroundColor: 'rgba(0,0,0,0.7)',
                    color: '#fff',
                    padding: '10px',
                    borderRadius: '4px',
                    maxHeight: '300px',
                    overflowY: 'auto',
                    width: '300px'
                  }}
                >
                  <div><strong>Debug Info:</strong></div>
                  {debugInfo.map((info, i) => (
                    <div key={i} style={{fontSize: '10px'}}>{info}</div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Always show diagnostic button in game view */}
            <DynamicDebugButton />
            
            {/* Show SessionStatus in game view */}
            <DynamicSessionStatus compact={true} />
            
            {/* Add logs viewer component */}
            {showDebugPanel && <DynamicDebugViewLogs />}
          </>
        )}
      </main>
    </div>
  );
};

export default Home;