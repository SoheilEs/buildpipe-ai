import * as k8s from '@kubernetes/client-node';

export class K8sClientFactory {
  private clients = new Map<string, k8s.KubeConfig>();

  getClient(kubeconfigYaml: string, context?: string): k8s.KubeConfig {
    const cacheKey = `${context ?? 'default'}:${Buffer.from(kubeconfigYaml).toString('base64').slice(0, 32)}`;
    const cached = this.clients.get(cacheKey);
    if (cached) return cached;

    const kc = new k8s.KubeConfig();
    kc.loadFromString(kubeconfigYaml);
    if (context) kc.setCurrentContext(context);
    this.clients.set(cacheKey, kc);
    return kc;
  }

  clearCache(): void {
    this.clients.clear();
  }
}

export function createCoreV1Api(kc: k8s.KubeConfig): k8s.CoreV1Api {
  return kc.makeApiClient(k8s.CoreV1Api);
}

export function createAppsV1Api(kc: k8s.KubeConfig): k8s.AppsV1Api {
  return kc.makeApiClient(k8s.AppsV1Api);
}

export function stripSecretPatterns(text: string): string {
  return text
    .replace(/password\s*[:=]\s*\S+/gi, 'password=[REDACTED]')
    .replace(/token\s*[:=]\s*\S+/gi, 'token=[REDACTED]')
    .replace(/api[_-]?key\s*[:=]\s*\S+/gi, 'api_key=[REDACTED]');
}

export interface PodSummary {
  name: string;
  namespace: string;
  phase: string;
  restartCount: number;
  ready: boolean;
  nodeName?: string;
  containerStatuses: Array<{
    name: string;
    ready: boolean;
    restartCount: number;
    state?: string;
    reason?: string;
  }>;
}

export interface EventSummary {
  type: string;
  reason: string;
  message: string;
  involvedObject: string;
  namespace: string;
  timestamp?: string;
  count?: number;
}

export interface DeploymentSummary {
  name: string;
  namespace: string;
  replicas: number;
  readyReplicas: number;
  availableReplicas: number;
}
