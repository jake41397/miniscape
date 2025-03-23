// Track socket connection state
socket.on('connect', () => {
  console.log('Socket connected with ID:', socket.id);
  onConnectionChange(true, socket.id);
  
  // Add extra logging for socket ID
  console.log('Connected socket details:', { 
    id: socket.id, 
    connected: socket.connected,
    transport: socket.io.engine.transport.name
  });
  
  // Clear player refs on reconnect to avoid stale references
  if (playersRef.current.size > 0) {
    console.log('Clearing player references on reconnect to avoid stale data');
    playersRef.current = new Map();
  }
});

// Manual reconnect
const reconnect = useCallback(async () => {
  console.log('Manual reconnect requested');
  
  // Clear any connection block flags
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem('socket_disable_auto_reconnect');
    localStorage.removeItem('socket_disable_until');
    localStorage.removeItem('socket_total_attempts');
    localStorage.setItem('last_socket_connection_id', '');
  }
  
  // Attempt to reconnect
  await initializeSocket();
  console.log('Manual reconnect attempt completed');
}, []);