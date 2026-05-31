import { Module } from '@nestjs/common';
import { McpBridgeController } from './mcp-bridge.controller';
import { KubernetesModule } from '../kubernetes/kubernetes.module';
import { IncidentsModule } from '../incidents/incidents.module';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [KubernetesModule, IncidentsModule, AuditModule, AuthModule],
  controllers: [McpBridgeController],
})
export class McpModule {}
