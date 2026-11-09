const path = require("node:path");
const fs = require("node:fs");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "../..");
const req = createRequire(path.join(process.env.STACK_DEPS_DIR, "package.json"));
const client = process.env.STACK_PRIVATE_CLIENT;
req("reflect-metadata");
req("tsconfig-paths").register({
  baseUrl: "/",
  paths: { "@prisma/client": [client] },
});
if (!req.resolve("@prisma/client").startsWith(fs.realpathSync(client) + path.sep))
  throw Error("Private Prisma alias did not resolve");
req("ts-node").register({
  transpileOnly: true,
  project: path.join(root, "backend/tsconfig.json"),
});
req("iconv-lite/encodings");
const source = (name) => require(path.join(root, "backend/src", name));
const { NestFactory } = req("@nestjs/core");
// Resolve the adapter as the backend source does, so a workspace install that keeps it under
// backend/node_modules still shares the one @nestjs/core the app modules load.
const { ExpressAdapter } = (() => {
  try {
    return req("@nestjs/platform-express");
  } catch {
    return createRequire(path.join(root, "backend/src/main.ts"))("@nestjs/platform-express");
  }
})();
const { AppModule } = source("app.module");
const { diagnosticValidationPipe, installHttpObservability } = source(
  "shared/logging/http-observability",
);
const { configureRequestBody } = source("shared/http/request-body");
(async () => {
  const app = await NestFactory.create(AppModule, new ExpressAdapter());
  installHttpObservability(app);
  configureRequestBody(app);
  app.useGlobalPipes(diagnosticValidationPipe());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT), "127.0.0.1");
  process.send({ type: "ready", port: app.getHttpServer().address().port });
})().catch((error) => {
  console.error(error.stack);
  process.exit(1);
});
