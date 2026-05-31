import * as k8s from '@kubernetes/client-node';
import { createCoreV1Api, K8sClientFactory } from '../types';
import { DeploymentSummary, PodSummary } from '../types';

export class NamespacesService {
  constructor(private factory: K8sClientFactory) {}

  async list(kubeconfig: string, context?: string): Promise<string[]> {
    const kc = this.factory.getClient(kubeconfig, context);
    const api = createCoreV1Api(kc);
    const response = await api.listNamespace();
    return (response.items ?? []).map((ns) => ns.metadata?.name ?? '').filter(Boolean);
  }
}

export class PodsService {
  constructor(private factory: K8sClientFactory) {}

  async list(kubeconfig: string, namespace?: string, context?: string): Promise<PodSummary[]> {
    const kc = this.factory.getClient(kubeconfig, context);
    const api = createCoreV1Api(kc);
    const response = namespace
      ? await api.listNamespacedPod({ namespace })
      : await api.listPodForAllNamespaces();

    return (response.items ?? []).map((pod) => this.toSummary(pod));
  }

  async getDetails(
    kubeconfig: string,
    namespace: string,
    name: string,
    context?: string,
  ): Promise<PodSummary> {
    const kc = this.factory.getClient(kubeconfig, context);
    const api = createCoreV1Api(kc);
    const pod = await api.readNamespacedPod({ name, namespace });
    return this.toSummary(pod);
  }

  private toSummary(pod: k8s.V1Pod): PodSummary {
    const containerStatuses = (pod.status?.containerStatuses ?? []).map((cs) => ({
      name: cs.name,
      ready: cs.ready ?? false,
      restartCount: cs.restartCount ?? 0,
      state: cs.state?.waiting?.reason ?? cs.state?.terminated?.reason ?? 'running',
      reason: cs.state?.waiting?.reason ?? cs.state?.terminated?.reason,
    }));

    const ready = containerStatuses.every((c) => c.ready);
    const restartCount = containerStatuses.reduce((sum, c) => sum + c.restartCount, 0);

    return {
      name: pod.metadata?.name ?? '',
      namespace: pod.metadata?.namespace ?? '',
      phase: pod.status?.phase ?? 'Unknown',
      restartCount,
      ready,
      nodeName: pod.spec?.nodeName,
      containerStatuses,
    };
  }
}

export class DeploymentsService {
  constructor(private factory: K8sClientFactory) {}

  async list(
    kubeconfig: string,
    namespace?: string,
    context?: string,
  ): Promise<DeploymentSummary[]> {
    const kc = this.factory.getClient(kubeconfig, context);
    const api = kc.makeApiClient(k8s.AppsV1Api);
    const response = namespace
      ? await api.listNamespacedDeployment({ namespace })
      : await api.listDeploymentForAllNamespaces();

    return (response.items ?? []).map((dep) => ({
      name: dep.metadata?.name ?? '',
      namespace: dep.metadata?.namespace ?? '',
      replicas: dep.spec?.replicas ?? 0,
      readyReplicas: dep.status?.readyReplicas ?? 0,
      availableReplicas: dep.status?.availableReplicas ?? 0,
    }));
  }

  async restart(
    kubeconfig: string,
    namespace: string,
    name: string,
    context?: string,
  ): Promise<void> {
    const kc = this.factory.getClient(kubeconfig, context);
    const api = kc.makeApiClient(k8s.AppsV1Api);
    const deployment = await api.readNamespacedDeployment({ name, namespace });

    const annotations = deployment.spec?.template?.metadata?.annotations ?? {};
    annotations['kubectl.kubernetes.io/restartedAt'] = new Date().toISOString();

    await api.patchNamespacedDeployment({
      name,
      namespace,
      body: {
        spec: {
          template: {
            metadata: { annotations },
          },
        },
      },
    });
  }
}
