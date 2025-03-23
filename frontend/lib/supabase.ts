import { createClient } from '@supabase/supabase-js';

// These environment variables need to be set in .env.local
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

// Check if required environment variables are set
if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Missing Supabase environment variables. Please check your .env.local file.');
  // Only throw error on the server side to avoid client errors during development
  if (typeof window === 'undefined') {
    throw new Error(
      'Missing Supabase environment variables. Please check your .env.local file and ensure NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are set.'
    );
  }
}

// Create a single supabase client for the entire app
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    storage: typeof window !== 'undefined' ? window.localStorage : undefined,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    flowType: 'pkce',
    debug: process.env.NODE_ENV === 'development'
  },
  global: {
    fetch: (...args) => {
      // Add reliable timeout to fetch requests to prevent hanging
      return new Promise((resolve, reject) => {
        const timeoutId = setTimeout(() => {
          reject(new Error('Supabase request timeout'));
        }, 10000); // 10 second timeout
        
        fetch(...args)
          .then(response => {
            clearTimeout(timeoutId);
            resolve(response);
          })
          .catch(error => {
            clearTimeout(timeoutId);
            reject(error);
          });
      });
    }
  }
});

// Helper function to reset auth state and try again with implicit flow if PKCE fails
export const resetAuthAndSignIn = async () => {
  try {
    console.log('Resetting auth state before sign-in attempt');
    
    // First try to sign out to clear any stale state
    await supabase.auth.signOut();
    
    // Clear any storage that might be causing issues
    if (typeof window !== 'undefined') {
      // Remove all supabase auth-related items from localStorage
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('supabase.auth.')) {
          localStorage.removeItem(key);
        }
      });
      
      // Also clear sessionStorage items
      Object.keys(sessionStorage).forEach(key => {
        if (key.startsWith('supabase.auth.')) {
          sessionStorage.removeItem(key);
        }
      });
      
      // Remove any cookies related to auth
      document.cookie.split(';').forEach(c => {
        const cookie = c.trim();
        if (cookie.startsWith('sb-')) {
          const name = cookie.split('=')[0];
          document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;`;
        }
      });
      
      console.log('Auth storage cleared, redirecting to sign in');
    }
    
    // Add a timestamp to the redirect to prevent caching
    window.location.href = `/auth/signin?t=${Date.now()}`;
  } catch (error) {
    console.error('Error resetting auth state:', error);
    // Force a page reload as last resort
    window.location.reload();
  }
};

// Define the user profile type
export type UserProfile = {
  id: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  created_at: string;
  updated_at?: string;
  last_login?: string;
};

// Define the player data type
export type PlayerData = {
  id: string;
  user_id: string;
  x: number;
  y: number;
  z: number;
  level: number;
  experience: number;
  gold: number;
  inventory: any[];
  stats: Record<string, any>;
  created_at: string;
  updated_at?: string;
}; 