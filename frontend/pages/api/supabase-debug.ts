import { NextApiRequest, NextApiResponse } from 'next';
import { createClient } from '@supabase/supabase-js';
import https from 'https';

// Helper function to check if a URL is accessible
async function checkUrlAccessibility(url: string, timeout = 5000): Promise<{
  success: boolean, 
  time?: number, 
  error?: string,
  statusCode?: number
}> {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const urlObj = new URL(url);
    
    const req = https.get({
      hostname: urlObj.hostname,
      path: urlObj.pathname,
      port: urlObj.port || 443,
      method: 'HEAD',
      timeout: timeout,
    }, (res) => {
      const endTime = Date.now();
      resolve({ 
        success: res.statusCode !== undefined && res.statusCode < 400,
        time: endTime - startTime,
        statusCode: res.statusCode
      });
    });
    
    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, error: `Request timed out after ${timeout}ms` });
    });
    
    req.on('error', (error) => {
      resolve({ success: false, error: error.message });
    });
    
    req.end();
  });
}

// Define a more specific type instead of using 'any'
interface DiagnosticResults {
  timestamp: string;
  environment: string | undefined;
  requestHeaders: {
    host: string | undefined;
    referer: string | undefined;
    userAgent: string | undefined;
  };
  supabase: {
    url: string;
    anonKey: string;
    serviceRoleKey: string;
  };
  tests: Record<string, unknown>;
  networkChecks: Record<string, unknown>;
  error?: string;
}

/**
 * API endpoint that provides diagnostic information about Supabase configuration
 * This helps troubleshoot authentication issues
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Get environment variables
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
    const redirectUrl = process.env.NEXT_PUBLIC_SUPABASE_REDIRECT_URL || '';
    
    // Create diagnostics object
    const diagnostics: DiagnosticResults = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      supabaseUrl: supabaseUrl ? `${supabaseUrl.substring(0, 12)}...` : 'Not configured',
      supabaseAnonKeyConfigured: !!supabaseAnonKey,
      redirectUrlConfigured: !!redirectUrl,
      redirectUrl: redirectUrl 
        ? `${new URL(redirectUrl).origin}/...${new URL(redirectUrl).pathname}` 
        : 'Not configured',
      serverHostname: req.headers.host,
      clientHeaders: {
        origin: req.headers.origin,
        referer: req.headers.referer,
        userAgent: req.headers['user-agent']
      },
      tests: {
        connection: { success: false, error: null },
        oauthUrl: { success: false, url: null, error: null }
      },
      supabase: {
        url: supabaseUrl,
        anonKey: supabaseAnonKey ? 'Defined (Hidden)' : 'Not defined',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Defined (Hidden)' : 'Not defined',
      },
      networkChecks: {},
    };

    // Check if Supabase URL and key are defined
    if (!supabaseUrl || !supabaseAnonKey) {
      diagnostics.tests.configDefined = false;
      diagnostics.error = 'Supabase configuration is missing';
      return res.status(500).json(diagnostics);
    }

    diagnostics.tests.configDefined = true;
    
    // Check Supabase URL accessibility
    if (supabaseUrl) {
      diagnostics.networkChecks.supabaseUrl = await checkUrlAccessibility(supabaseUrl);
    }
    
    // Check Google OAuth accessibility
    diagnostics.networkChecks.googleOAuth = await checkUrlAccessibility('https://accounts.google.com/o/oauth2/v2/auth');
    
    // Check the callback URL's domain
    if (req.headers.host) {
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const callbackUrl = `${protocol}://${req.headers.host}/auth/handle-callback`;
      diagnostics.networkChecks.callbackUrl = {
        url: callbackUrl,
      };
    }

    // Test Supabase connection
    try {
      // Only run this test if we have Supabase config
      if (supabaseUrl && supabaseAnonKey) {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        
        // Simple query to test connection
        const { data, error } = await supabase
          .from('profiles')
          .select('count', { count: 'exact', head: true })
          .limit(1);
          
        diagnostics.tests.connection = {
          success: !error,
          error: error ? error.message : null
        };
      }
    } catch (e) {
      diagnostics.tests.connection = {
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error'
      };
    }
    
    // Generate an OAuth URL for testing
    try {
      if (supabaseUrl && supabaseAnonKey) {
        const supabase = createClient(supabaseUrl, supabaseAnonKey);
        
        // Get the URL that would be used for OAuth
        const oauthUrl = supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo: redirectUrl || `https://${req.headers.host || 'localhost:3000'}/auth/handle-callback`
          }
        });
        
        diagnostics.tests.oauthUrl = {
          success: true,
          url: typeof oauthUrl === 'object' && oauthUrl.data ? oauthUrl.data.url : null,
          error: null
        };
      }
    } catch (e) {
      diagnostics.tests.oauthUrl = {
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error'
      };
    }

    return res.status(200).json(diagnostics);
  } catch (error) {
    console.error('Supabase diagnostic error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : null) : null,
    });
  }
} 