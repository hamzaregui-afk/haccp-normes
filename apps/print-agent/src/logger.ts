import fs from 'fs';
import path from 'path';
import os from 'os';

const LOG_FILE = path.join(os.homedir(), '.haccp-print-agent', 'agent.log');
const MAX_LOG_BYTES = 5 * 1024 * 1024; // 5 MB rotation

let logLevel = 'info';
const LEVELS: Record<string, number> = { debug: 0, info: 1, warn: 2, error: 3 };

export function setLogLevel(level: string): void { logLevel = level; }

function write(level: string, msg: string): void {
  if ((LEVELS[level] ?? 0) < (LEVELS[logLevel] ?? 1)) return;
  const line = `[${new Date().toISOString()}] [${level.toUpperCase()}] ${msg}\n`;
  process.stdout.write(line);
  try {
    if (fs.existsSync(LOG_FILE) && fs.statSync(LOG_FILE).size > MAX_LOG_BYTES) {
      fs.renameSync(LOG_FILE, LOG_FILE + '.old');
    }
    fs.mkdirSync(path.dirname(LOG_FILE), { recursive: true });
    fs.appendFileSync(LOG_FILE, line);
  } catch { /* best-effort */ }
}

export const log = {
  debug: (msg: string) => write('debug', msg),
  info:  (msg: string) => write('info',  msg),
  warn:  (msg: string) => write('warn',  msg),
  error: (msg: string) => write('error', msg),
};
