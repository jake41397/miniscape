import React, { useEffect, useState } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import { supabase, resetAuthAndSignIn } from '../../lib/supabase';
import Head from 'next/head';
import Link from 'next/link';
import { addAuthFailureHandler, enableTestMode, isDevelopmentEnvironment } from '../../utils/auth-helpers';

const HandleCallback: NextPage = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  // Add state for client-side only values
  const [clientInfo, setClientInfo] = useState({
    origin: '',
    hostname: '',
    protocol: '',
    url: '',
    pathname: ''
  });
  const [isClient, setIsClient] = useState(false);
  
  // Debug logger
  const addDebugInfo = (info: string) => {
    console.log(`[AUTH CALLBACK] ${info}`);
    setDebugInfo(prev => [...prev, info]);
  };
  
  // First useEffect - just to set client state
  useEffect(() => {
    setIsClient(true);
    setClientInfo({
      origin: window.location.origin,
      hostname: window.location.hostname,
      protocol: window.location.protocol,
      url: window.location.href,
      pathname: window.location.pathname
    });
    addDebugInfo('Client-side rendering initialized');
  }, []);
  
  // Second useEffect - handle the authentication flow only after client-side is ready
  useEffect(() => {
    // Only proceed if we're on the client AND the router is ready
    if (!isClient || !router.isReady) {
      return;
    }
    
    // Add debug information about the current URL and redirect
    addDebugInfo(`Current URL: ${clientInfo.url}`);
    addDebugInfo(`Current hostname: ${clientInfo.hostname}`);
    
    // Check if there's a localhost reference in the URL
    if (clientInfo.url.includes('localhost:3000')) {
      addDebugInfo('⚠️ Detected localhost in URL. This might cause authentication issues.');
    }
    
    // Set a timeout
    const timeoutId = setTimeout(() => {
      addDebugInfo('Callback handling timed out after 30 seconds');
      setError('Authentication timed out. Please try again.');
      setProcessing(false);
    }, 30000);
    
    // Simplified auth handling
    const handleAuth = async () => {
      try {
        addDebugInfo('Starting auth handling process');
        
        // Check for errors in URL params first
        if (router.query.error) {
          addDebugInfo(`Auth error from query: ${router.query.error}`);
          throw new Error(String(router.query.error));
        }
        
        // Log relevant query parameters for debugging
        if (router.query.code) {
          addDebugInfo(`Auth code present: ${String(router.query.code).substring(0, 10)}...`);
        }
        
        if (router.query.state) {
          addDebugInfo(`Auth state present: ${String(router.query.state).substring(0, 10)}...`);
        }
        
        // Get the session directly from Supabase - should work with PKCE flow
        addDebugInfo('Attempting to get session from Supabase');
        console.log('SUPABASE AUTH: Starting getSession call');
        const startTime = Date.now();
        
        // Set a more aggressive timeout just for this API call
        const sessionPromise = supabase.auth.getSession();
        const sessionTimeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Supabase getSession timed out after 10 seconds')), 10000);
        });
        
        try {
          // Race the session promise against a timeout
          const { data, error } = await Promise.race([sessionPromise, sessionTimeoutPromise]) as any;
          const endTime = Date.now();
          console.log(`SUPABASE AUTH: getSession completed in ${endTime - startTime}ms`);
          
          if (error) {
            addDebugInfo(`Error getting session: ${error.message}`);
            console.error('SUPABASE AUTH ERROR:', error);
            throw error;
          }
          
          if (data?.session) {
            clearTimeout(timeoutId);
            addDebugInfo(`Session found for user: ${data.session.user.email}`);
            console.log('SUPABASE AUTH: Session successfully obtained');
            
            // Setup user profile
            await setupUserProfile(data.session.user.id);
            
            // Redirect to home page using the correct hostname
            const homeUrl = clientInfo.hostname === 'localhost' || clientInfo.hostname === '127.0.0.1'
              ? `${clientInfo.origin}/`
              : `https://${clientInfo.hostname}/`;
              
            addDebugInfo(`Redirecting to home page: ${homeUrl}`);
            window.location.href = homeUrl;
            return;
          } else {
            addDebugInfo('No session found from getSession() call');
            console.log('SUPABASE AUTH: No session returned from getSession()');
          }
        } catch (sessionError) {
          // If the session call times out or fails, log it and continue to code exchange
          addDebugInfo(`Session retrieval issue: ${sessionError instanceof Error ? sessionError.message : 'Unknown error'}`);
          console.warn('SUPABASE AUTH: Session retrieval failed, continuing to code exchange', sessionError);
        }
        
        // If we don't have a session, we need to handle code or implicit flow
        const code = router.query.code;
        const fragment = window.location.hash;
        
        if (code) {
          addDebugInfo(`Processing code parameter: ${String(code).substring(0, 10)}...`);
          
          try {
            // Exchange code for session with a timeout
            addDebugInfo('Attempting to exchange code for session');
            console.log('SUPABASE AUTH: Starting exchangeCodeForSession call');
            const exchangeStartTime = Date.now();
            
            // Set a promise with timeout for code exchange
            const exchangePromise = supabase.auth.exchangeCodeForSession(String(code));
            const exchangeTimeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Code exchange timed out after 15 seconds')), 15000);
            });
            
            // Race the exchange against a timeout
            const { data: exchangeData, error: exchangeError } = await Promise.race([
              exchangePromise, 
              exchangeTimeoutPromise
            ]) as any;
            
            const exchangeEndTime = Date.now();
            console.log(`SUPABASE AUTH: exchangeCodeForSession completed in ${exchangeEndTime - exchangeStartTime}ms`);
            
            if (exchangeError) {
              addDebugInfo(`Code exchange error: ${exchangeError.message}`);
              console.error('SUPABASE AUTH EXCHANGE ERROR:', exchangeError);
              throw exchangeError;
            }
            
            if (exchangeData?.session) {
              clearTimeout(timeoutId);
              addDebugInfo(`Session established for user: ${exchangeData.session.user.email}`);
              
              // Setup user profile
              await setupUserProfile(exchangeData.session.user.id);
              
              // Redirect to home page with correct hostname
              const homeUrl = clientInfo.hostname === 'localhost' || clientInfo.hostname === '127.0.0.1'
                ? `${clientInfo.origin}/`
                : `https://${clientInfo.hostname}/`;
                
              addDebugInfo(`Redirecting to home page after code exchange: ${homeUrl}`);
              window.location.href = homeUrl;
              return;
            } else {
              addDebugInfo('No session established after code exchange');
            }
          } catch (codeError) {
            addDebugInfo(`Code processing error: ${codeError instanceof Error ? codeError.message : 'Unknown error'}`);
            
            // If we time out on both methods, try a server-side diagnostic
            try {
              addDebugInfo('Running server-side diagnostics after auth failure');
              const diagnosticStartTime = Date.now();
              const diagnosticResponse = await fetch('/api/supabase-debug');
              const diagnosticData = await diagnosticResponse.json();
              const diagnosticEndTime = Date.now();
              
              addDebugInfo(`Diagnostic completed in ${diagnosticEndTime - diagnosticStartTime}ms`);
              console.log('SUPABASE DIAGNOSTICS:', diagnosticData);
              
              // If we got useful diagnostic info, display it
              if (diagnosticData.tests?.oauthUrl?.url) {
                addDebugInfo(`OAuth URL from diagnostics: ${new URL(diagnosticData.tests.oauthUrl.url).origin}`);
              }
              
              // Log connection status
              if (diagnosticData.tests?.connection) {
                addDebugInfo(`Database connection: ${diagnosticData.tests.connection.success ? 'OK' : 'Failed'}`);
              }
            } catch (diagError) {
              addDebugInfo(`Diagnostic error: ${diagError instanceof Error ? diagError.message : 'Unknown error'}`);
            }
          }
        } else if (fragment && fragment.includes('access_token')) {
          addDebugInfo('Found access token in URL fragment');
          
          // We can force a refresh to process the hash
          addDebugInfo('Refreshing page to process hash fragment');
          window.location.href = clientInfo.pathname;
          return;
        }
        
        // If we get here, we've tried everything and still don't have a session
        clearTimeout(timeoutId);
        addDebugInfo('All auth methods failed');
        
        // In development environments, offer test mode
        if (isDevelopmentEnvironment()) {
          addDebugInfo('Development environment detected, offering test mode option');
          // Show the auth failure handler
          addAuthFailureHandler();
        }
        
        setError('Unable to complete authentication. Please try signing in again.');
        setProcessing(false);
        
      } catch (error) {
        clearTimeout(timeoutId);
        const errorMsg = error instanceof Error ? error.message : 'Unknown authentication error';
        addDebugInfo(`Auth error: ${errorMsg}`);
        setError(errorMsg);
        setProcessing(false);
      }
    };
    
    // Start the auth handling process
    handleAuth();
    
    return () => clearTimeout(timeoutId);
  }, [isClient, router.isReady, router.query, clientInfo]); // All necessary dependencies
  
  // Setup user profile
  async function setupUserProfile(userId: string) {
    try {
      addDebugInfo(`Setting up user profile for ${userId}`);
      
      // Check if profile exists
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      // If there's an error other than "not found", throw it
      if (profileError && profileError.code !== 'PGRST116') {
        addDebugInfo(`Profile error: ${profileError.message}`);
        throw profileError;
      }
      
      // If no profile exists, create one
      if (!profile) {
        addDebugInfo('No profile found, creating new profile');
        
        // Get user details
        const { data: userData } = await supabase.auth.getUser();
        const email = userData?.user?.email || '';
        const username = email.split('@')[0] + Math.floor(Math.random() * 1000);
        
        addDebugInfo(`Creating profile with username: ${username}`);
        
        // Create profile
        const { error: insertError } = await supabase
          .from('profiles')
          .insert({
            user_id: userId,
            username: username,
            avatar_url: userData?.user?.user_metadata?.avatar_url || null,
            last_login: new Date().toISOString()
          });
        
        if (insertError) {
          addDebugInfo(`Error creating profile: ${insertError.message}`);
          throw insertError;
        }
        
        addDebugInfo('Creating initial player data');
        
        // Create initial player data
        const { error: playerDataError } = await supabase
          .from('player_data')
          .insert({
            user_id: userId,
            x: 0,
            y: 1,
            z: 0,
            inventory: [],
            stats: {}
          });
        
        if (playerDataError) {
          addDebugInfo(`Error creating player data: ${playerDataError.message}`);
          throw playerDataError;
        }
        
        addDebugInfo('User setup completed successfully');
      } else {
        addDebugInfo('Existing profile found, updating last login time');
        
        // Update last login time
        await supabase
          .from('profiles')
          .update({ last_login: new Date().toISOString() })
          .eq('user_id', userId);
      }
    } catch (error) {
      console.error('Error setting up user profile:', error);
      addDebugInfo(`Profile setup error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      throw error;
    }
  }
  
  // Function to try a direct sign in if PKCE flow is failing
  const handleDirectSignIn = async () => {
    try {
      setProcessing(true);
      addDebugInfo('Attempting to reset auth state and redirect');
      
      // Use our helper function to reset auth state and redirect
      await resetAuthAndSignIn();
    } catch (error) {
      console.error('Error with direct sign in:', error);
      setError(error instanceof Error ? error.message : 'Sign in failed');
      setProcessing(false);
    }
  };
  
  // Add a useEffect to show the auth failure handler after a timeout
  useEffect(() => {
    if (error && isDevelopmentEnvironment()) {
      // Show the auth failure handler to help with development
      addAuthFailureHandler();
    }
  }, [error]);
  
  return (
    <div style={{ 
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      alignItems: 'center',
      minHeight: '100vh',
      padding: '1rem',
      backgroundColor: '#14181d',
      color: 'white',
      fontFamily: 'sans-serif'
    }}>
      <Head>
        <title>{error ? 'Authentication Error' : 'Completing Authentication...'}</title>
      </Head>
      
      <div style={{
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        padding: '2rem',
        maxWidth: '600px',
        width: '100%',
        textAlign: 'center',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)'
      }}>
        <h1 style={{ marginBottom: '1rem' }}>
          {processing ? 'Processing Authentication...' : (error ? 'Authentication Error' : 'Redirecting...')}
        </h1>
        
        {processing && (
          <>
            <p>Please wait while we complete the authentication process...</p>
            <div style={{ margin: '2rem 0', textAlign: 'center' }}>
              <div style={{ 
                display: 'inline-block',
                width: '30px',
                height: '30px',
                border: '3px solid rgba(255, 255, 255, 0.3)',
                borderRadius: '50%',
                borderTopColor: 'white',
                animation: 'spin 1s linear infinite'
              }} />
              <style jsx>{`
                @keyframes spin {
                  to { transform: rotate(360deg); }
                }
              `}</style>
            </div>
            <div style={{ marginTop: '1.5rem' }}>
              <button
                onClick={() => {
                  const homeUrl = clientInfo.hostname === 'localhost' || clientInfo.hostname === '127.0.0.1'
                    ? `${clientInfo.origin}/`
                    : `https://${clientInfo.hostname}/`;
                  
                  addDebugInfo(`Manual skip to home: ${homeUrl}`);
                  window.location.href = homeUrl;
                }}
                style={{
                  backgroundColor: 'transparent',
                  color: 'rgba(255, 255, 255, 0.7)',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  padding: '0.5rem 1rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontSize: '0.9rem',
                  marginTop: '1rem'
                }}
              >
                Skip to Home Page
              </button>
              <p style={{ fontSize: '0.8rem', color: 'rgba(255, 255, 255, 0.5)', marginTop: '0.5rem' }}>
                (If you've already signed in successfully but the redirect isn't working)
              </p>
            </div>
          </>
        )}
        
        {error && (
          <>
            <p style={{ color: '#e57373', marginBottom: '1rem' }}>{error}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', alignItems: 'center' }}>
              <button 
                onClick={handleDirectSignIn}
                style={{
                  backgroundColor: '#4285F4',
                  color: 'white',
                  border: 'none',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  width: '100%',
                  maxWidth: '300px'
                }}
              >
                Try Direct Sign-in
              </button>
              <button 
                onClick={() => {
                  window.location.href = '/auth/signin';
                }}
                style={{
                  backgroundColor: 'transparent',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  padding: '0.75rem 1.5rem',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  width: '100%',
                  maxWidth: '300px'
                }}
              >
                Return to Sign In
              </button>
            </div>
            
            <div style={{ 
              marginTop: '20px', 
              backgroundColor: 'rgba(229, 115, 115, 0.1)', 
              padding: '10px', 
              borderRadius: '4px',
              fontSize: '0.8rem',
              textAlign: 'left' 
            }}>
              <h4 style={{ marginTop: 0 }}>Troubleshooting Tips:</h4>
              <ul style={{ paddingLeft: '20px', margin: '10px 0' }}>
                <li>Check that cookies are enabled in your browser</li>
                <li>Try using incognito/private browsing mode</li>
                <li>Verify that popup blockers are disabled</li>
                <li>If you're on a corporate or school network, check firewall settings</li>
                <li>Try the "Direct Sign-in" button which uses an alternative auth method</li>
              </ul>
              <p style={{ marginBottom: 0 }}>
                If problems persist, please contact support and include the authentication code: 
                <code style={{ backgroundColor: 'rgba(0,0,0,0.2)', padding: '2px 4px', borderRadius: '2px', marginLeft: '4px' }}>
                  {router.query.code ? String(router.query.code).substring(0, 10) + '...' : 'None'}
                </code>
              </p>
            </div>
          </>
        )}
        
        {/* Enhanced debug information for troubleshooting */}
        <div style={{
          marginTop: '2rem',
          padding: '1rem',
          backgroundColor: 'rgba(0, 0, 0, 0.2)',
          borderRadius: '4px',
          textAlign: 'left',
          fontSize: '0.8rem'
        }}>
          <h3>Debug Information</h3>
          <div>
            {debugInfo.map((info, i) => (
              <div key={i}>{info}</div>
            ))}
            <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '0.5rem' }}>
              <strong>Auth URL Info:</strong>
              <div>Code: {router.query.code ? String(router.query.code).substring(0, 10) + '...' : 'None'}</div>
              <div>State: {router.query.state ? String(router.query.state).substring(0, 10) + '...' : 'None'}</div>
              <div>Error: {router.query.error || 'None'}</div>
              <div>Error Description: {router.query.error_description || 'None'}</div>
              <div>Time Param: {router.query.t || 'None'}</div>
            </div>
            <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '0.5rem' }}>
              <strong>Environment Info:</strong>
              {isClient ? (
                <>
                  <div>URL Origin: {clientInfo.origin}</div>
                  <div>Hostname: {clientInfo.hostname}</div>
                  <div>Protocol: {clientInfo.protocol}</div>
                </>
              ) : (
                <>
                  <div>URL Origin: Loading...</div>
                  <div>Hostname: Loading...</div>
                  <div>Protocol: Loading...</div>
                </>
              )}
              <div>Supabase URL: {process.env.NEXT_PUBLIC_SUPABASE_URL || 'Not defined'}</div>
              <div>Supabase ANON Key: {process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Defined' : 'Not defined'}</div>
            </div>
            
            <div style={{ marginTop: '1rem', borderTop: '1px solid rgba(255, 255, 255, 0.1)', paddingTop: '0.5rem' }}>
              <strong>Tools:</strong>
              <button 
                onClick={() => {
                  window.open('/api/supabase-debug', '_blank');
                }}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#0F766E',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '0.8rem',
                  marginTop: '0.5rem',
                  cursor: 'pointer'
                }}
              >
                Run Supabase Diagnostics
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HandleCallback; 