import * as k8s from '@kubernetes/client-node';
import { createCoreV1Api, EventSummary, K8sClientFactory, stripSecretPatterns } from '../types';

export class LogsService {
  constructor(private factory: K8sClientFactory) {}

  async getPodLogs(
    kubeconfig: string,
    namespace: string,
    podName: string,
    options: { tailLines?: number; container?: string; sinceSeconds?: number } = {},
    context?: string,
  ): Promise<string> {
    const kc = this.factory.getClient(kubeconfig, context);
    const api = createCoreV1Api(kc);

    const logs = await api.readNamespacedPodLog({
      name: podName,
      namespace,
      tailLines: options.tailLines ?? 200,
      container: options.container,
      sinceSeconds: options.sinceSeconds,
    });

    return stripSecretPatterns(typeof logs === 'string' ? logs : String(logs));
  }
}

export class EventsService {
  constructor(private factory: K8sClientFactory) {}

  async listEvents(
    kubeconfig: string,
    namespace?: string,
    fieldSelector?: string,
    context?: string,
  ): Promise<EventSummary[]> {
    const kc = this.factory.getClient(kubeconfig, context);
    const api = createCoreV1Api(kc);

    const response = namespace
      ? await api.listNamespacedEvent({ namespace, fieldSelector })
      : await api.listEventForAllNamespaces({ fieldSelector });

    return (response.items ?? []).map((event: k8s.CoreV1Event) => ({
      type: event.type ?? 'Normal',
      reason: event.reason ?? '',
      message: stripSecretPatterns(event.message ?? ''),
      involvedObject: `${event.involvedObject?.kind}/${event.involvedObject?.name}`,
      namespace: event.metadata?.namespace ?? '',
      timestamp: event.lastTimestamp?.toISOString() ?? event.eventTime?.toISOString(),
      count: event.count,
    }));
  }
}

export class ClusterHealthService {
  constructor(
    private factory: K8sClientFactory,
    private podsService: import('./namespaces-pods-deployments.service').PodsService,
  ) {}

  async checkHealth(kubeconfig: string, context?: string) {
    const kc = this.factory.getClient(kubeconfig, context);
    const versionApi = kc.makeApiClient(k8s.VersionApi);
    const version = await versionApi.getCode();
    const pods = await this.podsService.list(kubeconfig, undefined, context);

    const unhealthy = pods.filter(
      (p) => !p.ready || p.phase !== 'Running' || p.restartCount > 0,
    );

    return {
      connected: true,
      version: version.gitVersion,
      totalPods: pods.length,
      unhealthyPods: unhealthy.length,
      unhealthy: unhealthy.slice(0, 20),
    };
  }
}
