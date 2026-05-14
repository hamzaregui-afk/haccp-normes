/**
 * tracing.ts — OpenTelemetry SDK initialization
 *
 * ARCH-DECISION: This module must be loaded BEFORE any other imports in the
 * service entry point so the OTel auto-instrumentations can monkey-patch HTTP,
 * Prisma, AMQP, and Redis clients. The pattern for each service is:
 *
 *   // services/<name>/src/instrument.ts  ← NEW file, loaded via --require
 *   import { initTracing } from '@haccp/shared-utils/tracing';
 *   initTracing(process.env.OTEL_SERVICE_NAME ?? 'unknown');
 *
 *   // services/<name>/package.json — update "start" script:
 *   "start": "node -r ./dist/instrument dist/main"
 *
 * ARCH-DECISION: We use the OTLP HTTP exporter pointing at Jaeger's OTLP
 * endpoint (port 4318). This is the vendor-neutral standard export format,
 * making it trivial to swap Jaeger for Tempo, Honeycomb, or Datadog later.
 *
 * ARCH-DECISION: Auto-instrumentations are included for:
 *   - @opentelemetry/instrumentation-http       (all inbound/outbound HTTP)
 *   - @opentelemetry/instrumentation-express    (route-level spans)
 *   - @opentelemetry/instrumentation-pg         (PostgreSQL queries via pg driver)
 *   - @opentelemetry/instrumentation-ioredis    (Redis commands)
 *   - @opentelemetry/instrumentation-amqplib    (RabbitMQ publish/consume)
 *
 * ARCH-DECISION: All require() calls below use plain `any` instead of
 * `typeof import('@opentelemetry/...')`. This is intentional — shared-utils
 * deliberately does NOT list OTel packages as dependencies so they remain
 * optional. Using `typeof import(...)` would force TSC to resolve those type
 * declarations at build time even though the packages may not be installed.
 * Services that want full type-safety can install the OTel packages themselves
 * and cast the result at the call site.
 *
 * Required peer dependencies (add to each service that opts in):
 *   @opentelemetry/sdk-node@^0.50.0
 *   @opentelemetry/auto-instrumentations-node@^0.44.0
 *   @opentelemetry/exporter-trace-otlp-http@^0.50.0
 *   @opentelemetry/resources@^1.23.0
 *   @opentelemetry/semantic-conventions@^1.23.0
 */

/** Initialise the OTel SDK. Call this as the very first statement in the process. */
export function initTracing(serviceName: string): void {
  // Guard: skip if OTel is disabled
  if (process.env['OTEL_SDK_DISABLED'] === 'true') return;

  try {
    // Dynamic require keeps this module importable in services that haven't
    // installed the OTel packages — they simply won't have tracing active.
    // All casts are `any` to avoid a compile-time dependency on OTel types.
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { NodeSDK }                   = require('@opentelemetry/sdk-node')                       as any;
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { OTLPTraceExporter }         = require('@opentelemetry/exporter-trace-otlp-http')       as any;
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node')   as any;
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const { Resource }                  = require('@opentelemetry/resources')                      as any;
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any
    const semconv                        = require('@opentelemetry/semantic-conventions')           as any;

    const SEMRESATTRS_SERVICE_NAME           = semconv.SEMRESATTRS_SERVICE_NAME           as string;
    const SEMRESATTRS_SERVICE_VERSION        = semconv.SEMRESATTRS_SERVICE_VERSION        as string;
    const SEMRESATTRS_DEPLOYMENT_ENVIRONMENT = semconv.SEMRESATTRS_DEPLOYMENT_ENVIRONMENT as string;

    const otlpEndpoint =
      process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://jaeger:4318';

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
    const sdk = new NodeSDK({
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
      resource: new Resource({
        [SEMRESATTRS_SERVICE_NAME]:            serviceName,
        [SEMRESATTRS_SERVICE_VERSION]:         process.env['npm_package_version'] ?? '0.1.0',
        [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:  process.env['NODE_ENV'] ?? 'development',
      }),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-assignment
      traceExporter: new OTLPTraceExporter({
        url: `${otlpEndpoint}/v1/traces`,
      }),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call
      instrumentations: [
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        getNodeAutoInstrumentations({
          // Suppress noisy spans from health-check polling
          '@opentelemetry/instrumentation-http': {
            ignoreIncomingRequestHook: (req: { url?: string }) => {
              const url = req.url ?? '';
              return url === '/health' || url.startsWith('/metrics');
            },
          },
          // Disable fs instrumentation — extremely noisy in Node.js
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    sdk.start();

    // Graceful SDK shutdown on process exit so pending spans are flushed
    process.on('SIGTERM', () => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
      void sdk.shutdown();
    });

    console.info(
      `[Tracing] OpenTelemetry started for "${serviceName}" → ${otlpEndpoint}`,
    );
  } catch (err) {
    // Missing packages → tracing simply doesn't start; service runs normally
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn('[Tracing] OTel packages not installed — tracing disabled:', (err as Error).message);
    }
  }
}
