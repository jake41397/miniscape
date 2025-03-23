import React, { useState } from 'react';
import { supabase } from '../lib/supabase';
import { getSocket } from '../game/network/socket';

const styles = {
  container: {
    padding: '16px',
    border: '1px solid #CBD5E0',
    borderRadius: '8px',
    backgroundColor: '#F7FAFC',
    maxWidth: '800px',
    margin: '16px auto'
  },
  heading: {
    fontSize: '18px',
    fontWeight: 'bold',
    marginBottom: '16px'
  },
  subheading: {
    fontSize: '16px',
    fontWeight: 'bold',
    marginBottom: '8px',
    marginTop: '16px'
  },
  button: {
    backgroundColor: '#3182CE',
    color: 'white',
    border: 'none',
    padding: '8px 16px',
    borderRadius: '4px',
    cursor: 'pointer',
    fontWeight: 'bold',
    marginBottom: '16px'
  },
  disabledButton: {
    backgroundColor: '#A0AEC0',
    cursor: 'not-allowed'
  },
  alert: {
    padding: '8px 16px',
    borderRadius: '4px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  errorAlert: {
    backgroundColor: '#FED7D7',
    color: '#C53030',
    border: '1px solid #FC8181'
  },
  warningAlert: {
    backgroundColor: '#FEEBC8',
    color: '#C05621',
    border: '1px solid #F6AD55'
  },
  infoRow: {
    display: 'flex',
    gap: '16px',
    marginBottom: '16px',
    flexWrap: 'wrap' as const
  },
  divider: {
    height: '1px',
    backgroundColor: '#E2E8F0',
    margin: '16px 0'
  },
  successText: {
    color: '#38A169',
    marginBottom: '8px'
  },
  errorText: {
    color: '#E53E3E',
    marginBottom: '8px'
  },
  codeBox: {
    marginTop: '8px',
    padding: '8px',
    backgroundColor: '#EDF2F7',
    borderRadius: '4px',
    fontSize: '12px',
    overflowX: 'auto' as const
  }
};

const SocketDebugger = () => {
  const [status, setStatus] = useState<'idle' | 'testing' | 'complete'>('idle');
  const [results, setResults] = useState<any>(null);
  const [apiResponse, setApiResponse] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const runDiagnostics = async () => {
    setStatus('testing');
    setError(null);
    const diagnosticResults: Record<string, any> = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      clientInfo: {
        userAgent: navigator.userAgent,
        url: window.location.href,
      },
      auth: {
        hasSession: false,
        tokenAvailable: false,
      },
      socket: {
        connected: false,
        socketId: null,
        connectAttempted: false,
        error: null,
      },
      apiTest: {
        attempted: false,
        success: false,
        error: null,
      }
    };

    try {
      // Check auth state
      const { data: sessionData } = await supabase.auth.getSession();
      diagnosticResults.auth.hasSession = !!sessionData.session;
      diagnosticResults.auth.tokenAvailable = !!sessionData.session?.access_token;
      
      if (sessionData.session?.access_token) {
        // Mask most of the token for security
        const token = sessionData.session.access_token;
        diagnosticResults.auth.tokenPrefix = token.substring(0, 10) + '...';
        diagnosticResults.auth.tokenSuffix = '...' + token.substring(token.length - 10);
        diagnosticResults.auth.tokenLength = token.length;
        diagnosticResults.auth.tokenFormat = token.split('.').length === 3 ? 'JWT' : 'unknown';
      }
      
      // Check if user is authenticated
      diagnosticResults.auth.userId = sessionData.session?.user?.id;
      diagnosticResults.auth.userEmail = sessionData.session?.user?.email;
      
      // Try to connect to socket server
      diagnosticResults.socket.connectAttempted = true;
      const socket = await getSocket();
      diagnosticResults.socket.connected = !!socket?.connected;
      diagnosticResults.socket.socketId = socket?.id;
      diagnosticResults.socket.connectionUrl = 
        process.env.NEXT_PUBLIC_SOCKET_SERVER_URL || 'http://localhost:4000';
      
      if (!socket?.connected) {
        diagnosticResults.socket.error = 'Socket failed to connect';
      }
      
      // Call our debug API endpoint
      try {
        diagnosticResults.apiTest.attempted = true;
        const token = sessionData.session?.access_token;
        
        if (token) {
          const response = await fetch(`/api/socket-debug?token=${token}`);
          const data = await response.json();
          diagnosticResults.apiTest.success = response.ok;
          diagnosticResults.apiTest.statusCode = response.status;
          diagnosticResults.apiTest.responseData = data;
          setApiResponse(data);
        } else {
          diagnosticResults.apiTest.error = 'No token available for API test';
        }
      } catch (apiError) {
        diagnosticResults.apiTest.success = false;
        diagnosticResults.apiTest.error = apiError instanceof Error 
          ? apiError.message 
          : 'Unknown API test error';
      }
      
      setResults(diagnosticResults);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error during diagnostics');
      diagnosticResults.error = e instanceof Error ? e.message : 'Unknown error';
      setResults(diagnosticResults);
    } finally {
      setStatus('complete');
    }
  };

  return (
    <div style={styles.container}>
      <h2 style={styles.heading}>Socket Connection Diagnostics</h2>
      
      {error && (
        <div style={{...styles.alert, ...styles.errorAlert}}>
          {error}
        </div>
      )}
      
      <button 
        style={{
          ...styles.button,
          ...(status === 'testing' ? styles.disabledButton : {})
        }}
        onClick={runDiagnostics} 
        disabled={status === 'testing'}
      >
        {status === 'testing' ? 'Running tests...' : 'Run Diagnostics'}
      </button>
      
      {results && (
        <div>
          <h3 style={styles.subheading}>Auth Status</h3>
          <div style={styles.infoRow}>
            <span>Session: {results.auth.hasSession ? '✅' : '❌'}</span>
            <span>Token: {results.auth.tokenAvailable ? '✅' : '❌'}</span>
            {results.auth.userId && <span>User ID: {results.auth.userId.substring(0, 8)}...</span>}
          </div>
          
          <h3 style={styles.subheading}>Socket Status</h3>
          <div style={styles.infoRow}>
            <span>Connected: {results.socket.connected ? '✅' : '❌'}</span>
            {results.socket.socketId && <span>Socket ID: {results.socket.socketId}</span>}
            <span>URL: {results.socket.connectionUrl}</span>
          </div>
          
          {results.socket.error && (
            <div style={{...styles.alert, ...styles.warningAlert}}>
              {results.socket.error}
            </div>
          )}
          
          <div style={styles.divider}></div>
          
          <h3 style={styles.subheading}>API Test Results</h3>
          {results.apiTest.success ? (
            <div style={styles.successText}>✅ API test successful</div>
          ) : (
            <div style={styles.errorText}>❌ API test failed: {results.apiTest.error}</div>
          )}
          
          {apiResponse && (
            <div style={styles.codeBox}>
              <pre>{JSON.stringify(apiResponse, null, 2)}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default SocketDebugger; 