/**
 * Auth Helper Utilities
 * Provides functions to help with authentication troubleshooting and bypass for development
 */

/**
 * Detects if the current environment is development
 */
export const isDevelopmentEnvironment = (): boolean => {
  if (typeof window === 'undefined') return false;
  
  return (
    window.location.hostname.includes('localhost') ||
    window.location.hostname.includes('127.0.0.1') ||
    window.location.hostname.includes('dev.') ||
    localStorage.getItem('force_local_dev') === 'true'
  );
};

/**
 * Enables test mode for bypassing authentication
 */
export const enableTestMode = (): void => {
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem('test_mode_enabled', 'true');
    localStorage.setItem('bypass_socket_check', 'true');
    console.log('Test mode enabled - authentication bypass activated');
  }
};

/**
 * Disables test mode
 */
export const disableTestMode = (): void => {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('test_mode_enabled');
    localStorage.removeItem('bypass_socket_check');
    console.log('Test mode disabled - normal authentication required');
  }
};

/**
 * Checks if test mode is currently enabled
 */
export const isTestModeEnabled = (): boolean => {
  if (typeof localStorage === 'undefined') return false;
  return localStorage.getItem('test_mode_enabled') === 'true';
};

/**
 * Diagnose common authentication issues
 */
export const diagnoseAuthIssues = (): void => {
  if (typeof localStorage === 'undefined') return;
  
  console.group('Authentication Diagnostic Information');
  
  // Check local storage for auth data
  try {
    console.log('Environment:', 
      isDevelopmentEnvironment() ? 'Development' : 'Production'
    );
    
    console.log('Test mode enabled:', isTestModeEnabled());
    
    const hasAuthToken = !!localStorage.getItem('supabase.auth.token');
    console.log('Has auth token in localStorage:', hasAuthToken);
    
    // Check for specific error flags
    const hasDisabledAutoReconnect = !!localStorage.getItem('socket_disable_auto_reconnect');
    console.log('Auto reconnect disabled:', hasDisabledAutoReconnect);
    
    // Output URL information
    console.log('Current URL:', window.location.href);
    console.log('Current hostname:', window.location.hostname);
    
    // Suggest solutions
    if (!hasAuthToken && !isTestModeEnabled()) {
      console.warn('RECOMMENDED ACTION: Enable test mode for development by clicking the "Bypass Authentication" button in settings.');
    }
  } catch (e) {
    console.error('Error during auth diagnosis:', e);
  }
  
  console.groupEnd();
};

/**
 * Add an auth failure handler to the page
 * This adds a UI element to help recover from auth failures during development
 */
export const addAuthFailureHandler = (): void => {
  if (typeof document === 'undefined' || !isDevelopmentEnvironment()) return;
  
  // Check if handler already exists
  if (document.getElementById('auth-failure-handler')) return;
  
  // Create handler UI
  const handler = document.createElement('div');
  handler.id = 'auth-failure-handler';
  handler.style.position = 'fixed';
  handler.style.bottom = '20px';
  handler.style.right = '20px';
  handler.style.backgroundColor = 'rgba(200, 0, 0, 0.9)';
  handler.style.color = 'white';
  handler.style.padding = '15px';
  handler.style.borderRadius = '5px';
  handler.style.zIndex = '10000';
  handler.style.fontSize = '14px';
  handler.style.fontFamily = 'sans-serif';
  handler.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
  
  handler.innerHTML = `
    <div style="margin-bottom: 10px; font-weight: bold;">Authentication Issue Detected</div>
    <div style="margin-bottom: 10px; font-size: 12px;">
      The application is having trouble authenticating with Supabase.
      This may be due to network issues or configuration problems.
    </div>
    <button id="enable-test-mode-btn" style="background: #00AA00; border: none; color: white; 
            padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-right: 5px;">
      Enable Test Mode
    </button>
    <button id="auth-diagnose-btn" style="background: #0055AA; border: none; color: white; 
            padding: 5px 10px; border-radius: 3px; cursor: pointer; margin-right: 5px;">
      Diagnose Issues
    </button>
    <button id="close-auth-handler-btn" style="background: #555; border: none; color: white; 
            padding: 5px 10px; border-radius: 3px; cursor: pointer;">
      Close
    </button>
  `;
  
  document.body.appendChild(handler);
  
  // Add event listeners
  document.getElementById('enable-test-mode-btn')?.addEventListener('click', () => {
    enableTestMode();
    window.location.href = '/game';
  });
  
  document.getElementById('auth-diagnose-btn')?.addEventListener('click', () => {
    diagnoseAuthIssues();
  });
  
  document.getElementById('close-auth-handler-btn')?.addEventListener('click', () => {
    document.body.removeChild(handler);
  });
};

/**
 * Handle authentication errors by showing the helper UI
 */
export const handleAuthError = (error: Error): void => {
  console.error('Authentication error:', error);
  
  if (isDevelopmentEnvironment()) {
    addAuthFailureHandler();
    diagnoseAuthIssues();
  }
}; 