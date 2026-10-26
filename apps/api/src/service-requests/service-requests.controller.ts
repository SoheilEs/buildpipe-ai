import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiHeader, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { Response } from 'express';
import { AuditAction } from '@buildpipe/shared-types';
import { AuditService } from '../audit/audit.service';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/auth.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ServicesService } from '../services/services.service';
import {
  CancelServiceRequestDto,
  CreateServiceRequestDto,
  ListServiceRequestsQuery,
} from './dto/service-requests.dto';
import { RequestState } from './domain/request-state';
import { ServiceRequestsService } from './service-requests.service';

/**
 * HTTP surface of the request lifecycle. Only the user-driven steps exist so far: create and
 * cancel. Collection, approval, execution and verification are driven by the worker and by the
 * approvals module (Phase 3), never by a generic "set status" endpoint.
 */
@ApiTags('service-requests')
@Controller('service-requests')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class ServiceRequestsController {
  constructor(
    private readonly requests: ServiceRequestsService,
    private readonly services: ServicesService,
    private readonly audit: AuditService,
  ) {}

  @Post()
  @Roles(UserRole.operator)
  @ApiOperation({
    summary: 'Create a request for a registered service (operator or above)',
    description:
      'Send an Idempotency-Key header to make retries safe: the same key from the same user returns the original request with 200 instead of creating a second one.',
  })
  @ApiHeader({ name: 'Idempotency-Key', required: false })
  async create(
    @CurrentUser() user: User,
    @Body() dto: CreateServiceRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Res({ passthrough: true }) res: Response,
  ) {
    // 404 for an unknown service, before anything is written.
    await this.services.findOne(dto.serviceId);

    const { request, created } = await this.requests.create({
      kind: dto.kind,
      serviceId: dto.serviceId,
      requesterId: user.id,
      idempotencyKey,
    });
    res.status(created ? 201 : 200);

    if (created) {
      await this.audit.log({
        userId: user.id,
        action: AuditAction.REQUEST_CREATED,
        resource: 'service-request',
        resourceId: request.id,
        metadata: { serviceId: request.serviceId, kind: request.kind },
      });
    }
    return request;
  }

  @Get()
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'List requests, newest first' })
  list(@Query() query: ListServiceRequestsQuery) {
    return this.requests.list({
      status: query.status as RequestState | undefined,
      requesterId: query.requesterId,
      serviceId: query.serviceId,
      limit: query.limit ?? 50,
      offset: query.offset ?? 0,
    });
  }

  @Get(':id')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'Get a request' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.requests.get(id);
  }

  @Get(':id/history')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'State history of a request, oldest first' })
  async history(@Param('id', ParseUUIDPipe) id: string) {
    await this.requests.get(id);
    return this.requests.history(id);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Roles(UserRole.operator)
  @ApiOperation({ summary: 'Cancel a request (its requester, or an admin)' })
  async cancel(
    @CurrentUser() user: User,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelServiceRequestDto,
  ) {
    const current = await this.requests.get(id);
    // Enforced here, on the server: the requester never changes, so there is no race.
    if (current.requesterId !== user.id && user.role !== UserRole.admin) {
      throw new ForbiddenException({
        code: 'NOT_REQUESTER',
        message: 'Only the requester or an admin can cancel this request',
      });
    }
    const updated = await this.requests.transition(id, 'Cancelled', {
      actorId: user.id,
      reason: dto.reason,
    });
    await this.audit.log({
      userId: user.id,
      action: AuditAction.REQUEST_CANCELLED,
      resource: 'service-request',
      resourceId: id,
    });
    return updated;
  }
}
