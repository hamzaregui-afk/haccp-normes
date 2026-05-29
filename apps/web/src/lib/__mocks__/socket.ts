/**
 * Jest mock for @/lib/socket
 *
 * Replaces the real socket.io client (which uses import.meta.env.VITE_WS_URL)
 * with no-op stubs. Component tests that need socket behavior should use
 * jest.spyOn or jest.mock('@/lib/socket') with a custom implementation.
 */
import type { Socket } from 'socket.io-client';

export const getSocket         = jest.fn((): Partial<Socket> => ({ emit: jest.fn(), on: jest.fn(), off: jest.fn() })) as jest.Mock<Partial<Socket>>;
export const connectSocket     = jest.fn();
export const disconnectSocket  = jest.fn();
export const emitWithCorrelation = jest.fn();
export const dedupHandler      = jest.fn(<T>(handler: (data: T) => void) => handler);
