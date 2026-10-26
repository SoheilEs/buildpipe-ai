import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { corsOriginHandler } from './common/cors';

/**
 * HTTP-level configuration shared by the real server (main.ts) and the e2e tests,
 * so the tests exercise the same security headers, validation and Swagger setup.
 */
export function configureApp(app: INestApplication): void {
  app.use(helmet());
  app.enableCors({ origin: corsOriginHandler() });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = new DocumentBuilder()
    .setTitle('Infralark API')
    .setDescription(
      'Infralark API (MVP in development). Incident, AI analysis and MCP endpoints are legacy BuildPipe AI features.',
    )
    .setVersion('0.1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);
}
