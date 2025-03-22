import { useState, useEffect } from 'react';

interface LogEntry {
  timestamp: string;
  page: string;
  message: string;
  data?: string;
}

const DebugViewLogs: React.FC = () => {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState('');
  const [page, setPage] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  
  // Load logs from localStorage
  useEffect(() => {
    try {
      const storedLogs = JSON.parse(localStorage.getItem('miniscape_debug_logs') || '[]');
      setLogs(storedLogs);
    } catch (e) {
      console.error('Error loading debug logs:', e);
      setLogs([]);
    }
  }, [isOpen]); // Reload when opened
  
  // Get unique pages for filtering
  const pageSet = new Set<string>();
  logs.forEach(log => pageSet.add(log.page));
  const pages = Array.from(pageSet);
  
  // Filter logs
  const filteredLogs = logs.filter(log => {
    const matchesPage = page ? log.page === page : true;
    const matchesFilter = filter ? 
      (log.message.toLowerCase().includes(filter.toLowerCase()) || 
       (log.data && log.data.toLowerCase().includes(filter.toLowerCase()))) : 
      true;
    return matchesPage && matchesFilter;
  });
  
  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        style={{
          position: 'fixed',
          top: '40px',
          left: '10px',
          zIndex: 9999,
          padding: '5px 10px',
          backgroundColor: 'rgba(0,0,0,0.7)',
          color: 'white',
          border: 'none',
          borderRadius: '4px',
          cursor: 'pointer',
          fontSize: '12px',
          fontFamily: 'monospace'
        }}
      >
        View Logs ({logs.length})
      </button>
    );
  }
  
  return (
    <div style={{
      position: 'fixed',
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
      zIndex: 10000,
      backgroundColor: 'rgba(0,0,0,0.9)',
      color: 'white',
      padding: '15px',
      borderRadius: '6px',
      width: '90%',
      maxWidth: '800px',
      maxHeight: '80vh',
      display: 'flex',
      flexDirection: 'column',
      fontFamily: 'monospace',
      fontSize: '12px',
      boxShadow: '0 0 20px rgba(0,0,0,0.5)'
    }}>
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '10px'
      }}>
        <h2 style={{ margin: 0, fontSize: '16px' }}>Debug Logs ({filteredLogs.length} of {logs.length})</h2>
        <button
          onClick={() => setIsOpen(false)}
          style={{
            backgroundColor: 'transparent',
            border: 'none',
            color: 'white',
            fontSize: '16px',
            cursor: 'pointer'
          }}
        >
          ×
        </button>
      </div>
      
      {/* Controls */}
      <div style={{
        display: 'flex',
        marginBottom: '10px',
        gap: '10px',
        flexWrap: 'wrap'
      }}>
        <input
          type="text"
          placeholder="Filter logs..."
          value={filter}
          onChange={e => setFilter(e.target.value)}
          style={{
            padding: '5px',
            backgroundColor: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '4px',
            color: 'white',
            flex: '1',
            minWidth: '100px'
          }}
        />
        
        <select
          value={page || ''}
          onChange={e => setPage(e.target.value || null)}
          style={{
            padding: '5px',
            backgroundColor: 'rgba(255,255,255,0.1)',
            border: '1px solid rgba(255,255,255,0.2)',
            borderRadius: '4px',
            color: 'white'
          }}
        >
          <option value="">All Pages</option>
          {pages.map(p => (
            <option key={p} value={p}>{p}</option>
          ))}
        </select>
        
        <button
          onClick={() => {
            try {
              localStorage.removeItem('miniscape_debug_logs');
              setLogs([]);
              alert('Logs cleared!');
            } catch (e) {
              console.error('Error clearing logs:', e);
              alert('Error clearing logs');
            }
          }}
          style={{
            padding: '5px 10px',
            backgroundColor: '#f44336',
            border: 'none',
            borderRadius: '4px',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Clear Logs
        </button>
        
        <button
          onClick={() => {
            try {
              // Reload logs
              const storedLogs = JSON.parse(localStorage.getItem('miniscape_debug_logs') || '[]');
              setLogs(storedLogs);
            } catch (e) {
              console.error('Error reloading logs:', e);
            }
          }}
          style={{
            padding: '5px 10px',
            backgroundColor: '#4caf50',
            border: 'none',
            borderRadius: '4px',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Refresh
        </button>
        
        <button
          onClick={() => {
            try {
              const exportData = JSON.stringify(logs, null, 2);
              navigator.clipboard.writeText(exportData)
                .then(() => alert('Logs copied to clipboard!'))
                .catch(() => alert('Failed to copy to clipboard'));
              
              // Also log to console
              console.log('Exported logs:', logs);
            } catch (e) {
              console.error('Error exporting logs:', e);
              alert('Error exporting logs');
            }
          }}
          style={{
            padding: '5px 10px',
            backgroundColor: '#2196f3',
            border: 'none',
            borderRadius: '4px',
            color: 'white',
            cursor: 'pointer'
          }}
        >
          Export
        </button>
      </div>
      
      {/* Logs table */}
      <div style={{
        overflowY: 'auto',
        flex: '1',
        backgroundColor: 'rgba(0,0,0,0.3)',
        borderRadius: '4px',
        padding: '5px'
      }}>
        <table style={{
          width: '100%',
          borderCollapse: 'collapse',
          fontSize: '11px'
        }}>
          <thead style={{
            position: 'sticky',
            top: 0,
            backgroundColor: 'rgba(0,0,0,0.8)'
          }}>
            <tr>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>Time</th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>Page</th>
              <th style={{ padding: '8px', textAlign: 'left', borderBottom: '1px solid rgba(255,255,255,0.2)' }}>Message</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: '15px', textAlign: 'center' }}>
                  No logs found
                </td>
              </tr>
            ) : (
              filteredLogs.map((log, index) => (
                <tr key={index} style={{ 
                  backgroundColor: index % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'transparent'
                }}>
                  <td style={{ padding: '5px' }}>
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </td>
                  <td style={{ padding: '5px' }}>
                    {log.page}
                  </td>
                  <td style={{ padding: '5px' }}>
                    {log.message}
                    {log.data && (
                      <div style={{ 
                        marginTop: '2px', 
                        fontSize: '10px', 
                        color: 'rgba(255,255,255,0.7)',
                        wordBreak: 'break-all'
                      }}>
                        {log.data}
                      </div>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default DebugViewLogs; 