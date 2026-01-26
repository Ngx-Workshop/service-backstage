// src/swagger.ts
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { AppModule } from './app.module';

async function generate() {
  // Ensure DB is skipped while generating the spec
  process.env.GENERATE_OPENAPI = 'true';

  const start = Date.now();
  console.log('🧩 [openapi] Bootstrapping Nest app (DB disabled)...');

  // Create the app without listening
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn'],
  });

  // If you use global pipes/filters/interceptors in main.ts that affect DTO shape,
  // mirror them here (usually not needed for OpenAPI).
  // await app.init(); // Optional: initialize modules; helps in some setups

  console.log('🧩 [openapi] Creating Swagger document...');
  const config = new DocumentBuilder()
    .setTitle('NGX seed-service-nestjs API')
    .setVersion('1.0.0')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  const outPath = join(process.cwd(), 'openapi.json');

  writeFileSync(outPath, JSON.stringify(document, null, 2));

  await app.close();
  const ms = Date.now() - start;
  console.log(`✅ [openapi] Wrote ${outPath} in ${ms}ms`);
}

generate().catch((err) => {
  console.error('❌ [openapi] Failed to generate spec:');
  console.error(err?.stack || err);
  // Make CI fail loudly
  process.exit(1);
});
