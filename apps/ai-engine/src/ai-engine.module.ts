import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiEngineController } from './ai-engine.controller';
import { AiEngineService } from './ai-engine.service';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  controllers: [AiEngineController],
  providers: [AiEngineService],
})
export class AiEngineModule {}
