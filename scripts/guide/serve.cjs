// Boots the synthetic stack for the user guide and keeps it running.
// Usage: STACK_DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/postgres node scripts/guide/serve.cjs
const fs = require("node:fs");
const path = require("node:path");
const { bootStack } = require("../stack/boot.cjs");

(async () => {
  const stack = await bootStack({ databaseUrl: process.env.STACK_DATABASE_URL, label: "guide" });
  const { ROLE_PERMISSIONS } = require(path.resolve(__dirname, "../../backend/src/shared/access/role-permissions.ts"));
  for (const user of Object.values(stack.users))
    await stack.db.user.update({ where: { id: user.id }, data: { permissions: JSON.stringify([...ROLE_PERMISSIONS[user.role]]) } });
  const owner = await stack.db.user.findUnique({ where: { id: stack.users.owner.id } });
  const admin = await stack.db.user.create({
    data: { branchId: stack.branch.id, email: "admin@stack.example.invalid", firstName: "Kiran", lastName: "Rao", role: "ADMIN", password: owner.password, permissions: JSON.stringify([...ROLE_PERMISSIONS.ADMIN]) },
  });
  stack.users.admin = { id: admin.id, email: admin.email, password: stack.users.owner.password, role: "ADMIN" };
  fs.writeFileSync(path.join(stack.output, "stack.json"), JSON.stringify({ base: stack.base, api: stack.api, schema: stack.schema, branchId: stack.branch.id, users: stack.users }, null, 2));
  console.log(`guide stack ready at ${stack.base}`);
  setInterval(() => {}, 1 << 30);
})();
