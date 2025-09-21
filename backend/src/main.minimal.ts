import { NestFactory } from '@nestjs/core';
import { AppMinimalModule } from './app.minimal.module';
import { ExpressAdapter } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';

async function bootstrap() {
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

  await app.listen(process.env.PORT ?? 4000);
}
void bootstrap();
