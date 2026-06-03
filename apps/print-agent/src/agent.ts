/**
 * NORMES HACCP — Local Print Agent
 *
 * Runs on a Windows/Linux/macOS PC connected to a USB or network thermal printer.
 * Polls the HACCP SaaS API for PENDING print jobs assigned to this printer,
 * sends ZPL to the printer, and reports COMPLETED or FAILED status back.
 *
 * Usage:
 *   1. Copy .env.example to .env and fill in API URL + credentials
 *   2. npm install && npm run build && npm start
 *   3. On first run: follow the interactive setup to register your printer
 *
 * Build standalone .exe (Windows):
 *   npm run pkg:win
 */

import axios from 'axios';
import os from 'os';
import readline from 'readline';
import { loadConfig, savePrinterId, AgentConfig } from './config';
import { ensureToken, login } from './auth';
import { log, setLogLevel } from './logger';
import {
  discoverLocalPrinters,
  sendZplOverTcp,
  sendZplToWindowsPrinter,
  sendZplToLinuxPrinter,
  PrinterInfo,
} from './raw-print';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApiPrinter {
  id:             string;
  name:           string;
  connectionType: 'NETWORK' | 'BLUETOOTH' | 'USB';
  ipAddress:      string | null;
  port:           number | null;
  isDefault:      boolean;
  isActive:       boolean;
}

interface PrintJob {
  id:        string;
  labelType: string;
  zpl:       string | null;
  payload:   Record<string, unknown>;
  copies:    number;
  printer:   ApiPrinter | null;
}

interface ApiResponse<T> { data: T; }

// ─── API helpers ──────────────────────────────────────────────────────────────

