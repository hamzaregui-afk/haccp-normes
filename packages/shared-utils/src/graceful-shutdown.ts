/**
 * graceful-shutdown.ts
 *
 * ARCH-DECISION: Shared shutdown helper so every service gets identical
 * lifecycle behaviour without copy-pasting SIGTERM/SIGINT handlers.
 *
 * NestJS `enableShutdownHooks()` fires `OnApplicationShutdown` lifecycle
 * hooks (e.g. PrismaService.$disconnect, RabbitMQ channel close) BEFORE
 * the process exits. The explicit SIGTERM handler gives K8s pods the chance
 * to finish in-flight requests within the pod's `terminationGracePeriodSeconds`.
 *
 * K8s sends SIGTERM → pods drain → K8s sends SIGKILL after grace period.
 * By calling app.close() on SIGTERM we respect that window.
 *
 * Usage in main.ts (add right after `await app.listen(...)`):
 *   setupGracefulShutdown(app, logger, 'auth-service');
 */

interface ShutdownableApp {
  enableShutdownHooks(): void;
  close(): Promise<void>;
}

type AppLogger = Pick<Console, 'log' | 'error'> & { log(msg: string): void };

export function setupGracefulShutdown(
  app: ShutdownableApp,
  logger: AppLogger,
  serviceName: string,
): void {
  // Let NestJS run OnApplicationShutdown lifecycle hooks on process signals
  app.enableShutdownHooks();

  const shutdown = (signal: string) => {
    logger.log(`[${serviceName}] ${signal} received — starting graceful shutdown`);

    // Give in-flight requests up to 10 s to complete before the process exits.
    // K8s default terminationGracePeriodSeconds is 30 s, so this is safe.
    const forceExit = setTimeout(() => {
      logger.log(`[${serviceName}] forced exit after 10 s drain timeout`);
      process.exit(1);
    }, 10_000);

    // Don't block the event loop — just wait for app.close() to resolve
    forceExit.unref();

    void app
      .close()
      .then(() => {
        logger.log(`[${serviceName}] graceful shutdown complete`);
        process.exit(0);
      })
      .catch((err: unknown) => {
        logger.error(`[${serviceName}] error during shutdown: ${String(err)}`);
        process.exit(1);
      });
  };

  process.once('SIGTERM', () => shutdown('SIGTERM'));
  process.once('SIGINT',  () => shutdown('SIGINT'));
}
