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
});
