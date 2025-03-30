import supabase from '../config/supabase';

/**
 * Get the Supabase client instance
 */
export function getDatabase() {
  return supabase;
}

/**
 * No need to close connection with Supabase as it's managed by the client
 */
export function closeDatabase(): void {
  // No-op for Supabase
}

// No need for cleanup handlers with Supabase 