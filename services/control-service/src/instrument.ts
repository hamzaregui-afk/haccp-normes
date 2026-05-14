/**
 * instrument.ts — OpenTelemetry bootstrap for control-service
 *
 * ARCH-DECISION: This file is loaded via `node -r ./dist/instrument dist/main`
 * BEFORE any application code. This is the only way to ensure OTel patches
 * are applied to pg, axios, amqplib, and ioredis before those modules load.
 *
 * If initTracing() is called inside NestFactory.create() it is already too late
 * for auto-instrumentation monkey-patching on HTTP and database clients.
 *
 * To activate tracing for this service:
 *   1. Install OTel packages (see shared-utils/src/tracing.ts for the list)
 *   2. Change the "start" script in package.json to:
 *        "node -r ./dist/instrument dist/main"
 *   3. Set OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318 in the container env
 *   4. Set OTEL_SDK_DISABLED=false (default when the env var is absent)
 */
import { initTracing } from '@haccp/shared-utils';

initTracing('control-service');
