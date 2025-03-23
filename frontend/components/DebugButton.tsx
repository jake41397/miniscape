import { useState } from 'react';

type DebugResult = {
  status: string;
  message: string;
  requestInfo: {
    timestamp: string;
    method: string;
    url: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    cookies: string[];
    clientIp: string;
    userAgent: string;
  };
  authStatus: {
    isAuthenticated: boolean;
    hasError: boolean;
    errorMessage?: string;
    session: {
      id: string;
      expiresAt: string | null;
      userId: string;
      email: string;
      lastSignedIn: string;
    } | null;
  };
  environmentInfo: {
    nodeEnv: string;
    timestamp: string;
    supabaseUrl: string;
    socketServerUrl: string;
  };
} | null;

const DebugButton = () => {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<DebugResult>(null);
  const [expanded, setExpanded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const runDiagnostics = async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Add timestamp to prevent caching
      const response = await fetch(`/api/debug?t=${Date.now()}`);
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP error ${response.status}: ${errorText}`);
      }
      
      const data = await response.json();
      setResult(data);
      setExpanded(true);
    } catch (err) {
      console.error('Diagnostic error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };
  
  return (
    <div style={{
      position: 'fixed',
      bottom: '10px',
      right: '10px',
      zIndex: 9999,
      fontFamily: 'monospace',
      fontSize: '12px',
      backgroundColor: 'rgba(0,0,0,0.8)',
      color: '#fff',
      padding: '10px',
      borderRadius: '4px',
      maxWidth: '400px'
    }}>
      <button
        onClick={runDiagnostics}
        style={{
          padding: '5px 10px',
          backgroundColor: loading ? '#555' : '#f44336',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: loading ? 'not-allowed' : 'pointer'
        }}
        disabled={loading}
      >
        {loading ? 'Running Diagnostics...' : 'Run Auth Diagnostics'}
      </button>
      
      {error && (
        <div style={{ 
          marginTop: '10px', 
          color: '#ff6b6b', 
          fontWeight: 'bold' 
        }}>
          Error: {error}
        </div>
      )}
      
      {result && (
        <div style={{ marginTop: '10px' }}>
          <div style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            alignItems: 'center',
            marginBottom: '5px'
          }}>
            <strong>Diagnostic Results</strong>
            <button 
              onClick={() => setExpanded(!expanded)}
              style={{
                backgroundColor: 'transparent',
                border: 'none',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              {expanded ? '▲' : '▼'}
            </button>
          </div>
          
          {expanded && (
            <div style={{
              maxHeight: '300px',
              overflowY: 'auto',
              backgroundColor: 'rgba(0,0,0,0.5)',
              padding: '8px',
              borderRadius: '4px'
            }}>
              <div>
                <span style={{ color: result.authStatus.isAuthenticated ? '#4caf50' : '#f44336' }}>
                  ● {result.authStatus.isAuthenticated ? 'Authenticated' : 'Not Authenticated'}
                </span>
              </div>
              
              {result.authStatus.hasError && (
                <div style={{ color: '#ff6b6b', marginTop: '5px' }}>
                  Auth Error: {result.authStatus.errorMessage || 'Unknown error'}
                </div>
              )}
              
              {result.authStatus.session && (
                <>
                  <div style={{ marginTop: '5px' }}>
                    <strong>Session:</strong>
                  </div>
                  <div>User: {result.authStatus.session.email}</div>
                  <div>Expires: {result.authStatus.session.expiresAt || 'N/A'}</div>
                </>
              )}
              
              <div style={{ marginTop: '10px' }}>
                <strong>Environment:</strong>
              </div>
              <div>Node Env: {result.environmentInfo.nodeEnv}</div>
              <div>API Time: {result.environmentInfo.timestamp}</div>
              <div>Supabase: {result.environmentInfo.supabaseUrl}</div>
              <div>Socket URL: {result.environmentInfo.socketServerUrl}</div>
              
              <div style={{ marginTop: '10px' }}>
                <strong>Request:</strong>
              </div>
              <div>Client IP: {result.requestInfo.clientIp}</div>
              <div>Time: {result.requestInfo.timestamp}</div>
              
              <div style={{ marginTop: '10px' }}>
                <button
                  onClick={() => {
                    // Save diagnostics to localStorage
                    localStorage.setItem('miniscape_diagnostics', JSON.stringify({
                      result,
                      time: new Date().toISOString()
                    }));
                    
                    // Also copy to clipboard
                    navigator.clipboard.writeText(JSON.stringify(result, null, 2))
                      .then(() => alert('Diagnostics copied to clipboard and saved to localStorage'))
                      .catch(() => alert('Diagnostics saved to localStorage'));
                  }}
                  style={{
                    padding: '5px 10px',
                    backgroundColor: '#4caf50',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    cursor: 'pointer'
                  }}
                >
                  Save Results
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DebugButton; 