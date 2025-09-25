import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import * as express from 'express';
import { join } from 'path';

// Ensure iconv-lite encodings are available at runtime (workaround for raw-body/iconv-lite packaging issues)
import 'iconv-lite/encodings';
import * as iconv from 'iconv-lite';
iconv.encodingExists('utf-8');

async function bootstrap() {
  const useMinimal = process.env.MINIMAL_BOOT === 'true';
  const logger = new Logger('Bootstrap');

  if (useMinimal) {
    const mod = (await import(
      './app.minimal.module'
    )) as typeof import('./app.minimal.module');
    logger.log('Starting Clinic Management System backend (minimal mode)');
    const app = await NestFactory.create(
      mod.AppMinimalModule,
      new ExpressAdapter(),
    );
    app.enableCors({
      origin: [/^http:\/\/localhost:(3000|3001|3002)$/],
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization'],
    });
    app.useGlobalPipes(
      new ValidationPipe({ transform: true, whitelist: true }),
    );

    // Serve uploads
    app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

    // Swagger setup
    const config = new DocumentBuilder()
      .setTitle('Clinic Management System API (Minimal)')
      .setDescription('API docs available in minimal boot mode')
      .setVersion('1.0.0')
      .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('docs', app, document);

    await app.listen(process.env.PORT ?? 4000);
    return;
  }

  const mod = (await import('./app.module')) as typeof import('./app.module');
  logger.log('Starting Clinic Management System backend');
  const app = await NestFactory.create(mod.AppModule, new ExpressAdapter());
  app.enableCors({
    origin: [/^http:\/\/localhost:(3000|3001|3002)$/],
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));

  // Serve uploads
  app.use('/uploads', express.static(join(process.cwd(), 'uploads')));

  // Swagger setup
  const config = new DocumentBuilder()
    .setTitle('Clinic Management System API')
    .setDescription('Comprehensive API documentation for all modules')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  logger.log(`Clinic Management System backend listening on port ${port}`);
}
void bootstrap();
