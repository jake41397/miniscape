# MiniScape Socket Implementation Guide

## Overview

MiniScape uses a client-server architecture for real-time communication via Socket.IO:

- **Backend**: Standalone Node.js/Express socket server running on port 4000
- **Frontend**: Next.js app that connects directly to the backend socket server

This architecture provides a clean separation of concerns and simplifies development.

## Socket Architecture

```
┌─────────────────┐            ┌──────────────────┐
│                 │            │                  │
│  Next.js App    │            │  Socket Server   │
│  (Frontend)     │◄─────────► │  (Backend)       │
│  Port 3000      │  Socket.IO │  Port 4000       │
│                 │            │                  │
└─────────────────┘            └──────────────────┘
```

## Setup Instructions

### 1. Start the Backend Socket Server

```bash
cd backend
npm run dev
```

The socket server will run on port 4000 (configurable via the `PORT` environment variable).

### 2. Start the Frontend

```bash
npm run dev
```

The Next.js app will run on port 3000 and connect to the socket server at `http://localhost:4000`.

## Authentication

The socket connection uses Supabase authentication:

1. The frontend obtains an access token from Supabase
2. This token is sent with the socket connection request
3. The backend verifies the token with Supabase
4. If valid, the connection is established

## Testing the Socket Connection

### Using the Web Debugger

Navigate to `/socket-debug` in your browser to access the Socket Connection Debugger.

### Using the Command-Line Test Tool

```bash
cd backend
npm run socket-test
```

When prompted, enter a valid Supabase access token. You can get this token from the browser's localStorage after logging in.

## Troubleshooting

### Socket Connection Errors

If you're experiencing socket connection issues:

1. Ensure the backend server is running on port 4000
2. Check that your Supabase session is valid
3. Look at the browser console for connection errors
4. Use the socket debugger at `/socket-debug` to diagnose issues

### Common Issues

- **Authentication Errors**: Make sure you're logged in to the app
- **CORS Errors**: Backend server must allow connections from the frontend origin
- **Connection Timeouts**: Check network connectivity and firewall settings

## Development Notes

- Socket events are typed in `game/network/socket.ts` and `backend/src/types/socket.d.ts`
- The client-side socket implementation is in `game/network/socket.ts`
- The server-side implementation is in `backend/src/controllers/socketController.ts` 