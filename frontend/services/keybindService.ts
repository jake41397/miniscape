import { createClient } from '@supabase/supabase-js';
import { KeybindAction, Keybind, DEFAULT_KEYBINDS } from '../game/controls/keybinds';

// Initialize Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Type for keybinds record
type PlayerKeybindsRecord = {
  id: string;
  user_id: string;
  keybinds: Record<KeybindAction, Keybind>;
  created_at: string;
  updated_at: string | null;
};

/**
 * Loads keybinds for the current user
 * Falls back to default keybinds if none are found or if not authenticated
 */
export async function loadKeybinds(): Promise<Record<KeybindAction, Keybind>> {
  try {
    // Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('User not authenticated, using default keybinds');
      return DEFAULT_KEYBINDS;
    }
    
    // Fetch keybinds for the user
    const { data, error } = await supabase
      .from('player_keybinds')
      .select('*')
      .eq('user_id', user.id)
      .single();
    
    if (error) {
      console.log('No keybinds found for user, using defaults:', error.message);
      return DEFAULT_KEYBINDS;
    }
    
    if (!data) {
      console.log('No keybinds found for user, using defaults');
      return DEFAULT_KEYBINDS;
    }
    
    // Return the keybinds from the record
    return (data as PlayerKeybindsRecord).keybinds;
  } catch (error) {
    console.error('Unexpected error loading keybinds:', error);
    return DEFAULT_KEYBINDS;
  }
}

/**
 * Saves keybinds for the current user
 * @param keybinds The keybinds to save
 * @returns Whether the save was successful
 */
export async function saveKeybinds(keybinds: Record<KeybindAction, Keybind>): Promise<boolean> {
  console.log('🔑 Starting saveKeybinds function');
  try {
    // Check if user is authenticated
    console.log('🔑 Checking if user is authenticated');
    const { data: userData, error: authError } = await supabase.auth.getUser();
    
    if (authError) {
      console.error('🔑 Auth error:', authError);
      return false;
    }
    
    const user = userData.user;
    console.log('🔑 Auth check result:', !!user);
    
    if (!user) {
      console.log('🔑 User not authenticated, keybinds not saved');
      return false;
    }
    
    console.log(`🔑 Attempting to save keybinds for user: ${user.id}`);
    console.log('🔑 Keybinds to save:', JSON.stringify(keybinds, null, 2));
    
    // Use upsert with onConflict to handle both insert and update cases
    console.log('🔑 Using upsert with onConflict: user_id');
    const { data: upsertData, error } = await supabase
      .from('player_keybinds')
      .upsert({
        user_id: user.id,
        keybinds: keybinds
      }, {
        onConflict: 'user_id'
      });
    
    if (error) {
      console.error('🔑 Error saving keybinds:', error);
      return false;
    }
    
    console.log('🔑 Keybinds saved successfully', upsertData);
    return true;
  } catch (error) {
    console.error('🔑 Unexpected error saving keybinds:', error);
    return false;
  }
} 