import axios from 'axios';
import { AgentConfig } from './config';
import { log } from './logger';

interface TokenPair { accessToken: string; refreshToken: string; }
interface AuthResponse { data: TokenPair; }

let accessToken  = '';
let refreshToken = '';
let tokenExpiry  = 0;

export async function login(cfg: AgentConfig): Promise<void> {
  log.info(`Authenticating as ${cfg.email} on ${cfg.apiUrl}`);
  const res = await axios.post<AuthResponse>(
    `${cfg.apiUrl}/api/v1/auth/login`,
    { email: cfg.email, password: cfg.password },
    { timeout: 10_000 },
  );
  accessToken  = res.data.data.accessToken;
  refreshToken = res.data.data.refreshToken;
  // JWT expiry is 15m by default — refresh after 12m to be safe
  tokenExpiry  = Date.now() + 12 * 60 * 1_000;
  log.info('Authentication successful');
}

export async function ensureToken(cfg: AgentConfig): Promise<string> {
  if (!accessToken) {
    await login(cfg);
    return accessToken;
  }
  if (Date.now() > tokenExpiry && refreshToken) {
    try {
      log.debug('Refreshing JWT token…');
      const res = await axios.post<{ data: { accessToken: string; refreshToken: string } }>(
        `${cfg.apiUrl}/api/v1/auth/refresh`,
        { refreshToken },
        { timeout: 10_000 },
      );
      accessToken  = res.data.data.accessToken;
      refreshToken = res.data.data.refreshToken;
      tokenExpiry  = Date.now() + 12 * 60 * 1_000;
      log.debug('Token refreshed');
    } catch {
      log.warn('Token refresh failed — re-logging in…');
      await login(cfg);
    }
  }
  return accessToken;
}
