import { NextApiRequest, NextApiResponse } from 'next';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  // Get auth code from URL
  const { code, error, error_description } = req.query;

  // Handle auth errors
  if (error) {
    console.error('Auth provider error:', error, error_description);
    return res.redirect(302, `/auth/error?error=${encodeURIComponent(String(error))}`);
  }

  if (!code) {
    console.error('No code provided in callback');
    return res.redirect(302, '/auth/error?error=no_code');
  }

  try {
    // When using PKCE flow, the code should be exchanged on the client side
    // Redirect back to a client-side handler with the code
    return res.redirect(302, `/auth/handle-callback?code=${code}`);
  } catch (error) {
    console.error('Auth callback error:', error);
    return res.redirect(302, '/auth/error');
  }
} 