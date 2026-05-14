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
 * Required peer dependencies (add to each service that opts in):
 *   @opentelemetry/sdk-node@^0.50.0
 *   @opentelemetry/auto-instrumentations-node@^0.44.0
 *   @opentelemetry/exporter-trace-otlp-http@^0.50.0
 *   @opentelemetry/resources@^1.23.0
 *   @opentelemetry/semantic-conventions@^1.23.0
 */

/** Initialise the OTel SDK. Call this as the very first statement in the process. */
export function initTracing(serviceName: string): void {
  // Guard: skip if OTel is disabled or the SDK packages are not installed
  if (process.env['OTEL_SDK_DISABLED'] === 'true') return;

  try {
    // Dynamic require keeps this module importable in services that haven't
    // installed the OTel packages yet — they just won't have tracing active.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { NodeSDK }       = require('@opentelemetry/sdk-node') as typeof import('@opentelemetry/sdk-node');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { OTLPTraceExporter } = require('@opentelemetry/exporter-trace-otlp-http') as typeof import('@opentelemetry/exporter-trace-otlp-http');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getNodeAutoInstrumentations } = require('@opentelemetry/auto-instrumentations-node') as typeof import('@opentelemetry/auto-instrumentations-node');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Resource } = require('@opentelemetry/resources') as typeof import('@opentelemetry/resources');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { SEMRESATTRS_SERVICE_NAME, SEMRESATTRS_SERVICE_VERSION, SEMRESATTRS_DEPLOYMENT_ENVIRONMENT } =
      require('@opentelemetry/semantic-conventions') as typeof import('@opentelemetry/semantic-conventions');

    const otlpEndpoint =
      process.env['OTEL_EXPORTER_OTLP_ENDPOINT'] ?? 'http://jaeger:4318';

    const sdk = new NodeSDK({
      resource: new Resource({
        [SEMRESATTRS_SERVICE_NAME]:            serviceName,
        [SEMRESATTRS_SERVICE_VERSION]:         process.env['npm_package_version'] ?? '0.1.0',
        [SEMRESATTRS_DEPLOYMENT_ENVIRONMENT]:  process.env['NODE_ENV'] ?? 'development',
      }),
      traceExporter: new OTLPTraceExporter({
        url: `${otlpEndpoint}/v1/traces`,
      }),
      instrumentations: [
        getNodeAutoInstrumentations({
          // Suppress noisy internal spans (e.g. health-check polling)
          '@opentelemetry/instrumentation-http': {
            ignoreIncomingRequestHook: (req) => {
              const url = (req as { url?: string }).url ?? '';
              return url === '/health' || url.startsWith('/metrics');
            },
          },
          // Disable fs instrumentation — extremely noisy in Node.js
          '@opentelemetry/instrumentation-fs': { enabled: false },
        }),
      ],
    });

    sdk.start();

    // Graceful SDK shutdown on process exit so pending spans are flushed
    process.on('SIGTERM', () => {
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
