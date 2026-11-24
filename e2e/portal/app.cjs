/**
 * Boots the production portal routes (PortalModule behind the staff JWT guard and the idempotency
 * interceptor) on a private schema and seeds one expired, one revoked and one unknown task token.
 */
const path = require("node:path");
const { createRequire } = require("node:module");
const root = path.resolve(__dirname, "../..");
const req = createRequire(path.join(root, "backend/package.json"));
req("reflect-metadata");
req("ts-node").register({ transpileOnly: true, project: path.join(root, "backend/tsconfig.json") });
const source = (name) => require(path.join(root, "backend/src", name));
const { Module } = req("@nestjs/common");
const { NestFactory, APP_GUARD, APP_INTERCEPTOR } = req("@nestjs/core");
const { PassportModule } = req("@nestjs/passport");
const { PrismaClient } = req("@prisma/client");
const { PrismaModule } = source("shared/database/prisma.module");
const { diagnosticValidationPipe, installHttpObservability } = source("shared/logging/http-observability");
const { PortalModule } = source("modules/portal/portal.module");
const { FollowUpsService } = source("modules/follow-ups/follow-ups.service");
const { VisitsService } = source("modules/visits/visits.service");
const { deriveTaskToken, hashTaskToken } = source("modules/follow-ups/task-link");

class PortalE2eModule {}
Module({
  imports: [PassportModule.register({ defaultStrategy: "jwt" }), PrismaModule, PortalModule],
  providers: [
    { provide: APP_GUARD, useClass: Object.values(source("shared/guards/jwt-auth.guard"))[0] },
    { provide: APP_INTERCEPTOR, useClass: Object.values(source("shared/interceptors/idempotency.interceptor"))[0] },
  ],
})(PortalE2eModule);

async function seed(db) {
  await db.branch.create({ data: { id: "A", name: "Branch A", address: "Synthetic" } });
  await db.user.create({ data: { id: "own", email: "own@example.test", password: "x", firstName: "O", lastName: "W", role: "OWNER", branchId: "A" } });
  await db.user.create({ data: { id: "doc", email: "doc@example.test", password: "x", firstName: "Meera", lastName: "Rao", role: "DOCTOR", branchId: "A" } });
  const plans = await new FollowUpsService(db).importData("own");
  const planVersionId = plans.find((r) => r.key === "skin-two-week").versionId;
  const tokens = {};
  for (const [n, kind] of [[1, "expired"], [2, "revoked"]]) {
    const p = await db.patient.create({ data: { name: `Synthetic Expired${n}`, gender: "F", phone: `92000${n}0000`, branchId: "A" } });
    const v = await db.visit.create({ data: { patientId: p.id, doctorId: "doc", complaints: "[]" } });
    await new VisitsService(db).complete(v.id, { followUpPlanVersionId: planVersionId }, "A");
    const [first] = await db.checkIn.findMany({ where: { track: { patientId: p.id } }, orderBy: { seq: "asc" } });
    await db.checkIn.update({ where: { id: first.id }, data: { state: kind === "expired" ? "MISSED" : "OPEN" } });
    const id = `e2e-${kind}-link`;
    tokens[kind] = deriveTaskToken(id);
    await db.portalTaskLink.create({
      data: { id, dedupeKey: `e2e:${id}`, patientId: p.id, tokenHash: hashTaskToken(tokens[kind]), revokedAt: kind === "revoked" ? new Date() : null, checkIns: { create: [{ checkInId: first.id }] } },
    });
  }
  tokens.unknown = deriveTaskToken("e2e-never-issued");
  return tokens;
}

(async () => {
  const db = new PrismaClient();
  const tokens = await seed(db);
  await db.$disconnect();
  const app = await NestFactory.create(PortalE2eModule, new (req("@nestjs/platform-express").ExpressAdapter)(), { logger: false });
  installHttpObservability(app);
  app.useGlobalPipes(diagnosticValidationPipe());
  await app.listen(0, "127.0.0.1");
  process.send({ type: "ready", port: app.getHttpServer().address().port, tokens });
})().catch((error) => {
  console.error(error.stack);
  process.exit(1);
});
