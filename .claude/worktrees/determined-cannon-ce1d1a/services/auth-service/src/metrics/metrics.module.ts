import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';

// ARCH-DECISION: Using @willsoto/nestjs-prometheus which wraps prom-client.
// Exposes GET /metrics endpoint (default) consumed by Prometheus scraper.
// Default metrics include: process CPU, memory, event loop lag, HTTP request duration.
@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
})
export class MetricsModule {}
