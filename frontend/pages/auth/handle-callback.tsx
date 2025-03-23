import React, { useEffect, useState } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import { supabase, resetAuthAndSignIn } from '../../lib/supabase';
import Head from 'next/head';
import Link from 'next/link';

const HandleCallback: NextPage = () => {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState(true);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  
  // Debug logger
  const addDebugInfo = (info: string) => {
    console.log(`[AUTH CALLBACK] ${info}`);
    setDebugInfo(prev => [...prev, info]);
  };
  
  useEffect(() => {
    // Only run once the router is ready and we have query params
    if (!router.isReady) return;
    
    // Get hash and query parameters
    const { code, error: queryError, access_token, provider_token } = router.query;
    const hashParams = new URLSearchParams(window.location.hash.substring(1));
    const hashAccessToken = hashParams.get('access_token');
    
    // Log what we received for debugging
    addDebugInfo(`Received callback with: ${JSON.stringify({
      code: code ? `${String(code).substring(0, 10)}...` : null,
      access_token: access_token ? 'present' : null,
      hash_access_token: hashAccessToken ? 'present' : null,
      error: queryError || null
    })}`);
    
    // Handle errors passed from provider
    if (queryError) {
      addDebugInfo(`Auth error from provider: ${queryError}`);
      setError(`Authentication error: ${queryError}`);
      setProcessing(false);
      return;
    }
    
    const handleAuth = async () => {
      try {
        addDebugInfo('Starting auth handling process');
        
        // Check if we already have a session from the redirect
        const { data: { session: existingSession } } = await supabase.auth.getSession();
        
        if (existingSession) {
          addDebugInfo(`Found existing session for user: ${existingSession.user.email}`);
          
          // Setup user profile
          await setupUserProfile(existingSession.user.id);
          
          // Redirect to home page
          addDebugInfo('Redirecting to home page with existing session');
          router.push('/');
          return;
        }
        
        // For implicit flow, we should have an access token in the URL hash
        if (hashAccessToken) {
          addDebugInfo('Found access token in URL hash (implicit flow)');
          
          // The supabase client should automatically process this because detectSessionInUrl is true
          // Let's verify that it worked by getting the session
          const { data: { session } } = await supabase.auth.getSession();
          
          if (session) {
            addDebugInfo(`Session established from URL hash for user: ${session.user.email}`);
            
            // Setup user profile
            await setupUserProfile(session.user.id);
            
            // Redirect to home page
            addDebugInfo('Redirecting to home page');
            router.push('/');
            return;
          } else {
            addDebugInfo('No session established from URL hash');
          }
        }
        
        // If we have a code but no session yet, try exchanging it directly
        if (code) {
          addDebugInfo(`Processing auth code: ${code}`);
          
          try {
            // Try to exchange code for session
            const { data, error: sessionError } = await supabase.auth.exchangeCodeForSession(String(code));
            
            if (sessionError) {
              addDebugInfo(`Session exchange error: ${sessionError.message}`);
              throw sessionError;
            }
            
            if (data.session && data.user) {
              addDebugInfo(`Successfully exchanged code for session: ${data.user.email}`);
              
              // Setup user profile
              await setupUserProfile(data.user.id);
              
              // Redirect to home page
              addDebugInfo('Redirecting to home page');
              router.push('/');
              return;
            }
          } catch (codeExchangeError) {
            addDebugInfo(`Code exchange failed: ${codeExchangeError instanceof Error ? codeExchangeError.message : 'Unknown error'}`);
          }
        }
        
        // If we got here, we weren't able to establish a session
        addDebugInfo('Failed to establish a session from callback parameters');
        setError('Authentication session was lost. Please try signing in again.');
        setProcessing(false);
      } catch (error) {
        console.error('Error in auth handling:', error);
        const errorMessage = error instanceof Error ? error.message : 'Authentication failed';
        addDebugInfo(`Error: ${errorMessage}`);
        setError(errorMessage);
        setProcessing(false);
      }
    };
    
    handleAuth();
  }, [router.isReady, router.query]);
  
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
  
  return (
    <div style={{ 
      width: '100%', 
      height: '100vh', 
      display: 'flex', 
      flexDirection: 'column',
      justifyContent: 'center', 
      alignItems: 'center',
      background: 'linear-gradient(to bottom, #1a1a2e, #16213e)'
    }}>
      <Head>
        <title>{error ? 'Authentication Error' : 'Completing Authentication...'}</title>
      </Head>
      
      <div style={{
        padding: '2rem',
        backgroundColor: 'rgba(255, 255, 255, 0.1)',
        borderRadius: '8px',
        backdropFilter: 'blur(10px)',
        boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
        textAlign: 'center',
        width: '90%',
        maxWidth: '400px'
      }}>
        {processing ? (
          <>
            <h1 style={{ 
              marginBottom: '1rem',
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: 'white'
            }}>
              Completing Sign In
            </h1>
            
            <p style={{ 
              marginBottom: '2rem',
              color: 'rgba(255, 255, 255, 0.8)', 
              fontSize: '1rem' 
            }}>
              Please wait while we complete the authentication process...
            </p>
            
            <div 
              style={{ 
                width: '30px', 
                height: '30px', 
                border: '3px solid rgba(255, 255, 255, 0.3)', 
                borderTop: '3px solid #ffffff', 
                borderRadius: '50%',
                margin: '0 auto',
                animation: 'spin 1s linear infinite'
              }} 
            />
            
            <style jsx>{`
              @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
              }
            `}</style>
          </>
        ) : (
          <>
            <h1 style={{ 
              marginBottom: '1rem',
              fontSize: '1.5rem',
              fontWeight: 'bold',
              color: '#ff6b6b'
            }}>
              Authentication Error
            </h1>
            
            <p style={{ 
              marginBottom: '2rem',
              color: 'rgba(255, 255, 255, 0.8)', 
              fontSize: '1rem' 
            }}>
              {error || 'There was a problem completing the authentication. Please try again.'}
            </p>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                onClick={handleDirectSignIn}
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: '#4285F4',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  width: '100%'
                }}
              >
                Try Again
              </button>
              
              <Link 
                href="/auth/signin"
                style={{
                  padding: '0.75rem 1.5rem',
                  backgroundColor: 'transparent',
                  color: 'white',
                  border: '1px solid rgba(255, 255, 255, 0.3)',
                  borderRadius: '4px',
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  cursor: 'pointer',
                  width: '100%',
                  textDecoration: 'none',
                  textAlign: 'center',
                  boxSizing: 'border-box'
                }}
              >
                Back to Sign In
              </Link>
            </div>
            
            {/* Debug information */}
            <div style={{
              marginTop: '20px',
              padding: '10px',
              backgroundColor: 'rgba(0, 0, 0, 0.2)',
              borderRadius: '4px',
              color: 'rgba(255, 255, 255, 0.7)',
              fontSize: '12px',
              fontFamily: 'monospace',
              textAlign: 'left',
              maxHeight: '200px',
              overflowY: 'auto'
            }}>
              <strong>Debug Info:</strong>
              {debugInfo.map((info, i) => (
                <div key={i} style={{ marginTop: '5px' }}>{info}</div>
              ))}
              
              <div style={{ marginTop: '10px' }}>
                <strong>Auth URL Info:</strong>
                <div>Code: {router.query.code?.toString().substring(0, 10)}...</div>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default HandleCallback; 