/**
 * Tests for the silent token-refresh interceptor in api/client.ts (AUTH-1/2/3).
 *
 * We override apiClient.defaults.adapter to simulate the gateway:
 *   - a request carrying the OLD access token → HTTP 401
 *   - a request carrying the NEW access token → HTTP 200
 * and we spy on the bare `axios.post` used by performRefresh().
 */
import axios, { type AxiosError, type AxiosResponse } from 'axios';

import { apiClient } from '../client';
import { useAuthStore, type JwtPayload } from '../../store/authStore';

const USER: JwtPayload = {
  sub: 'u1',
  email: 'op@acme.test',
  role: 'OPERATOR',
  tenantId: 't1',
};

/** Build an AxiosError-shaped rejection the response interceptor understands. */
function reject401(config: AxiosError['config']): Promise<never> {
  const err = new Error('Unauthorized') as AxiosError;
  err.isAxiosError = true;
  err.config = config;
  err.response = {
    status: 401,
    data: {},
    statusText: 'Unauthorized',
    headers: {},
    config: config!,
  } as AxiosResponse;
  return Promise.reject(err);
}

function ok(config: NonNullable<AxiosError['config']>): Promise<AxiosResponse> {
  return Promise.resolve({
    data: { data: [] },
    status: 200,
    statusText: 'OK',
    headers: {},
    config,
  } as AxiosResponse);
}

beforeEach(() => {
  jest.restoreAllMocks();
  useAuthStore.setState({ token: 'old', refreshToken: 'r1', user: USER });
});

describe('silent token refresh', () => {
  it('refreshes on 401 and replays the original request with the new token', async () => {
    const postSpy = jest
      .spyOn(axios, 'post')
      .mockResolvedValue({
        data: { accessToken: 'new-access', refreshToken: 'r2', user: USER },
      } as AxiosResponse);

    let calls = 0;
    apiClient.defaults.adapter = (config) => {
      calls += 1;
      const auth = config.headers?.Authorization;
      return auth === 'Bearer new-access' ? ok(config) : reject401(config);
    };

    const res = await apiClient.get('/api/v1/controls/tasks');

    expect(res.status).toBe(200);
    expect(calls).toBe(2); // first 401, then retried 200
    expect(postSpy).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/auth/refresh'),
      { refreshToken: 'r1' },
      expect.anything(),
    );
    // Rotated tokens persisted in the store
    expect(useAuthStore.getState().token).toBe('new-access');
    expect(useAuthStore.getState().refreshToken).toBe('r2');
  });

  it('uses a single refresh round-trip for concurrent 401s (single-flight)', async () => {
    const postSpy = jest
      .spyOn(axios, 'post')
      .mockResolvedValue({
        data: { accessToken: 'new-access', refreshToken: 'r2', user: USER },
      } as AxiosResponse);

    apiClient.defaults.adapter = (config) => {
      const auth = config.headers?.Authorization;
      return auth === 'Bearer new-access' ? ok(config) : reject401(config);
    };

    await Promise.all([
      apiClient.get('/api/v1/controls/tasks'),
      apiClient.get('/api/v1/nonconformities'),
      apiClient.get('/api/v1/dlc/labels/expiring-today'),
    ]);

    expect(postSpy).toHaveBeenCalledTimes(1);
  });

  it('logs out when the refresh token is rejected', async () => {
    jest.spyOn(axios, 'post').mockRejectedValue(new Error('refresh expired'));

    apiClient.defaults.adapter = (config) => reject401(config);

    await expect(apiClient.get('/api/v1/controls/tasks')).rejects.toBeDefined();

    expect(useAuthStore.getState().token).toBeNull();
    expect(useAuthStore.getState().refreshToken).toBeNull();
  });
});
