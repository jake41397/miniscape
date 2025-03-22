import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';

/**
 * Debug API endpoint to help diagnose authentication and socket issues
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Add CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Handle OPTIONS requests
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  // Only allow GET requests
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    // Capture request details
    const requestInfo = {
      timestamp: new Date().toISOString(),
      method: req.method,
      url: req.url,
      headers: sanitizeHeaders(req.headers),
      query: req.query,
      cookies: req.cookies ? Object.keys(req.cookies) : [],
      clientIp: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent']
    };
    
    // Check authentication status
    let authStatus;
    try {
      // Check for authorization header or cookies that might contain the auth token
      const authCookie = req.cookies['sb-access-token'] || req.cookies['sb:token'];
      const authHeader = req.headers.authorization;
      
      // Check for authentication in various places
      let sessionData = null;
      let sessionError = null;
      
      // First try to get session directly
      const { data, error } = await supabase.auth.getSession();
      
      if (!error && data?.session) {
        sessionData = data;
        sessionError = null;
      } else {
        // If no direct session, try using any tokens found
        const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : authCookie;
        
        if (token) {
          try {
            const { data: userData, error: userError } = await supabase.auth.getUser(token);
            if (!userError && userData?.user) {
              sessionData = { session: { user: userData.user } };
            }
          } catch (tokenError) {
            console.error('Error validating token:', tokenError);
          }
        }
      }
      
      // Build the auth status response
      authStatus = {
        isAuthenticated: !!sessionData?.session?.user,
        hasError: !!sessionError,
        errorMessage: sessionError ? 
          (typeof sessionError === 'object' && sessionError !== null && 'message' in sessionError) 
            ? (sessionError as {message: string}).message 
            : String(sessionError) 
          : undefined,
        session: sessionData?.session?.user ? {
          id: 'session-id',
          expiresAt: null,
          userId: sessionData.session.user.id,
          email: sessionData.session.user.email,
          lastSignedIn: sessionData.session.user.last_sign_in_at
        } : null
      };
    } catch (authError) {
      console.error('Auth check error:', authError);
      authStatus = {
        isAuthenticated: false,
        hasError: true,
        errorMessage: authError instanceof Error ? authError.message : 'Unknown auth error',
        session: null
      };
    }
    
    // Provide server environment information
    const environmentInfo = {
      nodeEnv: process.env.NODE_ENV,
      timestamp: new Date().toISOString(),
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'Configured' : 'Missing',
      socketServerUrl: process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:4000'
    };
    
    // Send the debug information
    return res.status(200).json({
      status: 'ok',
      message: 'Debug information collected successfully',
      requestInfo,
      authStatus,
      environmentInfo
    });
  } catch (error) {
    console.error('Error in debug API:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      message: error instanceof Error ? error.message : 'Unknown error',
      timestamp: new Date().toISOString()
    });
  }
}

// Helper function to sanitize headers (remove sensitive information)
function sanitizeHeaders(headers: NextApiRequest['headers']) {
  const sanitized = { ...headers };
  
  // Remove sensitive authentication data
  if (sanitized.authorization) {
    sanitized.authorization = 'Bearer [REDACTED]';
  }
  
  // Remove or truncate cookies
  if (sanitized.cookie) {
    sanitized.cookie = '[REDACTED]';
  }
  
  return sanitized;
} 