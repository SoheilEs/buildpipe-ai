import { NestFactory } from '@nestjs/core';
import { AiEngineModule } from './ai-engine.module';

async function bootstrap() {
  const app = await NestFactory.create(AiEngineModule);
  const port = process.env.AI_ENGINE_PORT ?? 3001;
  await app.listen(port);
  console.log(`Infralark AI Engine running on http://localhost:${port}`);
}

bootstrap();
