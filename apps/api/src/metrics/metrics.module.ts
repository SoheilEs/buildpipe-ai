import { Module } from '@nestjs/common';
import {
  PrometheusModule,
  makeCounterProvider,
  makeHistogramProvider,
} from '@willsoto/nestjs-prometheus';

@Module({
  imports: [
    PrometheusModule.register({
      path: '/metrics',
      defaultMetrics: { enabled: true },
    }),
  ],
  providers: [
    makeCounterProvider({
      name: 'http_requests_total',
      help: 'Total HTTP requests',
      labelNames: ['method', 'route', 'status'],
    }),
    makeHistogramProvider({
      name: 'incident_analysis_duration_seconds',
      help: 'Incident analysis duration',
      labelNames: ['provider'],
    }),
    makeCounterProvider({
      name: 'queue_job_failures_total',
      help: 'Queue job failures',
      labelNames: ['queue', 'job'],
    }),
  ],
  exports: [PrometheusModule],
})
export class MetricsModule {}
