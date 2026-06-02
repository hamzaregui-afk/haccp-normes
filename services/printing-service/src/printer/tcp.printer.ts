/**
 * tcp.printer.ts
 *
 * Thin TCP socket client for sending ZPL II byte streams to network-connected
 * thermal printers (Zebra, TSC, etc.) that listen on a raw TCP socket.
 *
 * ARCH-DECISION: We use Node's built-in `net` module rather than a third-party
 * library to keep this dependency-free. The connection is opened per-job,
 * so there is no persistent connection state to manage — important for a
 * stateless micro-service that may run as multiple replicas.
 *
 * ARCH-DECISION: A hard `timeoutMs` is enforced on the socket. Without it, a
 * printer that goes offline mid-print would leave the request thread hung
 * indefinitely, eventually exhausting the connection pool.
 */

import * as net from 'net';

/**
 * Open a TCP connection to `ipAddress:port`, send the ZPL byte stream,
 * then close the connection gracefully.
 *
 * @param ipAddress  The printer's IP address (IPv4 or IPv6).
 * @param port       The printer's raw TCP port (typically 9100 for Zebra).
 * @param zpl        The ZPL II string to transmit.
 * @param timeoutMs  Maximum time (ms) to wait for the connection + write.
 *                   Defaults to 10 000 ms.
 *
 * @throws Error if the connection is refused, times out, or the socket errors.
 */
export async function sendZplOverTcp(
  ipAddress: string,
  port: number,
  zpl: string,
  timeoutMs = 10_000,
): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    const socket = new net.Socket();
    let settled  = false;

    // ── Settle helpers — ensure we only resolve/reject once ──────────────
    const settle = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (err) reject(err);
      else     resolve();
    };

    // ── Timeout ───────────────────────────────────────────────────────────
    socket.setTimeout(timeoutMs);
    socket.on('timeout', () => {
      settle(new Error(`TCP printer timeout after ${timeoutMs}ms (${ipAddress}:${port})`));
    });

    // ── Error ─────────────────────────────────────────────────────────────
    socket.on('error', (err) => {
      settle(err);
    });

    // ── Connect ───────────────────────────────────────────────────────────
    socket.connect(port, ipAddress, () => {
      // Write the ZPL bytes; 'utf8' covers standard ASCII + Latin-1 subset used in ZPL
      socket.write(zpl, 'utf8', (writeErr?: Error | null) => {
        if (writeErr) {
          settle(writeErr);
          return;
        }
        // Half-close: signal end-of-transmission so the printer flushes its buffer.
        socket.end();
      });
    });

    // ── Graceful close confirmation ────────────────────────────────────────
    socket.on('close', () => {
      settle(); // no-op if already settled via error
    });
  });
}
