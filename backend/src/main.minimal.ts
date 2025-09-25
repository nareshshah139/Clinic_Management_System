import { NestFactory } from '@nestjs/core';
import { AppMinimalModule } from './app.minimal.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { Logger } from '@nestjs/common';

async function bootstrap() {
  const logger = new Logger('BootstrapMinimal');
  logger.log('Starting Clinic Management System backend (minimal entry)');
  const app = await NestFactory.create(AppMinimalModule, new ExpressAdapter());
  app.enableCors({
    origin: [/^http:\/\/localhost:(3000|3001|3002)$/],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Clinic Management System API (Minimal)')
    .setDescription('API docs available in minimal boot mode')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  logger.log(`Clinic Management System minimal backend listening on port ${port}`);
}
void bootstrap();
