import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { KubernetesFacadeService } from './kubernetes.service';
import {
  GetPodLogsQueryDto,
  ListEventsQueryDto,
  ListPodsQueryDto,
  RestartDeploymentDto,
} from './dto/kubernetes.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, RequireOtp } from '../auth/decorators/auth.decorators';
import { OtpGuard } from '../auth/guards/otp.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';

@ApiTags('kubernetes')
@Controller('clusters/:clusterId/kubernetes')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class KubernetesController {
  constructor(private k8sService: KubernetesFacadeService) {}

  @Get('namespaces')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'List namespaces' })
  listNamespaces(@Param('clusterId') clusterId: string, @CurrentUser() user: User) {
    return this.k8sService.listNamespaces(clusterId, user.id);
  }

  @Get('deployments')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'List deployments' })
  listDeployments(@Param('clusterId') clusterId: string, @Query('namespace') namespace?: string) {
    return this.k8sService.listDeployments(clusterId, namespace, '');
  }

  @Get('pods')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'List pods' })
  listPods(
    @Param('clusterId') clusterId: string,
    @CurrentUser() user: User,
    @Query() query: ListPodsQueryDto,
  ) {
    return this.k8sService.listPods(clusterId, query.namespace, user.id);
  }

  @Get('pods/:namespace/:name')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'Get pod details' })
  getPod(
    @Param('clusterId') clusterId: string,
    @Param('namespace') namespace: string,
    @Param('name') name: string,
  ) {
    return this.k8sService.getPodDetails(clusterId, namespace, name);
  }

  @Get('pods/:namespace/:name/logs')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'Get pod logs' })
  getLogs(
    @Param('clusterId') clusterId: string,
    @Param('namespace') namespace: string,
    @Param('name') name: string,
    @CurrentUser() user: User,
    @Query() query: GetPodLogsQueryDto,
  ) {
    return this.k8sService.getPodLogs(clusterId, namespace, name, user.id, query);
  }

  @Get('events')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'List cluster events' })
  listEvents(
    @Param('clusterId') clusterId: string,
    @CurrentUser() user: User,
    @Query() query: ListEventsQueryDto,
  ) {
    return this.k8sService.listEvents(clusterId, user.id, query.namespace, query.fieldSelector);
  }

  @Post('deployments/restart')
  @Roles(UserRole.operator)
  @UseGuards(OtpGuard)
  @RequireOtp('deployment_restart')
  @ApiOperation({ summary: 'Restart deployment (OTP required)' })
  restartDeployment(
    @Param('clusterId') clusterId: string,
    @CurrentUser() user: User,
    @Body() dto: RestartDeploymentDto,
  ) {
    return this.k8sService.restartDeployment(clusterId, user.id, dto.namespace, dto.name);
  }

  @Get('health')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'Cluster health summary' })
  health(@Param('clusterId') clusterId: string) {
    return this.k8sService.clusterHealth(clusterId);
  }
}
