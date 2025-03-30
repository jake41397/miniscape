import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Get Supabase credentials from environment variables
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Log the credentials (masked) for debugging
logger.info('Supabase configuration:', {
  url: supabaseUrl ? `${supabaseUrl.substring(0, 8)}...` : 'undefined',
  key: supabaseServiceKey ? 
    `${supabaseServiceKey.substring(0, 3)}...${supabaseServiceKey.substring(supabaseServiceKey.length - 3)}` : 
    'undefined',
  keyLength: supabaseServiceKey ? supabaseServiceKey.length : 0
});

// Validate environment variables
if (!supabaseUrl || !supabaseServiceKey) {
  logger.error('Missing Supabase environment variables', null, {
    supabaseUrl: !!supabaseUrl,
    supabaseServiceKey: !!supabaseServiceKey
  });
  throw new Error('Missing Supabase environment variables. Please check your .env file.');
}

// Create Supabase client with service role key for backend operations
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  },
  global: {
    // Add fetch options with longer timeout
    fetch: (url, options = {}) => {
      const timeout = 30000; // 30 second timeout
      
      // Create an abort controller to handle timeout
      const controller = new AbortController();
      const { signal } = controller;
      
      // Ensure headers object exists
      if (!options.headers) {
        options.headers = {};
      }
      
      // Explicitly add the apikey header to every request
      const headers = options.headers as Record<string, string>;
      headers['apikey'] = supabaseServiceKey;
      headers['Authorization'] = `Bearer ${supabaseServiceKey}`;
      
      // Log the request details (without exposing the full key)
      const urlObj = new URL(url.toString());
      logger.debug(`Supabase request: ${urlObj.pathname}`, {
        hasApiKey: !!headers['apikey'],
        hasAuth: !!headers['Authorization'] 
      });
      
      // Set up timeout to abort the request
      const timeoutId = setTimeout(() => {
        controller.abort();
        logger.warn(`Supabase request timed out after ${timeout}ms: ${url}`);
      }, timeout);
      
      return fetch(url, {
        ...options,
        signal,
        headers
      })
      .then(response => {
        clearTimeout(timeoutId);
        // Log response status
        logger.debug(`Supabase response: ${response.status} ${response.statusText}`);
        return response;
      })
      .catch(error => {
        clearTimeout(timeoutId);
        logger.error(`Supabase fetch error: ${url}`, error);
        throw error;
      });
    }
  }
});

// Test the connection and log status
(async () => {
  try {
    logger.info('Testing Supabase connection...');
    const { data, error } = await supabase.from('resource_nodes').select('count');
    
    if (error) {
      logger.error('Supabase connection test failed:', error);
    } else {
      logger.info('Supabase connection test successful. Resource nodes count:', data);
    }
  } catch (err) {
    logger.error('Error testing Supabase connection:', err instanceof Error ? err : new Error(String(err)));
  }
})();

logger.info('Supabase client initialized', { url: supabaseUrl });

export default supabase; 