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
        
        // Get active session
        const { data: { session: initialSession }, error } = await supabase.auth.getSession();
        
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
      // Clear any previous auth states that might be incomplete
      localStorage.removeItem('supabase.auth.code_verifier');
      localStorage.removeItem('supabase.auth.state');
      
      // Mark that we're starting auth flow
      sessionStorage.setItem('miniscape_auth_attempt', new Date().toISOString());
      
      // Use implicit flow for more reliable auth
      const response = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/handle-callback`,
          skipBrowserRedirect: false,
          // Set additional scopes and parameters for better reliability
          scopes: 'email profile',
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          }
        },
      });
      
      if (response.error) {
        throw response.error;
      }
      
      console.log('Auth flow started successfully');
    } catch (error) {
      console.error('Error signing in with Google:', error);
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