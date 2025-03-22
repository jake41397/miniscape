import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Add CORS headers for debugging
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  
  try {
    // Get session state
    const { data, error } = await supabase.auth.getSession();
    
    // Verify environment variables
    const envInfo = {
      supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL ? 'configured' : 'missing',
      supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ? 'configured' : 'missing',
      nodeEnv: process.env.NODE_ENV,
      socketUrl: process.env.NEXT_PUBLIC_SOCKET_SERVER_URL
    };
    
    // Send diagnostic info
    res.status(200).json({
      timestamp: new Date().toISOString(),
      hasSession: !!data.session,
      sessionError: error ? error.message : null,
      environment: envInfo,
      userAgent: req.headers['user-agent'],
      // Only include minimal user info for security
      user: data.session ? {
        id: data.session.user.id,
        email: data.session.user.email,
        authenticated: true
      } : null
    });
  } catch (error) {
    res.status(500).json({ 
      error: 'Error checking auth state',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
} 