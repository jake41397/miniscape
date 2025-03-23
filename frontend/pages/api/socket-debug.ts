import type { NextApiRequest, NextApiResponse } from 'next';
import { supabase } from '../../lib/supabase';

/**
 * Socket Debug API endpoint
 * This helps diagnose socket connection issues by checking auth token validity
 * and providing detailed diagnostics about the current environment
 */
export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  
  const results: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV,
    socketConfig: {
      // We're now using only the standalone backend socket server
      backendSocketUrl: process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:4000',
    },
    auth: {
      status: 'unknown',
      message: '',
      tokenReceived: false,
      tokenFormatValid: false,
      tokenVerified: false,
    },
    requestDetails: {
      method: req.method,
      ip: req.headers['x-forwarded-for'] || req.socket.remoteAddress,
      userAgent: req.headers['user-agent'],
      headers: {
        ...req.headers,
        // Redact any sensitive information
        authorization: req.headers.authorization ? '[REDACTED]' : undefined,
        cookie: req.headers.cookie ? '[REDACTED]' : undefined,
      },
    }
  };

  try {
    // Check for token in request
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ') 
      ? authHeader.slice(7) 
      : req.query.token as string;
      
    results.auth.tokenReceived = !!token;
    
    if (!token) {
      results.auth.status = 'no_token';
      results.auth.message = 'No authentication token provided';
    } else {
      // Basic token format validation (is it JWT format?)
      const tokenParts = token.split('.');
      results.auth.tokenFormatValid = tokenParts.length === 3;
      
      if (!results.auth.tokenFormatValid) {
        results.auth.status = 'invalid_format';
        results.auth.message = 'Token is not in valid JWT format';
      } else {
        // Verify token with Supabase
        try {
          const { data, error } = await supabase.auth.getUser(token);
          
          if (error) {
            results.auth.status = 'invalid_token';
            results.auth.message = error.message;
          } else if (data && data.user) {
            results.auth.status = 'valid';
            results.auth.message = 'Token is valid';
            results.auth.tokenVerified = true;
            results.auth.user = {
              id: data.user.id,
              email: data.user.email,
              lastSignIn: data.user.last_sign_in_at,
            };
          }
        } catch (verifyError) {
          results.auth.status = 'verification_error';
          results.auth.message = verifyError instanceof Error 
            ? verifyError.message 
            : 'Unknown error during token verification';
        }
      }
    }
    
    // Provide info about socket configuration
    results.diagnostics = {
      socketImplementation: {
        type: 'standalone-backend',
        url: results.socketConfig.backendSocketUrl,
        message: 'Using standalone backend socket server. No Next.js API socket implementation.'
      },
      notes: [
        'The application is now using only the standalone backend socket server',
        'Client code connects directly to the backend without using a Next.js API route',
        'This approach provides better separation of concerns and simpler architecture'
      ]
    };
    
    res.status(200).json(results);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({
      error: 'Debug endpoint error',
      message: errorMessage,
      timestamp: new Date().toISOString()
    });
  }
} 