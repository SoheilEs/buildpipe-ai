import { Injectable, NotFoundException } from '@nestjs/common';
import { OtpPurpose } from '@prisma/client';
import { PrismaService } from '../common/prisma/prisma.service';
import { EncryptionService } from '../common/crypto/encryption.service';
import { AuditService } from '../audit/audit.service';
import { OtpService } from '../auth/otp.service';
import { AuditAction, EVENT_SUBJECTS } from '@buildpipe/shared-types';
import { CreateClusterDto, UpdateClusterDto } from './dto/clusters.dto';
import { createKubernetesServices } from '@buildpipe/kubernetes-sdk';
import { EventsService } from '../events/events.service';
import { randomUUID } from 'crypto';

@Injectable()
export class ClustersService {
  private k8s = createKubernetesServices();

  constructor(
    private prisma: PrismaService,
    private encryption: EncryptionService,
    private audit: AuditService,
    private otp: OtpService,
    private events: EventsService,
  ) {}

  async create(userId: string, dto: CreateClusterDto) {
    const otpValid = await this.otp.verifyOtp(userId, dto.otp, OtpPurpose.cluster_register);
    if (!otpValid) throw new NotFoundException('Invalid OTP');

    const cluster = await this.prisma.cluster.create({
      data: {
        name: dto.name,
        encryptedKubeconfig: this.encryption.encrypt(dto.kubeconfig),
        context: dto.context,
      },
    });

    await this.audit.log({
      userId,
      action: AuditAction.CLUSTER_CREATED,
      resource: 'cluster',
      resourceId: cluster.id,
    });

    return this.toResponse(cluster);
  }

  async findAll() {
    const clusters = await this.prisma.cluster.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    return clusters.map((c) => this.toResponse(c));
  }

  async findOne(id: string) {
    const cluster = await this.getCluster(id);
    return this.toResponse(cluster);
  }

  async update(userId: string, id: string, dto: UpdateClusterDto) {
    await this.getCluster(id);
    const otpValid = await this.otp.verifyOtp(userId, dto.otp, OtpPurpose.cluster_update);
    if (!otpValid) throw new NotFoundException('Invalid OTP');

    const cluster = await this.prisma.cluster.update({
      where: { id },
      data: {
        name: dto.name,
        context: dto.context,
        ...(dto.kubeconfig ? { encryptedKubeconfig: this.encryption.encrypt(dto.kubeconfig) } : {}),
      },
    });

    await this.audit.log({
      userId,
      action: AuditAction.CLUSTER_UPDATED,
      resource: 'cluster',
      resourceId: id,
    });

    return this.toResponse(cluster);
  }

  async testConnection(userId: string, id: string) {
    const cluster = await this.getCluster(id);
    const kubeconfig = this.encryption.decrypt(cluster.encryptedKubeconfig);
    const health = await this.k8s.health.checkHealth(kubeconfig, cluster.context ?? undefined);

    await this.prisma.cluster.update({
      where: { id },
      data: { lastConnectedAt: new Date() },
    });

    await this.audit.log({
      userId,
      action: AuditAction.CLUSTER_CONNECTED,
      resource: 'cluster',
      resourceId: id,
    });

    await this.events.publish(EVENT_SUBJECTS.CLUSTER_CONNECTED, {
      id: randomUUID(),
      type: 'cluster.connected',
      version: 1,
      timestamp: new Date().toISOString(),
      payload: { clusterId: id, clusterName: cluster.name },
    });

    return health;
  }

  async getKubeconfig(id: string): Promise<{ kubeconfig: string; context?: string | null }> {
    const cluster = await this.getCluster(id);
    return {
      kubeconfig: this.encryption.decrypt(cluster.encryptedKubeconfig),
      context: cluster.context,
    };
  }

  getK8sServices() {
    return this.k8s;
  }

  private async getCluster(id: string) {
    const cluster = await this.prisma.cluster.findFirst({
      where: { id, deletedAt: null },
    });
    if (!cluster) throw new NotFoundException('Cluster not found');
    return cluster;
  }

  private toResponse(cluster: {
    id: string;
    name: string;
    context: string | null;
    lastConnectedAt: Date | null;
    createdAt: Date;
  }) {
    return {
      id: cluster.id,
      name: cluster.name,
      context: cluster.context,
      lastConnectedAt: cluster.lastConnectedAt,
      createdAt: cluster.createdAt,
    };
  }
}
