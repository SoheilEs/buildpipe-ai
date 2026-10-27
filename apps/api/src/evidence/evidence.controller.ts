import { Controller, Get, Param, ParseUUIDPipe, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../auth/decorators/auth.decorators';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { EvidenceService } from './evidence.service';

/** Read-only. Evidence and findings are written in-process by the collectors, never over HTTP. */
@ApiTags('service-requests')
@Controller('service-requests/:requestId')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth()
export class EvidenceController {
  constructor(private readonly evidence: EvidenceService) {}

  @Get('evidence')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'Evidence collected for a request, oldest first (redacted)' })
  listEvidence(@Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.evidence.listEvidence(requestId);
  }

  @Get('findings')
  @Roles(UserRole.viewer)
  @ApiOperation({ summary: 'Findings for a request, each with the ids of the evidence it cites' })
  listFindings(@Param('requestId', ParseUUIDPipe) requestId: string) {
    return this.evidence.listFindings(requestId);
  }
}
