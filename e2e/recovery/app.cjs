const path = require("node:path");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "../..");
const req = createRequire(path.join(root, "backend/package.json"));
req("reflect-metadata");
req("tsconfig-paths").register({
  baseUrl: "/",
  paths: { "@prisma/client": [process.env.RECOVERY_PRIVATE_CLIENT] },
});
if (
  !req
    .resolve("@prisma/client")
    .startsWith(
      require("node:fs").realpathSync(process.env.RECOVERY_PRIVATE_CLIENT) +
        path.sep,
    )
)
  throw Error("Private Prisma alias did not resolve");
req("ts-node").register({
  transpileOnly: true,
  project: path.join(root, "backend/tsconfig.json"),
});
const source = (name) => require(path.join(root, "backend/src", name));
const { Module } = req("@nestjs/common");
const { NestFactory, APP_GUARD, APP_INTERCEPTOR } = req("@nestjs/core");
const { ConfigModule } = req("@nestjs/config");
const { PassportModule } = req("@nestjs/passport");
const { PrismaModule } = source("shared/database/prisma.module");
const { validateEnv } = source("shared/config/env.validation");
const { diagnosticValidationPipe, installHttpObservability } = source(
  "shared/logging/http-observability",
);
/**
 * @cc [owner:nareshshah139,label:testing] real-recovery-http-policy
 * Recovery HTTP MUST use production modules, guards, interceptors and PrismaService without provider overrides or environment files.
 */
class RecoveryModule {}
Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      ignoreEnvFile: true,
      validate: validateEnv,
    }),
    PassportModule.register({ defaultStrategy: "jwt" }),
    PrismaModule,
    ...[
      "auth/auth",
      "inventory/inventory",
      "users/users",
      "reports/reports",
    ].map((name) => Object.values(source(`modules/${name}.module`))[0]),
  ],
  providers: [
    ...["jwt-auth", "roles", "permissions"].map((name) => ({
      provide: APP_GUARD,
      useClass: Object.values(source(`shared/guards/${name}.guard`))[0],
    })),
    ...["request-context", "idempotency"].map((name) => ({
      provide: APP_INTERCEPTOR,
      useClass: Object.values(
        source(`shared/interceptors/${name}.interceptor`),
      )[0],
    })),
  ],
})(RecoveryModule);
(async () => {
  const app = await NestFactory.create(
    RecoveryModule,
    new (req("@nestjs/platform-express").ExpressAdapter)(),
  );
  installHttpObservability(app);
  app.useGlobalPipes(diagnosticValidationPipe());
  app.enableShutdownHooks();
  await app.listen(0, "127.0.0.1");
  process.send({ type: "ready", port: app.getHttpServer().address().port });
})().catch((error) => {
  console.error(error.stack);
  process.exit(1);
});
