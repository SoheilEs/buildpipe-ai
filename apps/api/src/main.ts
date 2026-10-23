import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  configureApp(app);

  const port = process.env.PORT ?? 3000;
  await app.listen(port);
  app.get(Logger).log(`BuildPipe AI API running on http://localhost:${port}`);
  app.get(Logger).log(`Swagger docs: http://localhost:${port}/api/docs`);
}

bootstrap();
