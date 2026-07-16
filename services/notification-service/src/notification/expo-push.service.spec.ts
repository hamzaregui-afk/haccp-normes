import { ExpoPushService } from './expo-push.service';

describe('ExpoPushService', () => {
  let service: ExpoPushService;
  const realFetch = global.fetch;

  beforeEach(() => {
    service = new ExpoPushService();
    global.fetch = jest.fn();
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.clearAllMocks();
  });

  it('skips tokens that are not Expo push tokens (never calls the API)', async () => {
    const invalid = await service.send(['not-a-token', 'fcm:xyz'], { title: 'T', body: 'B' });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(invalid).toEqual([]);
  });

  it('POSTs valid tokens to the Expo endpoint with title/body/data', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({ data: [{ status: 'ok' }] }),
    });

    await service.send(['ExponentPushToken[abc]'], { title: 'Titre', body: 'Corps', data: { type: 'nc-created' } });

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
    expect(url).toContain('exp.host/--/api/v2/push/send');
    const body = JSON.parse(opts.body as string) as Array<Record<string, unknown>>;
    expect(body[0]).toMatchObject({ to: 'ExponentPushToken[abc]', title: 'Titre', body: 'Corps' });
  });

  it('returns tokens Expo reports as DeviceNotRegistered for purging', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [
          { status: 'error', details: { error: 'DeviceNotRegistered' } },
          { status: 'ok' },
        ],
      }),
    });

    const invalid = await service.send(
      ['ExponentPushToken[dead]', 'ExponentPushToken[live]'],
      { title: 'T', body: 'B' },
    );

    expect(invalid).toEqual(['ExponentPushToken[dead]']);
  });

  it('never throws when the network call fails (returns empty invalid list)', async () => {
    (global.fetch as jest.Mock).mockRejectedValue(new Error('network down'));
    const invalid = await service.send(['ExponentPushToken[abc]'], { title: 'T', body: 'B' });
    expect(invalid).toEqual([]);
  });
});
