import { PrintNodeProvider } from '../printnode.provider';
import type { PrintDispatchInput } from '../print-provider.interface';

const printer = (over: Record<string, unknown> = {}) =>
  ({ id: 'p1', name: 'Cuisine', provider: 'PRINTNODE', printNodePrinterId: 999, ...over } as never);

const input = (over: Partial<PrintDispatchInput> = {}): PrintDispatchInput =>
  ({ jobId: 'j', tenantId: 't', printer: printer(), zpl: '^XA^XZ', printNode: { apiKey: 'pk' }, ...over } as PrintDispatchInput);

describe('PrintNodeProvider', () => {
  const provider = new PrintNodeProvider();
  let fetchSpy: jest.SpyInstance | undefined;
  afterEach(() => { fetchSpy?.mockRestore(); fetchSpy = undefined; });

  it('supports only printers whose provider is PRINTNODE', () => {
    expect(provider.supports(printer())).toBe(true);
    expect(provider.supports(printer({ provider: null }))).toBe(false);
    expect(provider.supports(printer({ provider: 'NETWORK' }))).toBe(false);
  });

  it('COMPLETED when PrintNode accepts the job (201) — posts base64 raw content + Basic auth', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 201, text: async () => '' } as never);
    const res = await provider.dispatch(input());
    expect(res).toEqual({ outcome: 'COMPLETED' });

    const [url, opts] = fetchSpy.mock.calls[0] as [string, { body: string; headers: Record<string, string> }];
    expect(url).toContain('api.printnode.com');
    const body = JSON.parse(opts.body) as { printerId: number; contentType: string; content: string };
    expect(body.printerId).toBe(999);
    expect(body.contentType).toBe('raw_base64');
    expect(Buffer.from(body.content, 'base64').toString('utf8')).toBe('^XA^XZ');
    expect(opts.headers.Authorization).toMatch(/^Basic /);
  });

  it('FAILED when PrintNode rejects (non-2xx)', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401, text: async () => 'bad key' } as never);
    expect((await provider.dispatch(input())).outcome).toBe('FAILED');
  });

  it('FAILED and no PrintNode call when the api key is missing', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 201, text: async () => '' } as never);
    expect((await provider.dispatch(input({ printNode: undefined }))).outcome).toBe('FAILED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('FAILED and no PrintNode call when the printer has no PrintNode printer id', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 201, text: async () => '' } as never);
    expect((await provider.dispatch(input({ printer: printer({ printNodePrinterId: null }) }))).outcome).toBe('FAILED');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  // ── Enumeration / validation ────────────────────────────────────────────────
  it('describe() advertises PrintNode as an API-key provider that lists printers', () => {
    const d = provider.describe();
    expect(d.key).toBe('PRINTNODE');
    expect(d.requiresApiKey).toBe(true);
    expect(d.listsPrinters).toBe(true);
    expect(d.fields.map((f) => f.name)).toEqual(expect.arrayContaining(['providerComputerId', 'printNodePrinterId']));
  });

  it('testConnection → ok when whoami succeeds (counts computers)', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockImplementation((url: string | URL | Request) => {
      const u = String(url);
      if (u.endsWith('/whoami'))    return Promise.resolve({ ok: true, status: 200, json: async () => ({ id: 1 }) } as never);
      if (u.endsWith('/computers')) return Promise.resolve({ ok: true, status: 200, json: async () => [{ id: 5, name: 'PC-1', state: 'connected' }] } as never);
      return Promise.resolve({ ok: false, status: 404 } as never);
    });
    const res = await provider.testConnection('pk');
    expect(res.ok).toBe(true);
    expect(res.computerCount).toBe(1);
  });

  it('testConnection → not ok on 401 (invalid key)', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: false, status: 401 } as never);
    expect((await provider.testConnection('bad')).ok).toBe(false);
  });

  it('listComputers maps the PrintNode computers', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: 7, name: 'Cuisine-PC', state: 'connected' }] } as never);
    expect(await provider.listComputers('pk')).toEqual([{ id: 7, name: 'Cuisine-PC', state: 'connected' }]);
  });

  it('listPrinters(computerId) maps printers with their computer id', async () => {
    fetchSpy = jest.spyOn(globalThis, 'fetch').mockResolvedValue({ ok: true, status: 200, json: async () => [{ id: 42, name: 'Gprinter', state: 'online', computer: { id: 7 } }] } as never);
    expect(await provider.listPrinters('pk', 7)).toEqual([{ id: 42, name: 'Gprinter', computerId: 7, state: 'online' }]);
  });
});
