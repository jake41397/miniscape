import axios, { AxiosRequestConfig, AxiosError, InternalAxiosRequestConfig } from 'axios';

// Get the API URL from environment variables or use a fallback
const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

// Create axios instance with base URL and default headers
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add a request interceptor to inject the auth token into requests
api.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // Get token from localStorage
    const token = localStorage.getItem('auth_token');
    
    // If token exists, add it to the authorization header
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    
    return config;
  },
  (error: AxiosError) => {
    return Promise.reject(error);
  }
);

// Authentication functions
export const authAPI = {
  // Register a new user
  register: async (email: string, password: string) => {
    try {
      const response = await api.post('/auth/register', { email, password });
      return response.data;
    } catch (error) {
      console.error('Registration error:', error);
      throw error;
    }
  },
  
  // Login user
  login: async (email: string, password: string) => {
    try {
      const response = await api.post('/auth/login', { email, password });
      
      // Save tokens to localStorage
      if (response.data.accessToken) {
        localStorage.setItem('auth_token', response.data.accessToken);
        localStorage.setItem('refresh_token', response.data.refreshToken);
      }
      
      return response.data;
    } catch (error) {
      console.error('Login error:', error);
      throw error;
    }
  },
  
  // Login with Google
  googleLogin: async (): Promise<void> => {
    // Redirect to Google OAuth endpoint on the backend
    window.location.href = `${API_URL}/auth/google`;
  },
  
  // Handle Google OAuth callback data
  handleOAuthCallback: async (code: string) => {
    try {
      const response = await api.post('/auth/google/callback', { code });
      
      // Save tokens to localStorage
      if (response.data.accessToken) {
        localStorage.setItem('auth_token', response.data.accessToken);
        localStorage.setItem('refresh_token', response.data.refreshToken);
      }
      
      return response.data;
    } catch (error) {
      console.error('OAuth callback error:', error);
      throw error;
    }
  },
  
  // Continue as guest
  continueAsGuest: async () => {
    try {
      // Check if we have a stored guest session ID
      const existingSessionId = localStorage.getItem('guest_session_id');
      
      console.log('Attempting to continue as guest with existing session ID:', existingSessionId || 'none');
      
      const response = await api.post('/auth/guest', {
        existingSessionId: existingSessionId || undefined
      });
      
      // Save the session ID and token
      if (response.data.sessionId) {
        localStorage.setItem('guest_session_id', response.data.sessionId);
        console.log('Saved guest session ID from server response:', response.data.sessionId);
      }
      
      if (response.data.token) {
        localStorage.setItem('auth_token', response.data.token);
        console.log('Saved guest authentication token');
      }
      
      return response.data;
    } catch (error) {
      console.error('Guest login error:', error);
      throw error;
    }
  },
  
  // Get current user profile
  getCurrentUser: async () => {
    try {
      const response = await api.get('/auth/me');
      return response.data;
    } catch (error) {
      console.error('Get current user error:', error);
      throw error;
    }
  },
  
  // Sign out
  signOut: async (): Promise<void> => {
    try {
      await api.post('/auth/logout');
      
      // Clear auth tokens
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
    } catch (error) {
      console.error('Sign out error:', error);
      
      // Clear tokens even if the API call fails
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      
      throw error;
    }
  },
  
  // Refresh token
  refreshToken: async () => {
    try {
      const refreshToken = localStorage.getItem('refresh_token');
      
      if (!refreshToken) {
        throw new Error('No refresh token available');
      }
      
      const response = await api.post('/auth/refresh-token', { refreshToken });
      
      // Update tokens
      if (response.data.accessToken) {
        localStorage.setItem('auth_token', response.data.accessToken);
        
        // Update refresh token if a new one was provided
        if (response.data.refreshToken) {
          localStorage.setItem('refresh_token', response.data.refreshToken);
        }
      }
      
      return response.data;
    } catch (error) {
      console.error('Token refresh error:', error);
      throw error;
    }
  },
  
  // Check if user is authenticated
  isAuthenticated: (): boolean => {
    return !!localStorage.getItem('auth_token');
  }
};

// Game-related API calls
export const gameAPI = {
  // Get player data
  getPlayerData: async () => {
    try {
      const response = await api.get('/game/player-data');
      return response.data;
    } catch (error) {
      console.error('Get player data error:', error);
      throw error;
    }
  },
  
  // Save player position
  savePosition: async (x: number, y: number, z: number): Promise<void> => {
    try {
      await api.post('/game/save-position', { x, y, z });
    } catch (error) {
      console.error('Save position error:', error);
      throw error;
    }
  },
  
  // Save player inventory
  saveInventory: async (inventory: any[]): Promise<void> => {
    try {
      await api.post('/game/save-inventory', { inventory });
    } catch (error) {
      console.error('Save inventory error:', error);
      throw error;
    }
  },
  
  // Save player skills
  saveSkills: async (skills: Record<string, any>): Promise<void> => {
    try {
      await api.post('/game/save-skills', { skills });
    } catch (error) {
      console.error('Save skills error:', error);
      throw error;
    }
  },
  
  // Get world resources and items
  getWorldData: async () => {
    try {
      const response = await api.get('/game/world-data');
      return response.data;
    } catch (error) {
      console.error('Get world data error:', error);
      throw error;
    }
  }
};

export default api; 