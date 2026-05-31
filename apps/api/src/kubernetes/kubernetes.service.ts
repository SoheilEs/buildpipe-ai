import { Injectable } from '@nestjs/common';
import { OtpPurpose } from '@prisma/client';
import { ClustersService } from '../clusters/clusters.service';
import { AuditService } from '../audit/audit.service';
import { OtpService } from '../auth/otp.service';
import { AuditAction, EVENT_SUBJECTS } from '@buildpipe/shared-types';
import { EventsService } from '../events/events.service';
import { WebsocketGateway } from '../websocket/websocket.gateway';
import { randomUUID } from 'crypto';

@Injectable()
export class KubernetesFacadeService {
  constructor(
    private clusters: ClustersService,
    private audit: AuditService,
    private otp: OtpService,
    private events: EventsService,
    private ws: WebsocketGateway,
  ) {}

  private async getK8s(clusterId: string) {
    const { kubeconfig, context } = await this.clusters.getKubeconfig(clusterId);
    const k8s = this.clusters.getK8sServices();
    return { kubeconfig, context: context ?? undefined, k8s };
  }

  async listNamespaces(clusterId: string, userId: string) {
    const { kubeconfig, context, k8s } = await this.getK8s(clusterId);
    const result = await k8s.namespaces.list(kubeconfig, context);
    await this.audit.log({
      userId,
      action: AuditAction.K8S_PODS_LISTED,
      resource: 'namespace',
      resourceId: clusterId,
    });
    return result;
  }

  async listDeployments(clusterId: string, namespace: string | undefined, userId: string) {
    const { kubeconfig, context, k8s } = await this.getK8s(clusterId);
    return k8s.deployments.list(kubeconfig, namespace, context);
  }

  async listPods(clusterId: string, namespace: string | undefined, userId: string) {
    const { kubeconfig, context, k8s } = await this.getK8s(clusterId);
    const pods = await k8s.pods.list(kubeconfig, namespace, context);
    await this.audit.log({
      userId,
      action: AuditAction.K8S_PODS_LISTED,
      resource: 'pod',
      resourceId: clusterId,
      metadata: { namespace },
    });
    return pods;
  }

  async getPodDetails(clusterId: string, namespace: string, name: string) {
    const { kubeconfig, context, k8s } = await this.getK8s(clusterId);
    return k8s.pods.getDetails(kubeconfig, namespace, name, context);
  }

  async getPodLogs(
    clusterId: string,
    namespace: string,
    podName: string,
    userId: string,
    options: { tailLines?: number; container?: string },
  ) {
    const { kubeconfig, context, k8s } = await this.getK8s(clusterId);
    const logs = await k8s.logs.getPodLogs(kubeconfig, namespace, podName, options, context);
    await this.audit.log({
      userId,
      action: AuditAction.K8S_LOGS_FETCHED,
      resource: 'pod',
      resourceId: podName,
      metadata: { clusterId, namespace },
    });
    return { logs };
  }

  async listEvents(
    clusterId: string,
    userId: string,
    namespace?: string,
    fieldSelector?: string,
  ) {
    const { kubeconfig, context, k8s } = await this.getK8s(clusterId);
    const events = await k8s.events.listEvents(kubeconfig, namespace, fieldSelector, context);
    await this.audit.log({
      userId,
      action: AuditAction.K8S_EVENTS_FETCHED,
      resource: 'event',
      resourceId: clusterId,
      metadata: { namespace },
    });
    return events;
  }

  async restartDeployment(
    clusterId: string,
    userId: string,
    namespace: string,
    name: string,
    otp: string,
  ) {
    const otpValid = await this.otp.verifyOtp(userId, otp, OtpPurpose.deployment_restart);
    if (!otpValid) throw new Error('Invalid OTP');

    const { kubeconfig, context, k8s } = await this.getK8s(clusterId);
    await k8s.deployments.restart(kubeconfig, namespace, name, context);

    await this.audit.log({
      userId,
      action: AuditAction.DEPLOYMENT_RESTARTED,
      resource: 'deployment',
      resourceId: name,
      metadata: { clusterId, namespace },
    });

    await this.events.publish(EVENT_SUBJECTS.DEPLOYMENT_RESTARTED, {
      id: randomUUID(),
      type: 'deployment.restarted',
      version: 1,
      timestamp: new Date().toISOString(),
      payload: { clusterId, namespace, deploymentName: name, userId },
    });

    this.ws.emitToAll('deployment.restarted', { clusterId, namespace, name });

    return { message: 'Deployment restart initiated' };
  }

  async clusterHealth(clusterId: string) {
    const { kubeconfig, context, k8s } = await this.getK8s(clusterId);
    return k8s.health.checkHealth(kubeconfig, context);
  }
}
