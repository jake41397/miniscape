import React, { useEffect, useState } from 'react';
import { NextPage } from 'next';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Head from 'next/head';
import dynamic from 'next/dynamic';
import { supabase } from '../../lib/supabase';

// Dynamically import the debug button to prevent SSR issues
const DynamicDebugButton = dynamic(() => import('../../components/DebugButton'), {
  ssr: false
});

// Dynamically import the SessionStatus component
const DynamicSessionStatus = dynamic(() => import('../../components/SessionStatus'), {
  ssr: false
});

// Debug logger
const debugLog = (message: string, data?: any) => {
  const timestamp = new Date().toISOString();
  console.log(`[DEBUG][${timestamp}][SignIn] ${message}`, data || '');
  
  // Store debug logs in localStorage for persistence across refreshes
  try {
    const logs = JSON.parse(localStorage.getItem('miniscape_debug_logs') || '[]');
    logs.push({ timestamp, page: 'signin', message, data: data ? JSON.stringify(data) : undefined });
    // Keep only the most recent 100 logs
    if (logs.length > 100) logs.shift();
    localStorage.setItem('miniscape_debug_logs', JSON.stringify(logs));
  } catch (e) {
    console.error('Error storing debug logs:', e);
  }
};

const SignIn: NextPage = () => {
  const { signInWithGoogle, session, loading } = useAuth();
  const router = useRouter();
  const [redirecting, setRedirecting] = useState(false);
  const [debugInfo, setDebugInfo] = useState<string[]>([]);
  const [redirectStart, setRedirectStart] = useState<number | null>(null);
  
  // Add debug info handler
  const addDebugInfo = (info: string) => {
    debugLog(info);
    setDebugInfo(prev => [...prev, `${new Date().toISOString().substr(11, 8)} - ${info}`]);
  };
  
  // Log component mounting
  useEffect(() => {
    addDebugInfo('SignIn component mounted');
    
    // Log auth state
    addDebugInfo(`Initial auth state: session=${!!session}, loading=${loading}`);
    
    // Return cleanup
    return () => {
      addDebugInfo('SignIn component unmounting');
    };
  }, []);
  
  // Clean the URL hash if present - this can cause redirect issues
  useEffect(() => {
    if (window.location.hash) {
      addDebugInfo(`Cleaning URL hash: ${window.location.hash}`);
      // Remove the hash from the URL without reloading the page
      history.replaceState(null, '', window.location.pathname);
      addDebugInfo('URL hash removed');
    }
  }, []);
  
  // Monitor auth state changes
  useEffect(() => {
    addDebugInfo(`Auth state changed: session=${!!session}, loading=${loading}`);
  }, [session, loading]);
  
  // Redirect to home if already authenticated, but with a delay to prevent flickering
  useEffect(() => {
    // Only attempt redirect if not already redirecting and auth is done loading
    if (session && !redirecting && !loading) {
      addDebugInfo('Session detected but not redirecting - triggering redirect state');
      setRedirecting(true);
      setRedirectStart(Date.now());
      
      // Force a direct navigation instead of router.push
      addDebugInfo('Forcing direct navigation to home page');
      
      // Set a small timeout to ensure UI updates before redirect
      setTimeout(() => {
        addDebugInfo('Executing direct navigation to home page');
        window.location.href = '/';
      }, 500);
    }
  }, [session, router, redirecting, loading]);
  
  // Show debug button when in dev or if query param is present
  const showDebug = process.env.NODE_ENV === 'development' || router.query.debug === 'true';
  
  // Don't render anything while redirecting to prevent flashing content
  if (redirecting) {
    const elapsedTime = redirectStart ? Math.floor((Date.now() - redirectStart) / 1000) : 0;
    
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        width: '100%', 
        height: '100vh', 
        fontSize: '18px',
        fontWeight: 'bold',
        flexDirection: 'column'
      }}>
        <div>Redirecting to game... ({elapsedTime}s)</div>
        
        {showDebug && (
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
                addDebugInfo('Force redirect button clicked');
                // Direct navigation is more reliable
                window.location.href = '/';
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
        
        {/* Add the diagnostics button */}
        {showDebug && <DynamicDebugButton />}
        
        {/* Show session status */}
        <DynamicSessionStatus compact={true} />
      </div>
    );
  }
  
  // Show loading state when checking auth state
  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        width: '100%', 
        height: '100vh', 
        fontSize: '18px',
        fontWeight: 'bold',
        flexDirection: 'column'
      }}>
        <div>Checking authentication...</div>
        
        {showDebug && (
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
          </div>
        )}
        
        {/* Add the diagnostics button */}
        {showDebug && <DynamicDebugButton />}
        
        {/* Show session status */}
        <DynamicSessionStatus compact={true} />
      </div>
    );
  }
  
  // If we have a session but we're not redirecting yet, trigger redirecting state
  if (session && !redirecting) {
    // This is a safety check to make sure we always enter redirecting state
    addDebugInfo('Session detected but not redirecting - triggering redirect state');
    setRedirecting(true);
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        width: '100%', 
        height: '100vh', 
        fontSize: '18px',
        fontWeight: 'bold' 
      }}>
        Preparing game...
      </div>
    );
  }
  
  // Add this useEffect to the SignIn component:

  useEffect(() => {
    // Check for a stuck state and force a clean auth state if needed
    const checkStuckState = async () => {
      try {
        // Check if we've been redirected from a failed home page load
        const redirectTime = localStorage.getItem('redirect_to_signin_at');
        if (redirectTime) {
          const redirectTimestamp = parseInt(redirectTime, 10);
          const timeSinceRedirect = Date.now() - redirectTimestamp;
          
          // If we've been on this page for a while after a redirect, try to force a clean state
          if (timeSinceRedirect > 5000 && !loading && !session) {
            addDebugInfo(`Potential stuck state detected, clearing auth state (${Math.round(timeSinceRedirect / 1000)}s since redirect)`);
            
            // Clear Supabase auth storage
            localStorage.removeItem('supabase.auth.token');
            sessionStorage.removeItem('supabase.auth.token');
            
            // Make a server-side diagnostic request
            const res = await fetch('/api/auth-debug');
            if (res.ok) {
              const data = await res.json();
              addDebugInfo(`Auth debug response: ${JSON.stringify(data)}`);
            }
          }
        }
      } catch (e) {
        console.error('Error in stuck state check:', e);
      }
    };
    
    checkStuckState();
    
    // Also set a repeated check
    const intervalId = setInterval(checkStuckState, 5000);
    return () => clearInterval(intervalId);
  }, [loading, session]);
  
  // Normal sign-in page
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
        <title>Sign In - MiniScape</title>
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
        <h1 style={{ 
          marginBottom: '2rem',
          fontSize: '2rem',
          fontWeight: 'bold',
          color: 'white'
        }}>
          Welcome to MiniScape
        </h1>
        
        <p style={{ 
          marginBottom: '2rem',
          color: 'rgba(255, 255, 255, 0.8)', 
          fontSize: '1rem' 
        }}>
          A multiplayer browser-based RPG inspired by RuneScape
        </p>
        
        <button 
          onClick={() => {
            addDebugInfo('Sign in button clicked');
            // Add a timestamp to track the sign-in attempt
            localStorage.setItem('auth_attempt_time', new Date().toISOString());
            // Clear any existing error states
            localStorage.removeItem('auth_error');
            // Use our signInWithGoogle method
            signInWithGoogle()
              .catch(error => {
                addDebugInfo(`Sign in error: ${error.message}`);
                localStorage.setItem('auth_error', JSON.stringify({
                  message: error.message,
                  time: new Date().toISOString()
                }));
              });
          }}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '0.75rem 1.5rem',
            backgroundColor: '#4285F4',
            color: 'white',
            border: 'none',
            borderRadius: '4px',
            fontSize: '1rem',
            fontWeight: 'bold',
            cursor: 'pointer',
            width: '100%',
            marginBottom: '1rem'
          }}
        >
          <span style={{ marginRight: '0.5rem' }}>
            G
          </span>
          Sign in with Google
        </button>
        
        {/* debug info display */}
        {showDebug && (
          <div style={{
            marginTop: '20px',
            fontSize: '12px',
            fontFamily: 'monospace',
            color: '#666',
            maxHeight: '200px',
            overflowY: 'auto',
            padding: '10px',
            backgroundColor: 'rgba(255, 255, 255, 0.2)',
            borderRadius: '4px',
            textAlign: 'left'
          }}>
            <div><strong>Debug Info:</strong></div>
            {debugInfo.map((info, i) => (
              <div key={i}>{info}</div>
            ))}
          </div>
        )}
        
        <p style={{ 
          fontSize: '0.8rem',
          color: 'rgba(255, 255, 255, 0.6)',
          marginTop: '1rem'
        }}>
          By signing in, you agree to our Terms of Service and Privacy Policy.
        </p>
      </div>
      
      {/* Add the diagnostics button */}
      {showDebug && <DynamicDebugButton />}
      
      {/* Show session status */}
      <DynamicSessionStatus compact={true} />
    </div>
  );
};

export default SignIn; 