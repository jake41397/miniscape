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
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

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