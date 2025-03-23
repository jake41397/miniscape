import React, { createContext, useContext, useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { UserProfile } from '../lib/supabase';

// Define the auth context state
interface AuthState {
  session: Session | null;
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signOut: () => Promise<void>;
}

// Create the auth context
const AuthContext = createContext<AuthState | undefined>(undefined);

// Auth provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Initial session and profile fetch
  useEffect(() => {
    async function fetchInitialSession() {
      try {
        setLoading(true);
        
        // Check for hostname override from previous reset
        const hostnameOverride = localStorage.getItem('oauth_hostname_override');
        if (hostnameOverride && hostnameOverride !== window.location.hostname) {
          console.log(`Hostname override detected: ${hostnameOverride} vs current: ${window.location.hostname}`);
          
          // If we're on localhost but override is set to production hostname
          if (window.location.hostname === 'localhost' && hostnameOverride !== 'localhost') {
            console.log('Detected development environment with production hostname override');
          }
          
          // If we have potential conflict, clear it
          if (hostnameOverride.includes('localhost') && !window.location.hostname.includes('localhost')) {
            console.log('Clearing localhost override in production environment');
            localStorage.removeItem('oauth_hostname_override');
          }
        }
        
        // Set a timeout for auth operations to prevent indefinite loading
        const authTimeout = setTimeout(() => {
          console.warn('Auth initialization timed out after 10 seconds');
          setLoading(false);
          // Clear any potentially corrupted auth state
          localStorage.removeItem('supabase.auth.token');
          sessionStorage.removeItem('supabase.auth.token');
        }, 10000); // 10 second timeout
        
        // Get active session
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        
        // Clear the timeout since we got a response
        clearTimeout(authTimeout);
        
        if (error) {
          console.error('Error fetching initial session:', error);
          throw error;
        }
        
        setSession(initialSession);
        
        if (initialSession?.user) {
          setUser(initialSession.user);
          await fetchUserProfile(initialSession.user.id);
        }
        
        // Log auth state for debugging
        console.log(`Auth initialized: session ${initialSession ? 'exists' : 'does not exist'}`);
        
        // Ensure loading state is set to false regardless of errors
        setLoading(false);
      } catch (error) {
        console.error('Error in auth initialization:', error);
        // Always set loading to false even on error
        setLoading(false);
        
        // Check for storage errors (can happen in incognito mode)
        if (error instanceof Error && error.message.includes('localStorage')) {
          console.warn('LocalStorage error detected, auth may not work properly in private browsing');
        }
        
        // Try to recover from potential token errors
        try {
          localStorage.removeItem('supabase.auth.token');
          sessionStorage.removeItem('supabase.auth.token');
          console.log('Cleared auth tokens due to initialization error');
        } catch (e) {
          console.error('Failed to clear auth tokens:', e);
        }
      }
    }
    
    fetchInitialSession();
    
    // Set up auth state change listener with the same error handling
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, currentSession) => {
        try {
          console.log(`Auth state changed: ${event}`);
          setSession(currentSession);
          setUser(currentSession?.user || null);
          
          if (currentSession?.user) {
            await fetchUserProfile(currentSession.user.id);
          } else {
            setProfile(null);
          }
        } catch (error) {
          console.error('Error in auth state change handler:', error);
        }
      }
    );
    
    // Clean up subscription on unmount
    return () => {
      subscription.unsubscribe();
    };
  }, []);
  
  // Fetch user profile from database
  async function fetchUserProfile(userId: string) {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', userId)
        .single();
      
      if (error) {
        throw error;
      }
      
      setProfile(data as UserProfile);
    } catch (error) {
      console.error('Error fetching user profile:', error);
      setProfile(null);
    }
  }
  
  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      // Clear all auth-related storage
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('supabase.auth.')) {
          localStorage.removeItem(key);
        }
      });
      
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('supabase.auth.')) {
          sessionStorage.removeItem(key);
        }
      });
      
      document.cookie.split(';').forEach(c => {
        const cookie = c.trim();
        if (cookie.startsWith('sb-')) {
          const name = cookie.split('=')[0];
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        }
      });
      
      console.log('Starting new auth flow, all storage cleared');
      
      // Determine the correct redirect URL based on the current hostname
      let redirectUrl: string;
      
      // Check if we're on localhost or the dev server
      const currentHostname = window.location.hostname;
      console.log(`Current hostname: ${currentHostname}`);
      
      if (currentHostname === 'localhost' || currentHostname === '127.0.0.1') {
        // For local development
        redirectUrl = `${window.location.origin}/auth/handle-callback`;
        console.log(`Using local redirect URL: ${redirectUrl}`);
      } else {
        // For production deployment
        redirectUrl = `https://${currentHostname}/auth/handle-callback`;
        console.log(`Using production redirect URL: ${redirectUrl}`);
      }
      
      // Add a timestamp to prevent caching issues
      redirectUrl = `${redirectUrl}?t=${Date.now()}`;
      
      // Simplify the call with the explicit redirect URL
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: false,
        }
      });
      
      if (error) {
        throw error;
      }
      
      console.log('Auth flow initiated successfully');
      
    } catch (error) {
      console.error('Error signing in with Google:', error);
      
      // If there's an error, try the alternative approach
      try {
        console.log('Trying alternative sign-in approach...');
        
        // Determine the fallback redirect URL
        const fallbackUrl = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? `${window.location.origin}/auth/signin`
          : `https://${window.location.hostname}/auth/signin`;
          
        const { error: fallbackError } = await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: fallbackUrl,
            skipBrowserRedirect: false
          }
        });
        
        if (fallbackError) {
          console.error('Alternative sign-in also failed:', fallbackError);
        }
      } catch (fallbackErr) {
        console.error('Alternative sign-in approach failed:', fallbackErr);
      }
    }
  };
  
  // Sign out
  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };
  
  // Value for the context provider
  const value: AuthState = {
    session,
    user,
    profile,
    loading,
    signInWithGoogle,
    signOut,
  };
  
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}; 