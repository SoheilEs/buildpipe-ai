import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { User, UserRole } from '@prisma/client';
import { IsObject, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles, RequireOtp } from '../auth/decorators/auth.decorators';
import { OtpGuard } from '../auth/guards/otp.guard';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { KubernetesFacadeService } from '../kubernetes/kubernetes.service';
import { IncidentsService } from '../incidents/incidents.service';
import { AuditService } from '../audit/audit.service';
import { AuditAction } from '@buildpipe/shared-types';

class McpToolDto {
  @ApiProperty()
  @IsString()
  clusterId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  namespace?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  podName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deploymentName?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  incidentId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  otp?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  params?: Record<string, unknown>;
}

@ApiTags('mcp-internal')
@Controller('internal/mcp')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class McpBridgeController {
  constructor(
    private k8s: KubernetesFacadeService,
    private incidents: IncidentsService,
    private audit: AuditService,
  ) {}

  @Post('get_pods')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'MCP: get pods' })
  async getPods(@CurrentUser() user: User, @Body() dto: McpToolDto) {
    await this.logMcp(user.id, 'get_pods', dto);
    return this.k8s.listPods(dto.clusterId, dto.namespace, user.id);
  }

  @Post('get_logs')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'MCP: get logs' })
  async getLogs(@CurrentUser() user: User, @Body() dto: McpToolDto) {
    await this.logMcp(user.id, 'get_logs', dto);
    return this.k8s.getPodLogs(dto.clusterId, dto.namespace!, dto.podName!, user.id, {
      tailLines: 200,
    });
  }

  @Post('get_events')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'MCP: get events' })
  async getEvents(@CurrentUser() user: User, @Body() dto: McpToolDto) {
    await this.logMcp(user.id, 'get_events', dto);
    return this.k8s.listEvents(dto.clusterId, user.id, dto.namespace);
  }

  @Post('analyze_incident')
  @Roles(UserRole.operator)
  @ApiOperation({ summary: 'MCP: analyze incident' })
  async analyzeIncident(@CurrentUser() user: User, @Body() dto: McpToolDto) {
    await this.logMcp(user.id, 'analyze_incident', dto);
    return this.incidents.analyze(dto.incidentId!, user.id, { sync: true });
  }

  @Post('cluster_health')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'MCP: cluster health' })
  async clusterHealth(@CurrentUser() user: User, @Body() dto: McpToolDto) {
    await this.logMcp(user.id, 'cluster_health', dto);
    return this.k8s.clusterHealth(dto.clusterId);
  }

  @Post('restart_deployment')
  @Roles(UserRole.operator)
  @UseGuards(OtpGuard)
  @RequireOtp('deployment_restart')
  @ApiOperation({ summary: 'MCP: restart deployment (OTP required)' })
  async restartDeployment(@CurrentUser() user: User, @Body() dto: McpToolDto) {
    await this.logMcp(user.id, 'restart_deployment', dto);
    return this.k8s.restartDeployment(
      dto.clusterId,
      user.id,
      dto.namespace!,
      dto.deploymentName!,
      dto.otp!,
    );
  }

  private async logMcp(userId: string, tool: string, dto: McpToolDto) {
    await this.audit.log({
      userId,
      action: AuditAction.MCP_TOOL_EXECUTED,
      resource: 'mcp_tool',
      metadata: { tool, ...dto },
    });
  }
}
