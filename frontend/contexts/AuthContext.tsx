import React, { createContext, useContext, useEffect, useState } from 'react';
import { authAPI } from '../lib/api';

// Define interfaces for user and profile
interface User {
  id: string;
  email: string;
  isGuest: boolean;
}

interface UserProfile {
  id: string;
  userId: string;
  username: string;
  avatarUrl?: string;
  level: number;
  experience: number;
  gold: number;
}

// Define the auth context state
interface AuthState {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signInWithGoogle: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  continueAsGuest: () => Promise<void>;
}

// Create the auth context
const AuthContext = createContext<AuthState | undefined>(undefined);

// Auth provider component
export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);

  // Initial auth state fetch
  useEffect(() => {
    async function fetchInitialSession() {
      try {
        setLoading(true);
        
        // Set a timeout for auth operations to prevent indefinite loading
        const authTimeout = setTimeout(() => {
          console.warn('Auth initialization timed out after 10 seconds');
          setLoading(false);
          // Clear auth state
          localStorage.removeItem('auth_token');
          localStorage.removeItem('refresh_token');
        }, 10000); // 10 second timeout
        
        // Check if we have a token
        if (authAPI.isAuthenticated()) {
          // Get current user data
          const userData = await authAPI.getCurrentUser();
          setUser(userData.user);
          setProfile(userData.profile);
        }
        
        // Clear the timeout since we got a response
        clearTimeout(authTimeout);
        
        // Log auth state for debugging
        console.log(`Auth initialized: user ${user ? 'exists' : 'does not exist'}`);
        
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
          localStorage.removeItem('auth_token');
          localStorage.removeItem('refresh_token');
          console.log('Cleared auth tokens due to initialization error');
        } catch (e) {
          console.error('Failed to clear auth tokens:', e);
        }
      }
    }
    
    fetchInitialSession();
    
    // Optional token refresh interval
    const refreshInterval = setInterval(async () => {
      try {
        if (authAPI.isAuthenticated()) {
          await authAPI.refreshToken();
        }
      } catch (error) {
        console.error('Token refresh error:', error);
      }
    }, 1000 * 60 * 15); // Refresh every 15 minutes
    
    // Clean up interval on unmount
    return () => {
      clearInterval(refreshInterval);
    };
  }, []);
  
  // Sign in with email and password
  const signIn = async (email: string, password: string) => {
    try {
      setLoading(true);
      const response = await authAPI.login(email, password);
      setUser(response.user);
      setProfile(response.profile);
    } catch (error) {
      console.error('Sign in error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };
  
  // Sign up with email and password
  const signUp = async (email: string, password: string) => {
    try {
      setLoading(true);
      const response = await authAPI.register(email, password);
      setUser(response.user);
      setProfile(response.profile);
    } catch (error) {
      console.error('Sign up error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };
  
  // Sign in with Google
  const signInWithGoogle = async () => {
    try {
      // Clear all auth-related storage
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      
      console.log('Starting Google auth flow');
      await authAPI.googleLogin();
      // Redirects to Google, so we won't get here until after the OAuth flow completes
    } catch (error) {
      console.error('Error signing in with Google:', error);
      setLoading(false);
    }
  };
  
  // Continue as guest
  const continueAsGuest = async () => {
    try {
      setLoading(true);
      
      // Check if we already have a guest session ID in localStorage
      const existingSessionId = localStorage.getItem('guest_session_id');
      if (existingSessionId) {
        console.log('Found existing guest session ID:', existingSessionId);
      }
      
      const response = await authAPI.continueAsGuest();
      
      console.log('Guest session created/restored:', response);
      
      // Make sure we have the session ID saved
      if (response.sessionId) {
        localStorage.setItem('guest_session_id', response.sessionId);
        console.log('Saved guest session ID from auth response:', response.sessionId);
      }
      
      setUser(response.user);
      setProfile(response.profile);
      
      return response;
    } catch (error) {
      console.error('Guest login error:', error);
      throw error;
    } finally {
      setLoading(false);
    }
  };
  
  // Sign out
  const signOut = async () => {
    try {
      setLoading(true);
      await authAPI.signOut();
      setUser(null);
      setProfile(null);
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        signInWithGoogle,
        signIn,
        signUp,
        signOut,
        continueAsGuest
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

// Custom hook to use auth
export const useAuth = () => {
  const context = useContext(AuthContext);
  
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  
  return context;
}; 