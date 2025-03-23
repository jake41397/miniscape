import { Socket as SocketIOSocket } from 'socket.io';

declare module 'socket.io' {
  interface Socket extends SocketIOSocket {
    user?: {
      id: string;
      [key: string]: any;
    };
  }
} 