import { io, type Socket } from 'socket.io-client';

import { useAuthStore } from '@/store/auth.store';

// ARCH-DECISION: Single shared socket instance (singleton).
// Reconnects automatically when the access token changes after a refresh.
// Components subscribe via useEffect + cleanup — never create their own socket.

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(import.meta.env.VITE_WS_URL ?? 'http://localhost:8080', {
      autoConnect: false,
      auth: (cb) => {
        cb({ token: useAuthStore.getState().accessToken });
      },
    });
  }
  return socket;
};

export const connectSocket = (): void => {
  getSocket().connect();
};

export const disconnectSocket = (): void => {
  socket?.disconnect();
  socket = null;
};
