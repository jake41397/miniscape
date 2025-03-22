// Determine environment-specific configuration
const isDev = () => {
  if (typeof window !== 'undefined') {
    return window.location.hostname === 'dev.miniscape.io' || 
           window.location.hostname === 'localhost' ||
           process.env.NODE_ENV === 'development';
  }
  return process.env.NODE_ENV === 'development';
};

// Get API base URL 
export const getApiBaseUrl = () => {
  if (isDev()) {
    // In development, we use the relative /api path which gets proxied
    return '/api';
  }
  // In production, use the environment variable or default
  return process.env.NEXT_PUBLIC_API_URL || 'https://api.miniscape.io';
};

// Get Socket URL
export const getSocketUrl = () => {
  if (isDev()) {
    // In development, connect to the same origin for sockets
    return typeof window !== 'undefined' ? window.location.origin : 'http://localhost:4000';
  }
  // In production, use the environment variable or default
  return process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'https://api.miniscape.io';
};

// Export environment helpers
export const env = {
  isDev,
  getApiBaseUrl,
  getSocketUrl
}; 