async function apiGet<T>(cfg: AgentConfig, path: string): Promise<T> {
  const token = await ensureToken(cfg);
  const res   = await axios.get<ApiResponse<T>>(`${cfg.apiUrl}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10_000,
  });
  return res.data.data;
}

async function apiPost<T>(cfg: AgentConfig, path: string, body: unknown): Promise<T> {
  const token = await ensureToken(cfg);
  const res   = await axios.post<ApiResponse<T>>(`${cfg.apiUrl}${path}`, body, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10_000,
  });
  return res.data.data;
}

async function apiPatch(cfg: AgentConfig, path: string, body: unknown): Promise<void> {
  const token = await ensureToken(cfg);
  await axios.patch(`${cfg.apiUrl}${path}`, body, {
    headers: { Authorization: `Bearer ${token}` },
    timeout: 10_000,
  });
}

// ─── Printer registration ─────────────────────────────────────────────────────

async function registerPrinter(cfg: AgentConfig, local: PrinterInfo): Promise<string> {
  log.info(`Registering printer "${local.name}" with HACCP SaaS…`);
  const printer = await apiPost<ApiPrinter>(cfg, '/api/v1/printers', {
    name:           `[Agent] ${local.name} (${os.hostname()})`,
    model:          local.description,
    connectionType: 'USB',
    isDefault:      local.isDefault,
  });
  savePrinterId(printer.id);
  log.info(`Printer registered — ID: ${printer.id}`);
  return printer.id;
}

// ─── Interactive setup on first run ──────────────────────────────────────────

async function interactiveSetup(cfg: AgentConfig): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q: string): Promise<string> =>
    new Promise((resolve) => rl.question(q, resolve));

  console.log('\n═══════════════════════════════════════════════════');
  console.log('  NORMES HACCP — Local Print Agent — First-run setup');
  console.log('═══════════════════════════════════════════════════\n');

  const printers = discoverLocalPrinters();

  if (printers.length === 0) {
    console.log('⚠️  No local printers detected. Registering a generic USB printer entry.');
    rl.close();
    return registerPrinter(cfg, { name: 'USB Printer', description: 'Generic', isDefault: false });
  }

  console.log('Detected printers:');
  printers.forEach((p, i) =>
    console.log(`  [${i + 1}] ${p.name}${p.isDefault ? ' (default)' : ''}`),
  );

  const choice = await ask('\nSelect printer number (or press Enter for #1): ');
  const idx    = Math.max(0, parseInt(choice, 10) - 1) || 0;
  const chosen = printers[Math.min(idx, printers.length - 1)];

  rl.close();

  if (!chosen) throw new Error('No printer selected');

  console.log(`\n✅ Selected: ${chosen.name}`);
  return registerPrinter(cfg, chosen);
}

// ─── Print a single job ───────────────────────────────────────────────────────

async function executeJob(cfg: AgentConfig, job: PrintJob): Promise<void> {
  const zpl = job.zpl;
  if (!zpl) {
    throw new Error(`Job ${job.id} has no ZPL content`);
  }

  const printer = job.printer;
  if (!printer) {
    throw new Error(`Job ${job.id} has no printer attached`);
  }

  // Repeat ZPL for copies (ZPL ^PQ command handles this server-side but we
  // support legacy jobs that set copies at the job level)
  const finalZpl = job.copies > 1
    ? zpl.replace(/\^PQ\d+/g, `^PQ${job.copies}`)
    : zpl;

  if (printer.connectionType === 'NETWORK' && printer.ipAddress) {
    log.info(`TCP → ${printer.ipAddress}:${printer.port ?? 9100} (job ${job.id})`);
    await sendZplOverTcp(printer.ipAddress, printer.port ?? 9100, finalZpl);
  } else if (printer.connectionType === 'USB') {
    // For USB printers managed by this agent, use the local printer name
    const printerName = printer.name.replace(/^\[Agent\] /, '').split(' (')[0];
    log.info(`USB → "${printerName}" (job ${job.id})`);
    if (os.platform() === 'win32') {
      sendZplToWindowsPrinter(printerName, finalZpl);
    } else {
      sendZplToLinuxPrinter(printerName, finalZpl);
    }
  } else {
    throw new Error(`Unsupported connection type: ${printer.connectionType}`);
  }
}

// ─── Poll loop ────────────────────────────────────────────────────────────────

async function poll(cfg: AgentConfig, printerId: string): Promise<void> {
  log.debug(`Polling for pending jobs (printer ${printerId})…`);

  let jobs: PrintJob[] = [];
  try {
    jobs = await apiGet<PrintJob[]>(
      cfg,
      `/api/v1/print-jobs?status=PENDING&printerId=${printerId}&limit=10`,
    );
  } catch (err) {
    log.warn(`Poll failed: ${String(err)}`);
    return;
  }

  if (jobs.length === 0) { log.debug('No pending jobs'); return; }

  log.info(`Found ${jobs.length} pending job(s)`);

  for (const job of jobs) {
    // Mark as PROCESSING
    try {
      await apiPatch(cfg, `/api/v1/print-jobs/${job.id}`, { status: 'PROCESSING' });
    } catch {
      log.warn(`Could not mark job ${job.id} as PROCESSING — skipping`);
      continue;
    }

    // Execute
    try {
      await executeJob(cfg, job);
      await apiPatch(cfg, `/api/v1/print-jobs/${job.id}`, { status: 'COMPLETED' });
      log.info(`✅ Job ${job.id} printed successfully`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.error(`❌ Job ${job.id} failed: ${msg}`);
      await apiPatch(cfg, `/api/v1/print-jobs/${job.id}`, {
        status: 'FAILED',
        errorMessage: msg.slice(0, 500),
      }).catch(() => {/* best-effort */});
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log('🖨️  NORMES HACCP — Local Print Agent v1.0.0');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const cfg = loadConfig();
  setLogLevel(cfg.logLevel);

  log.info(`API URL:       ${cfg.apiUrl}`);
  log.info(`Poll interval: ${cfg.pollIntervalMs}ms`);
  log.info(`Platform:      ${os.platform()} / ${os.hostname()}`);

  // Authenticate
  await login(cfg);

  // Register printer if first run
  let printerId = cfg.printerId;
  if (!printerId) {
    printerId = await interactiveSetup(cfg);
    cfg.printerId = printerId;
  } else {
    log.info(`Using registered printer ID: ${printerId}`);
  }

  log.info('Agent started — polling for jobs…\n');

  // Graceful shutdown
  let running = true;
  process.on('SIGINT',  () => { log.info('Shutting down…'); running = false; });
  process.on('SIGTERM', () => { log.info('Shutting down…'); running = false; });

  while (running) {
    await poll(cfg, printerId).catch((err) =>
      log.error(`Unexpected poll error: ${String(err)}`),
    );
    await new Promise((r) => setTimeout(r, cfg.pollIntervalMs));
  }

  log.info('Agent stopped.');
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
