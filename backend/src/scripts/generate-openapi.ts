import { NestFactory } from '@nestjs/core';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from '../app.module';
import * as fs from 'fs';
import * as path from 'path';

async function generateOpenApiSpec() {
  const app = await NestFactory.create(AppModule, { logger: false });

  const config = new DocumentBuilder()
    .setTitle('Clinic Management System API')
    .setDescription('Comprehensive API documentation for all modules')
    .setVersion('1.0.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' })
    .build();

  const document = SwaggerModule.createDocument(app, config);

  const outputPath = path.join(__dirname, '../../openapi.json');
  fs.writeFileSync(outputPath, JSON.stringify(document, null, 2));

  console.log(`✅ OpenAPI spec generated at: ${outputPath}`);
  await app.close();
  process.exit(0);
}

void generateOpenApiSpec();

