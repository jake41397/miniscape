/**
 * Socket Test Utility
 * 
 * Run this script to test the socket server connection:
 * npx ts-node src/utils/socketTest.ts
 */

import { io, Socket } from 'socket.io-client';
import readline from 'readline';

// Create readline interface for interactive testing
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Socket server URL
const SERVER_URL = process.env.SOCKET_SERVER_URL || 'http://localhost:4000';

console.log(`Socket Test Utility for MiniScape`);
console.log(`Connecting to server at: ${SERVER_URL}\n`);

// Ask for token
rl.question('Enter Supabase authentication token: ', (token) => {
  if (!token) {
    console.error('No token provided, exiting');
    process.exit(1);
  }

  console.log('\nAttempting connection with provided token...');
  
  // Create socket connection
  const socket: Socket = io(SERVER_URL, {
    transports: ['websocket', 'polling'],
    auth: {
      token
    },
    extraHeaders: {
      'Authorization': `Bearer ${token}`
    }
  });

  // Setup event listeners
  socket.on('connect', () => {
    console.log(`✅ Connected to socket server! Socket ID: ${socket.id}`);
    console.log('\nType a message to send as a chat message, or type commands:');
    console.log('  - !quit  : Disconnect and exit');
    console.log('  - !ping  : Send ping to server');
    console.log('  - !move  : Send random movement coordinates\n');
  });

  socket.on('connect_error', (err) => {
    console.error(`❌ Connection error: ${err.message}`);
    console.log('Try again with a valid token or check server status');
    process.exit(1);
  });

  socket.on('disconnect', (reason) => {
    console.log(`Disconnected: ${reason}`);
    process.exit(0);
  });

  // Handle server events
  socket.on('chatMessage', (msg) => {
    console.log(`📨 Chat from ${msg.name}: ${msg.text}`);
  });

  socket.on('error', (err) => {
    console.error(`Server error: ${err}`);
  });

  // Process user input
  rl.on('line', (input) => {
    if (input === '!quit') {
      console.log('Disconnecting...');
      socket.disconnect();
      rl.close();
      return;
    }

    if (input === '!ping') {
      console.log('Sending ping to server...');
      const start = Date.now();
      // We use a regular event for ping, since the socket.io ping is internal
      socket.emit('ping', () => {
        const duration = Date.now() - start;
        console.log(`Pong received! Round trip: ${duration}ms`);
      });
      return;
    }

    if (input === '!move') {
      const x = Math.floor(Math.random() * 10) - 5;
      const y = 1; // Ground level
      const z = Math.floor(Math.random() * 10) - 5;
      console.log(`Sending movement to (${x}, ${y}, ${z})`);
      socket.emit('playerMove', { x, y, z });
      return;
    }

    // Otherwise send as chat
    console.log(`Sending chat: ${input}`);
    socket.emit('chat', input);
  });
}); 