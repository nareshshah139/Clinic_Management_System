import { NestFactory } from '@nestjs/core';
import { AppMinimalModule } from './app.minimal.module';
import { ExpressAdapter } from '@nestjs/platform-express';

async function bootstrap() {
  const app = await NestFactory.create(AppMinimalModule, new ExpressAdapter());
  app.enableCors({
    origin: [/^http:\/\/localhost:(3000|3001|3002)$/],
    credentials: true,
    methods: ['GET','POST','PUT','PATCH','DELETE','OPTIONS'],
    allowedHeaders: ['Content-Type','Authorization']
  });
  await app.listen(process.env.PORT ?? 4000);
}
bootstrap(); 