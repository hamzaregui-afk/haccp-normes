import fs from 'fs';
import path from 'path';
import os from 'os';

export interface AgentConfig {
  apiUrl:         string;
  email:          string;
  password:       string;
  pollIntervalMs: number;
  logLevel:       string;
  printerId?:     string; // set after registration
}

const CONFIG_DIR  = path.join(os.homedir(), '.haccp-print-agent');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function loadConfig(): AgentConfig {
  // Priority: .env file in cwd, then saved config, then env vars
  const envPath = path.join(process.cwd(), '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
      const m = line.match(/^([A-Z_]+)=(.+)$/);
      if (m) process.env[m[1]] = m[2].trim();
    }
  }

  let savedPrinterId: string | undefined;
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as { printerId?: string };
      savedPrinterId = saved.printerId;
    } catch { /* ignore */ }
  }

  const cfg: AgentConfig = {
    apiUrl:         process.env['HACCP_API_URL']    ?? 'http://localhost',
    email:          process.env['HACCP_EMAIL']       ?? '',
    password:       process.env['HACCP_PASSWORD']    ?? '',
    pollIntervalMs: parseInt(process.env['POLL_INTERVAL_MS'] ?? '5000', 10),
    logLevel:       process.env['LOG_LEVEL']         ?? 'info',
    printerId:      savedPrinterId,
  };

  if (!cfg.email || !cfg.password) {
    throw new Error('HACCP_EMAIL and HACCP_PASSWORD must be set in .env');
  }

  return cfg;
}

export function savePrinterId(printerId: string): void {
  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  fs.writeFileSync(CONFIG_FILE, JSON.stringify({ printerId }, null, 2));
}
