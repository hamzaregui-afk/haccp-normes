import net from 'net';
import os from 'os';
import { execSync } from 'child_process';
import { log } from './logger';

export interface PrinterInfo {
  name:        string;
  description: string;
  isDefault:   boolean;
}

// ── USB / Local printer discovery ─────────────────────────────────────────────

export function discoverLocalPrinters(): PrinterInfo[] {
  try {
    if (os.platform() === 'win32') {
      // PowerShell: list all printers
      const raw = execSync(
        'powershell -Command "Get-Printer | Select-Object Name,DriverName,Default | ConvertTo-Json"',
        { timeout: 8_000, encoding: 'utf8' },
      );
      const parsed = JSON.parse(raw) as Array<{ Name: string; DriverName: string; Default: boolean }>;
      const items  = Array.isArray(parsed) ? parsed : [parsed];
      return items.map((p) => ({
        name:        p.Name,
        description: p.DriverName,
        isDefault:   p.Default,
      }));
    } else if (os.platform() === 'linux') {
      const raw = execSync('lpstat -v 2>/dev/null || echo ""', { encoding: 'utf8' });
      return raw
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const name = line.split(' ')[2]?.replace(':', '') ?? line;
          return { name, description: line, isDefault: false };
        });
    }
  } catch (err) {
    log.warn(`Printer discovery failed: ${String(err)}`);
  }
  return [];
}

// ── TCP / Network printing ────────────────────────────────────────────────────

export function sendZplOverTcp(
  ip: string,
  port: number,
  zpl: string,
  timeoutMs = 15_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timer  = setTimeout(() => {
      socket.destroy();
      reject(new Error(`TCP timeout after ${timeoutMs}ms (${ip}:${port})`));
    }, timeoutMs);

    socket.connect(port, ip, () => {
      socket.write(Buffer.from(zpl, 'utf8'), (err) => {
        if (err) { clearTimeout(timer); socket.destroy(); reject(err); return; }
        socket.end();
      });
    });

    socket.on('close', () => { clearTimeout(timer); resolve(); });
    socket.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

// ── Windows raw printing via print command ────────────────────────────────────

export function sendZplToWindowsPrinter(printerName: string, zpl: string): void {
  if (os.platform() !== 'win32') {
    throw new Error('Windows raw printing only supported on win32');
  }
  const fs  = require('fs') as typeof import('fs');
  const tmp = require('os').tmpdir() as string;
  const file = `${tmp}\\haccp_label_${Date.now()}.zpl`;
  fs.writeFileSync(file, zpl, 'binary');
  // RAW printing via print command — works with most ZPL-compatible drivers
  execSync(`print /D:"${printerName}" "${file}"`, { timeout: 10_000 });
  try { fs.unlinkSync(file); } catch { /* best-effort cleanup */ }
}

// ── Linux CUPS / lpr printing ─────────────────────────────────────────────────

export function sendZplToLinuxPrinter(printerName: string, zpl: string): void {
  const { writeFileSync, unlinkSync } = require('fs') as typeof import('fs');
  const tmp  = require('os').tmpdir() as string;
  const file = `${tmp}/haccp_label_${Date.now()}.zpl`;
  writeFileSync(file, zpl, 'binary');
  execSync(`lpr -P "${printerName}" -o raw "${file}"`, { timeout: 10_000 });
  try { unlinkSync(file); } catch { /* best-effort */ }
}
