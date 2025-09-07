import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ExpressAdapter } from '@nestjs/platform-express';

async function bootstrap() {
  const useMinimal = process.env.MINIMAL_BOOT === 'true';
  const moduleToBootstrap = useMinimal
    ? (await import('./app.minimal.module')).AppMinimalModule
    : (await import('./app.module')).AppModule;

  const app = await NestFactory.create(moduleToBootstrap, new ExpressAdapter());
  app.enableCors({
    origin: [/^http:\/\/localhost:(3000|3001|3002)$/],
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization']
  });
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap();
