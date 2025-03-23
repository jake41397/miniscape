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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const diagnosticResults: Record<string, any> = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      requestHeaders: {
        host: req.headers.host,
        referer: req.headers.referer,
        userAgent: req.headers['user-agent'],
      },
      supabase: {
        url: process.env.NEXT_PUBLIC_SUPABASE_URL ? process.env.NEXT_PUBLIC_SUPABASE_URL : 'Not defined',
        anonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'Defined (Hidden)' : 'Not defined',
        serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'Defined (Hidden)' : 'Not defined',
      },
      tests: {},
      networkChecks: {},
    };

    // Check if Supabase URL and key are defined
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
      diagnosticResults.tests.configDefined = false;
      diagnosticResults.error = 'Supabase configuration is missing';
      return res.status(500).json(diagnosticResults);
    }

    diagnosticResults.tests.configDefined = true;
    
    // Check Supabase URL accessibility
    if (process.env.NEXT_PUBLIC_SUPABASE_URL) {
      diagnosticResults.networkChecks.supabaseUrl = await checkUrlAccessibility(process.env.NEXT_PUBLIC_SUPABASE_URL);
    }
    
    // Check Google OAuth accessibility
    diagnosticResults.networkChecks.googleOAuth = await checkUrlAccessibility('https://accounts.google.com/o/oauth2/v2/auth');
    
    // Check the callback URL's domain
    if (req.headers.host) {
      const protocol = req.headers['x-forwarded-proto'] || 'https';
      const callbackUrl = `${protocol}://${req.headers.host}/auth/handle-callback`;
      diagnosticResults.networkChecks.callbackUrl = {
        url: callbackUrl,
      };
    }

    // Create Supabase client
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          flowType: 'pkce',  // Explicitly use PKCE
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true
        }
      }
    );

    // Test basic connection by querying something simple
    let connectionTestStarted = Date.now();
    try {
      const startTime = Date.now();
      const { data, error } = await supabase
        .from('profiles')
        .select('count')
        .limit(1);
      const endTime = Date.now();

      diagnosticResults.tests.connection = {
        success: !error,
        responseTime: `${endTime - startTime}ms`,
        error: error ? error.message : null,
      };
    } catch (connectionError) {
      diagnosticResults.tests.connection = {
        success: false,
        responseTime: `${Date.now() - connectionTestStarted}ms`,
        error: connectionError instanceof Error ? connectionError.message : 'Unknown connection error',
      };
    }

    // Test auth settings
    let authTestStarted = Date.now();
    try {
      const { data, error } = await supabase.auth.getSession();
      diagnosticResults.tests.authSettings = {
        success: !error,
        error: error ? error.message : null,
      };
    } catch (authError) {
      diagnosticResults.tests.authSettings = {
        success: false,
        responseTime: `${Date.now() - authTestStarted}ms`,
        error: authError instanceof Error ? authError.message : 'Unknown auth error',
      };
    }

    // Test OAuth configuration by checking auth URL
    let oauthTestStarted = Date.now();
    try {
      // Ensure we use consistent URL using the host header
      const redirectUrl = req.headers.host 
        ? `https://${req.headers.host}/auth/handle-callback`
        : `https://dev.miniscape.io/auth/handle-callback`;
        
      const { data: urlData, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: redirectUrl,
          skipBrowserRedirect: true, // Don't actually redirect, just get the URL
        }
      });
      
      diagnosticResults.tests.oauthUrl = {
        success: !error && !!urlData?.url,
        responseTime: `${Date.now() - oauthTestStarted}ms`,
        url: urlData?.url ? urlData.url : null,
        redirectUrl: redirectUrl,
        error: error ? error.message : null,
      };
    } catch (oauthError) {
      diagnosticResults.tests.oauthUrl = {
        success: false,
        responseTime: `${Date.now() - oauthTestStarted}ms`,
        error: oauthError instanceof Error ? oauthError.message : 'Unknown OAuth URL error',
      };
    }

    return res.status(200).json(diagnosticResults);
  } catch (error) {
    console.error('Supabase diagnostic error:', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Unknown error',
      stack: process.env.NODE_ENV === 'development' ? (error instanceof Error ? error.stack : null) : null,
    });
  }
} 