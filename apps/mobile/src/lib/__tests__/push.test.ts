/**
 * push.test.ts — Expo push registration logic.
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockGetPermissions     = jest.fn();
const mockRequestPermissions  = jest.fn();
const mockGetToken           = jest.fn();

jest.mock('expo-notifications', () => ({
  setNotificationHandler:      jest.fn(),
  getPermissionsAsync:         (...a: unknown[]) => mockGetPermissions(...a),
  requestPermissionsAsync:     (...a: unknown[]) => mockRequestPermissions(...a),
  getExpoPushTokenAsync:       (...a: unknown[]) => mockGetToken(...a),
}));

const mockPost   = jest.fn();
const mockDelete = jest.fn();
jest.mock('../../api/client', () => ({
  apiClient: { post: (...a: unknown[]) => mockPost(...a), delete: (...a: unknown[]) => mockDelete(...a) },
}));

import { registerForPush, unregisterForPush } from '../push';

const TOKEN = 'ExponentPushToken[abc123]';

beforeEach(() => {
  jest.clearAllMocks();
  mockPost.mockResolvedValue({ data: {} });
  mockDelete.mockResolvedValue({ data: {} });
});

describe('registerForPush', () => {
  it('registers the token when permission is already granted', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted' });
    mockGetToken.mockResolvedValue({ data: TOKEN });

    await registerForPush();

    expect(mockRequestPermissions).not.toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalledWith(
      '/api/v1/notifications/devices',
      expect.objectContaining({ expoPushToken: TOKEN, platform: expect.any(String) }),
    );
  });

  it('requests permission when not yet granted', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'undetermined' });
    mockRequestPermissions.mockResolvedValue({ status: 'granted' });
    mockGetToken.mockResolvedValue({ data: 'ExponentPushToken[xyz]' });

    await registerForPush();

    expect(mockRequestPermissions).toHaveBeenCalled();
    expect(mockPost).toHaveBeenCalled();
  });

  it('does nothing when permission is denied', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'denied' });
    mockRequestPermissions.mockResolvedValue({ status: 'denied' });

    await registerForPush();

    expect(mockGetToken).not.toHaveBeenCalled();
    expect(mockPost).not.toHaveBeenCalled();
  });

  it('never throws if the API call fails', async () => {
    mockGetPermissions.mockResolvedValue({ status: 'granted' });
    mockGetToken.mockResolvedValue({ data: 'ExponentPushToken[fail]' });
    mockPost.mockRejectedValue(new Error('network'));

    await expect(registerForPush()).resolves.toBeUndefined();
  });
});

describe('unregisterForPush', () => {
  it('deletes the previously-registered token', async () => {
    // First register so there is a token to remove.
    mockGetPermissions.mockResolvedValue({ status: 'granted' });
    mockGetToken.mockResolvedValue({ data: TOKEN });
    await registerForPush();

    await unregisterForPush();

    expect(mockDelete).toHaveBeenCalledWith(
      '/api/v1/notifications/devices',
      expect.objectContaining({ data: { expoPushToken: TOKEN } }),
    );
  });
});
