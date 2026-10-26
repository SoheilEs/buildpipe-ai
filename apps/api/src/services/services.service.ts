import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, Service } from '@prisma/client';
import { AuditAction } from '@buildpipe/shared-types';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../common/prisma/prisma.service';
import { CreateServiceDto, UpdateServiceDto } from './dto/services.dto';
import { ServiceFields, validateService } from './domain/service-validation';

const DEFAULT_PROVIDER = 'github';
const DEFAULT_BRANCH = 'main';

const prismaCode = (error: unknown): string | undefined =>
  error instanceof Prisma.PrismaClientKnownRequestError ? error.code : undefined;

interface ServiceInput {
  name: string;
  namespace: string;
  workloadKind: string;
  workloadName: string;
  gitProvider?: string;
  gitRepository: string;
  gitBaseBranch?: string;
  configPaths: string[];
}

/**
 * Registry of reviewable workloads. It stores locations only (cluster, namespace, workload,
 * repository, manifest paths) and never credentials. Authorization is done by the controller's
 * role guard; this class validates data and writes the audit trail.
 */
@Injectable()
export class ServicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll(): Promise<Service[]> {
    return this.prisma.service.findMany({ orderBy: { name: 'asc' } });
  }

  async findOne(id: string): Promise<Service> {
    const service = await this.prisma.service.findUnique({ where: { id } });
    if (!service) throw new NotFoundException({ code: 'NOT_FOUND', message: 'Service not found' });
    return service;
  }

  async create(userId: string, dto: CreateServiceDto): Promise<Service> {
    const fields = this.fieldsFrom(dto);
    this.assertValid(fields);
    await this.assertClusterUsable(dto.clusterId);

    try {
      const service = await this.prisma.service.create({
        data: {
          ...fields,
          workloadKind: fields.workloadKind as Service['workloadKind'],
          description: dto.description?.trim() || null,
          clusterId: dto.clusterId,
          createdById: userId,
        },
      });
      await this.audit.log({
        userId,
        action: AuditAction.SERVICE_CREATED,
        resource: 'service',
        resourceId: service.id,
        metadata: { name: service.name, clusterId: service.clusterId },
      });
      return service;
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async update(userId: string, id: string, dto: UpdateServiceDto): Promise<Service> {
    const current = await this.findOne(id);
    // Merge, then validate the whole service: a partial update must not leave it invalid.
    const fields = this.fieldsFrom({
      name: dto.name ?? current.name,
      namespace: dto.namespace ?? current.namespace,
      workloadKind: dto.workloadKind ?? current.workloadKind,
      workloadName: dto.workloadName ?? current.workloadName,
      gitProvider: dto.gitProvider ?? current.gitProvider,
      gitRepository: dto.gitRepository ?? current.gitRepository,
      gitBaseBranch: dto.gitBaseBranch ?? current.gitBaseBranch,
      configPaths: dto.configPaths ?? current.configPaths,
    });
    this.assertValid(fields);
    const clusterId = dto.clusterId ?? current.clusterId;
    if (clusterId !== current.clusterId) await this.assertClusterUsable(clusterId);

    try {
      const service = await this.prisma.service.update({
        where: { id },
        data: {
          ...fields,
          workloadKind: fields.workloadKind as Service['workloadKind'],
          description:
            dto.description === undefined ? current.description : dto.description.trim() || null,
          clusterId,
        },
      });
      await this.audit.log({
        userId,
        action: AuditAction.SERVICE_UPDATED,
        resource: 'service',
        resourceId: id,
        metadata: { fields: Object.keys(dto) },
      });
      return service;
    } catch (error) {
      throw this.mapWriteError(error);
    }
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.findOne(id);
    try {
      await this.prisma.service.delete({ where: { id } });
    } catch (error) {
      if (prismaCode(error) === 'P2003') {
        throw new ConflictException({
          code: 'SERVICE_IN_USE',
          message: 'The service has requests and cannot be deleted',
        });
      }
      throw error;
    }
    await this.audit.log({
      userId,
      action: AuditAction.SERVICE_DELETED,
      resource: 'service',
      resourceId: id,
    });
  }

  private fieldsFrom(input: ServiceInput): ServiceFields {
    return {
      name: typeof input.name === 'string' ? input.name.trim() : input.name,
      namespace: input.namespace,
      workloadKind: input.workloadKind,
      workloadName: input.workloadName,
      gitProvider: input.gitProvider ?? DEFAULT_PROVIDER,
      gitRepository: input.gitRepository,
      gitBaseBranch: input.gitBaseBranch ?? DEFAULT_BRANCH,
      configPaths: input.configPaths,
    };
  }

  private assertValid(fields: ServiceFields): void {
    const problems = validateService(fields);
    if (Object.keys(problems).length > 0) {
      throw new BadRequestException({
        code: 'INVALID_SERVICE',
        message: 'The service definition is not valid',
        problems,
      });
    }
  }

  private async assertClusterUsable(clusterId: string): Promise<void> {
    const cluster = await this.prisma.cluster.findFirst({
      where: { id: clusterId, deletedAt: null },
      select: { id: true },
    });
    if (!cluster) {
      throw new BadRequestException({
        code: 'CLUSTER_NOT_FOUND',
        message: 'The cluster is not registered',
      });
    }
  }

  private mapWriteError(error: unknown): unknown {
    if (prismaCode(error) === 'P2002') {
      return new ConflictException({
        code: 'SERVICE_EXISTS',
        message: 'A service with this name, or for this workload, already exists',
      });
    }
    return error;
  }
}
