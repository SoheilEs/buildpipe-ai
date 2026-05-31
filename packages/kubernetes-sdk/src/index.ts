export { K8sClientFactory, createCoreV1Api, createAppsV1Api, stripSecretPatterns } from './types';
export type { PodSummary, EventSummary, DeploymentSummary } from './types';
export {
  NamespacesService,
  PodsService,
  DeploymentsService,
} from './services/namespaces-pods-deployments.service';
export { LogsService, EventsService, ClusterHealthService } from './services/logs-events.service';

import { K8sClientFactory } from './types';
import {
  NamespacesService,
  PodsService,
  DeploymentsService,
} from './services/namespaces-pods-deployments.service';
import { LogsService, EventsService, ClusterHealthService } from './services/logs-events.service';

export function createKubernetesServices() {
  const factory = new K8sClientFactory();
  const podsService = new PodsService(factory);
  return {
    factory,
    namespaces: new NamespacesService(factory),
    pods: podsService,
    deployments: new DeploymentsService(factory),
    logs: new LogsService(factory),
    events: new EventsService(factory),
    health: new ClusterHealthService(factory, podsService),
  };
}
