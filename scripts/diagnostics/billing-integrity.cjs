const root = require("node:path").resolve(__dirname, "../..");
const fs = require("node:fs");
const { randomUUID } = require("node:crypto");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
require(root + "/node_modules/ts-node").register({
  transpileOnly: true,
  project: root + "/backend/tsconfig.json",
});
const { PrismaClient } = require(root + "/node_modules/@prisma/client");
const { PharmacyInvoiceService } = require(
  root + "/backend/src/modules/pharmacy/pharmacy-invoice.service",
);
const { PharmacyPackageService } = require(
  root + "/backend/src/modules/pharmacy/pharmacy-package.service",
);
const { PrescriptionsService } = require(
  root + "/backend/src/modules/prescriptions/prescriptions.service",
);
const { InventoryService } = require(
  root + "/backend/src/modules/inventory/inventory.service",
);
const adminUrl = "postgresql://nshah@127.0.0.1:55457/postgres";
const schema = "pstack_audit_" + randomUUID().replaceAll("-", "");
const url = adminUrl + "?schema=" + schema;
const admin = new PrismaClient({ datasourceUrl: adminUrl });
let db;
let created = false;
const results = [];
const probe = async (name, fn) => {
  try {
    results.push({ name, outcome: "PASS", evidence: await fn() });
  } catch (e) {
    results.push({ name, outcome: "FAIL", error: e.message });
  }
};
(async () => {
  await admin.$executeRawUnsafe(`CREATE SCHEMA "${schema}"`);
  created = true;
  execFileSync(
    process.execPath,
    [
      root + "/node_modules/prisma/build/index.js",
      "db",
      "push",
      "--skip-generate",
      "--schema",
      root + "/backend/prisma/schema.prisma",
    ],
    {
      cwd: root + "/backend",
      env: { ...process.env, DATABASE_URL: url },
      stdio: "pipe",
    },
  );
  db = new PrismaClient({ datasourceUrl: url });
  const branch = await db.branch.create({
    data: { name: "PSTACK SYNTHETIC ONLY", address: "Test" },
  });
  const other = await db.branch.create({
    data: { name: "PSTACK OTHER SYNTHETIC", address: "Test" },
  });
  const doctor = await db.user.create({
    data: {
      branchId: branch.id,
      firstName: "Synthetic",
      lastName: "Reviewer",
      email: randomUUID() + "@example.invalid",
      password: "NO_LOGIN",
      role: "DOCTOR",
    },
  });
  const patient = await db.patient.create({
    data: {
      branchId: branch.id,
      name: "SYNTHETIC ONLY",
      gender: "FEMALE",
      phone: "0000000000",
    },
  });
  const foreignPatient = await db.patient.create({
    data: {
      branchId: other.id,
      name: "OTHER SYNTHETIC ONLY",
      gender: "FEMALE",
      phone: "0000000000",
    },
  });
  let sequence = 0;
  const numbering = {
    reserve: async () => ({ periodKey: "2026", sequence: ++sequence }),
  };
  const billing = new PharmacyInvoiceService(db, numbering);
  const stockFixture = async (stock = 20) => {
    const name = "SYNTHETIC " + randomUUID();
    const item = await db.inventoryItem.create({
      data: {
        branchId: branch.id,
        name,
        type: "MEDICINE",
        unit: "PIECES",
        packSize: 1,
        packUnit: "TABLETS",
        currentStock: stock,
        heldStock: 0,
        costPrice: 10,
        sellingPrice: 20,
        minStockLevel: 2,
        batchNumber: "TEST",
        gstRate: 0,
        expiryDate: new Date("2099-01-01"),
      },
    });
    const drug = await db.drug.create({
      data: {
        branchId: branch.id,
        name,
        price: 20,
        manufacturerName: "Synthetic",
        packSizeLabel: "1 tablet",
        inventoryItems: { connect: { id: item.id } },
      },
    });
    return { item, drug };
  };
  const invoiceFixture = async (quantity = 1) => {
    const s = await stockFixture();
    const invoice = await db.pharmacyInvoice.create({
      data: {
        invoiceNumber: "PSTACK-" + randomUUID(),
        patientId: patient.id,
        doctorId: doctor.id,
        branchId: branch.id,
        subtotal: 20 * quantity,
        totalAmount: 20 * quantity,
        balanceAmount: 20 * quantity,
        paymentMethod: "CASH",
        billingName: patient.name,
        billingPhone: patient.phone,
        items: {
          create: {
            drugId: s.drug.id,
            inventoryItemId: s.item.id,
            quantity,
            unitPrice: 20,
            totalAmount: 20 * quantity,
          },
        },
      },
    });
    return { ...s, invoice };
  };

  const payloadFor = (s) => ({
    requestKey: randomUUID(),
    patientId: patient.id,
    doctorId: doctor.id,
    billingName: patient.name,
    billingPhone: patient.phone,
    paymentMethod: "CASH",
    items: [
      {
        itemType: "DRUG",
        drugId: s.drug.id,
        inventoryItemId: s.item.id,
        quantity: 5,
        unitPrice: 20,
        taxPercent: 0,
      },
    ],
  });
  const pauseAfterInvoiceLock = () => {
    let release, acquired;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const locked = new Promise((resolve) => {
      acquired = resolve;
    });
    const proxy = new Proxy(db, {
      get(target, key) {
        if (key === "$transaction")
          return (command, options) =>
            target.$transaction(
              (tx) =>
                command(
                  new Proxy(tx, {
                    get(inner, prop) {
                      if (prop === "$queryRaw")
                        return async (...args) => {
                          const result = await inner.$queryRaw(...args);
                          if (String(args[0]).includes("FOR UPDATE")) {
                            acquired();
                            await gate;
                          }
                          return result;
                        };
                      const value = inner[prop];
                      return typeof value === "function"
                        ? value.bind(inner)
                        : value;
                    },
                  }),
                ),
              options,
            );
        const value = target[key];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return {
      service: new PharmacyInvoiceService(proxy, numbering),
      locked,
      release: () => release(),
    };
  };

  await probe("Package recipes leave stock and ledger unchanged", async () => {
    const s = await stockFixture(0);
    await new PharmacyPackageService(db).create(
      {
        name: "Synthetic recipe",
        packagePrice: 20,
        items: [{ drugId: s.drug.id, quantity: 1 }],
      },
      branch.id,
      doctor.id,
    );
    assert.equal(
      (await db.inventoryItem.findUnique({ where: { id: s.item.id } }))
        .currentStock,
      0,
    );
    assert.equal(
      await db.stockTransaction.count({ where: { itemId: s.item.id } }),
      0,
    );
    const unmapped = await db.drug.create({
      data: {
        branchId: branch.id,
        name: "Unmapped recipe only",
        price: 20,
        manufacturerName: "Synthetic",
        packSizeLabel: "1 tablet",
      },
    });
    const before = await db.inventoryItem.count();
    await new PharmacyPackageService(db).create(
      {
        name: "Unmapped recipe",
        packagePrice: 20,
        items: [{ drugId: unmapped.id, quantity: 1 }],
      },
      branch.id,
      doctor.id,
    );
    assert.equal(await db.inventoryItem.count(), before);
    return { onHand: 0, movements: 0, createdInventory: 0 };
  });

  await probe(
    "Posted cancellation requires returns and preserves the posted invoice",
    async () => {
      const s = await invoiceFixture(5);
      for (const status of ["CONFIRMED", "DISPENSED", "COMPLETED"]) {
        await billing.updateStatus(s.invoice.id, status, branch.id, doctor.id);
        await assert.rejects(
          () =>
            billing.updateStatus(
              s.invoice.id,
              "CANCELLED",
              branch.id,
              doctor.id,
            ),
          /Use the sales return workflow/,
        );
        assert.equal(
          (await db.pharmacyInvoice.findUnique({ where: { id: s.invoice.id } }))
            .status,
          status,
        );
      }
      assert.equal(
        (await db.inventoryItem.findUnique({ where: { id: s.item.id } }))
          .currentStock,
        15,
      );
      assert.equal(
        await db.stockTransaction.count({ where: { itemId: s.item.id } }),
        1,
      );
      return {
        originalStock: 20,
        afterRejectedCancel: 15,
        status: "COMPLETED",
        sales: 1,
      };
    },
  );

  for (const command of ["edit", "delete"])
    await probe(
      `Confirmation winning the lock rejects a concurrent draft ${command}`,
      async () => {
        const s = await invoiceFixture();
        const paused = pauseAfterInvoiceLock();
        const confirmation = paused.service.updateStatus(
          s.invoice.id,
          "CONFIRMED",
          branch.id,
          doctor.id,
        );
        await paused.locked;
        const mutation =
          command === "edit"
            ? billing.update(
                s.invoice.id,
                { items: [{ ...payloadFor(s).items[0], quantity: 10 }] },
                branch.id,
              )
            : billing.remove(s.invoice.id, branch.id);
        const rejection = assert.rejects(mutation, /Only draft invoices/);
        paused.release();
        await Promise.all([confirmation, rejection]);
        const saved = await db.pharmacyInvoice.findUnique({
          where: { id: s.invoice.id },
          include: { items: true },
        });
        assert.equal(saved.status, "CONFIRMED");
        assert.equal(saved.items[0].quantity, 1);
        assert.equal(
          (await db.inventoryItem.findUnique({ where: { id: s.item.id } }))
            .currentStock,
          19,
        );
        return { billedUnits: 1, stockUnitsDeducted: 1, status: "CONFIRMED" };
      },
    );

  await probe(
    "An edit winning the lock is what confirmation bills and deducts",
    async () => {
      const s = await invoiceFixture();
      const paused = pauseAfterInvoiceLock();
      const edit = paused.service.update(
        s.invoice.id,
        { items: [{ ...payloadFor(s).items[0], quantity: 10 }] },
        branch.id,
      );
      await paused.locked;
      const confirmation = billing.updateStatus(
        s.invoice.id,
        "CONFIRMED",
        branch.id,
        doctor.id,
      );
      paused.release();
      await Promise.all([edit, confirmation]);
      const saved = await db.pharmacyInvoice.findUnique({
        where: { id: s.invoice.id },
        include: { items: true },
      });
      assert.equal(saved.items[0].quantity, 10);
      assert.equal(saved.balanceAmount, 200);
      assert.equal(
        (await db.inventoryItem.findUnique({ where: { id: s.item.id } }))
          .currentStock,
        10,
      );
      return { billedUnits: 10, stockUnitsDeducted: 10, balance: 200 };
    },
  );

  await probe("Concurrent 80 payments on 100 cannot overcollect", async () => {
    const s = await invoiceFixture(5);
    const outcomes = await Promise.allSettled([
      billing.addPayment(
        s.invoice.id,
        { requestKey: randomUUID(), amount: 80, method: "CASH" },
        branch.id,
      ),
      billing.addPayment(
        s.invoice.id,
        { requestKey: randomUUID(), amount: 80, method: "CASH" },
        branch.id,
      ),
    ]);
    assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
    assert.match(
      outcomes.find((o) => o.status === "rejected").reason.message,
      /exceeds remaining balance/,
    );
    const saved = await db.pharmacyInvoice.findUnique({
      where: { id: s.invoice.id },
      include: { payments: true },
    });
    assert.equal(
      saved.payments.reduce((sum, p) => sum + p.amount, 0),
      80,
    );
    assert.equal(saved.paidAmount, 80);
    assert.equal(saved.balanceAmount, 20);
    return {
      invoiceTotal: 100,
      actualPayments: 80,
      displayedPaid: 80,
      displayedBalance: 20,
    };
  });

  await probe(
    "Duplicate payment returns one receipt and changed payload conflicts",
    async () => {
      const s = await invoiceFixture(5);
      const payment = { requestKey: randomUUID(), amount: 80, method: "CASH" };
      const [a, b] = await Promise.all([
        billing.addPayment(s.invoice.id, payment, branch.id),
        billing.addPayment(s.invoice.id, payment, branch.id),
      ]);
      assert.equal(a.id, b.id);
      await assert.rejects(
        () =>
          billing.addPayment(
            s.invoice.id,
            { ...payment, amount: 20 },
            branch.id,
          ),
        /different payment details/,
      );
      await assert.rejects(
        () => billing.addPayment(s.invoice.id, payment, other.id),
        /Invoice not found/,
      );
      await billing.addPayment(
        s.invoice.id,
        { requestKey: randomUUID(), amount: 20, method: "CASH" },
        branch.id,
      );
      const saved = await db.pharmacyInvoice.findUnique({
        where: { id: s.invoice.id },
        include: { payments: true },
      });
      assert.equal(saved.payments.length, 2);
      assert.equal(saved.paidAmount, 100);
      assert.equal(saved.balanceAmount, 0);
      assert.equal(saved.paymentStatus, "COMPLETED");
      await assert.rejects(
        () => billing.remove(s.invoice.id, branch.id),
        /received payments/,
      );
      await assert.rejects(
        () =>
          billing.update(s.invoice.id, { paymentStatus: "PENDING" }, branch.id),
        /recorded payments/,
      );
      await assert.rejects(
        () =>
          billing.update(
            s.invoice.id,
            { items: [{ ...payloadFor(s).items[0], quantity: 1 }] },
            branch.id,
          ),
        /lower than payments/,
      );
      return { receipts: 2, actualPayments: 100, balance: 0 };
    },
  );

  await probe(
    "Failure while recomputing balance rolls back the payment insert",
    async () => {
      const s = await invoiceFixture(5);
      const proxy = new Proxy(db, {
        get(target, key) {
          if (key === "$transaction")
            return (command) =>
              target.$transaction((tx) =>
                command(
                  new Proxy(tx, {
                    get(inner, prop) {
                      if (prop === "pharmacyInvoice")
                        return new Proxy(inner.pharmacyInvoice, {
                          get(delegate, method) {
                            if (method === "update")
                              return () => {
                                throw new Error(
                                  "synthetic invoice write failure",
                                );
                              };
                            const value = delegate[method];
                            return typeof value === "function"
                              ? value.bind(delegate)
                              : value;
                          },
                        });
                      const value = inner[prop];
                      return typeof value === "function"
                        ? value.bind(inner)
                        : value;
                    },
                  }),
                ),
              );
          const value = target[key];
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
      await assert.rejects(
        () =>
          new PharmacyInvoiceService(proxy, numbering).addPayment(
            s.invoice.id,
            { requestKey: randomUUID(), amount: 80, method: "CASH" },
            branch.id,
          ),
        /synthetic invoice write failure/,
      );
      assert.equal(
        await db.pharmacyPayment.count({ where: { invoiceId: s.invoice.id } }),
        0,
      );
      assert.equal(
        (await db.pharmacyInvoice.findUnique({ where: { id: s.invoice.id } }))
          .balanceAmount,
        100,
      );
      return { receipts: 0, balance: 100 };
    },
  );

  await probe(
    "Concurrent checkout and retry after lost response create one sale",
    async () => {
      const s = await stockFixture();
      const payload = payloadFor(s);
      const [a, b] = await Promise.all([
        billing.checkout(payload, branch.id, doctor.id),
        billing.checkout(payload, branch.id, doctor.id),
      ]);
      const retry = await new PharmacyInvoiceService(db, numbering).checkout(
        payload,
        branch.id,
        doctor.id,
      );
      assert.equal(a.id, b.id);
      assert.equal(a.id, retry.id);
      assert.equal(a.status, "CONFIRMED");
      assert.equal(
        await db.pharmacyInvoice.count({
          where: {
            branchId: branch.id,
            checkoutRequestKey: payload.requestKey,
          },
        }),
        1,
      );
      assert.equal(
        await db.stockTransaction.count({ where: { itemId: s.item.id } }),
        1,
      );
      assert.equal(
        (await db.inventoryItem.findUnique({ where: { id: s.item.id } }))
          .currentStock,
        15,
      );
      await assert.rejects(
        () =>
          billing.checkout(
            { ...payload, notes: "changed" },
            branch.id,
            doctor.id,
          ),
        /different invoice details/,
      );
      await billing.updateStatus(a.id, "CONFIRMED", branch.id, doctor.id);
      assert.equal(
        await db.stockTransaction.count({ where: { itemId: s.item.id } }),
        1,
      );
      return { invoices: 1, sales: 1, remainingStock: 15 };
    },
  );

  await probe(
    "Insufficient stock rolls back the complete checkout",
    async () => {
      const s = await stockFixture(1);
      const payload = payloadFor(s);
      await assert.rejects(
        () => billing.checkout(payload, branch.id, doctor.id),
        /stock/i,
      );
      assert.equal(
        await db.pharmacyInvoice.count({
          where: { checkoutRequestKey: payload.requestKey },
        }),
        0,
      );
      assert.equal(
        await db.stockTransaction.count({ where: { itemId: s.item.id } }),
        0,
      );
      assert.equal(
        (await db.inventoryItem.findUnique({ where: { id: s.item.id } }))
          .currentStock,
        1,
      );
      return { invoices: 0, sales: 0, remainingStock: 1 };
    },
  );

  await probe(
    "Distinct checkouts cannot double spend the same stock",
    async () => {
      const s = await stockFixture(5);
      const outcomes = await Promise.allSettled([
        billing.checkout(payloadFor(s), branch.id, doctor.id),
        billing.checkout(payloadFor(s), branch.id, doctor.id),
      ]);
      assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
      assert.equal(
        await db.stockTransaction.count({ where: { itemId: s.item.id } }),
        1,
      );
      assert.equal(
        (await db.inventoryItem.findUnique({ where: { id: s.item.id } }))
          .currentStock,
        0,
      );
      return { invoices: 1, sales: 1, remainingStock: 0 };
    },
  );

  const prescriptionFixture = async () => {
    const visit = await db.visit.create({
      data: { patientId: patient.id, doctorId: doctor.id, complaints: "[]" },
    });
    return db.prescription.create({
      data: { visitId: visit.id, items: "[]", status: "ACTIVE" },
    });
  };
  const invalidatePrescription = async (prescription, state) => {
    if (state === "deleted")
      await db.visit.update({
        where: { id: prescription.visitId },
        data: { deletedAt: new Date() },
      });
    else
      await db.prescription.update({
        where: { id: prescription.id },
        data:
          state === "expired"
            ? { validUntil: new Date("2000-01-01") }
            : { status: "CANCELLED" },
      });
  };
  for (const state of ["cancelled", "expired", "deleted"]) {
    await probe(
      `Reject ${state} prescriptions on draft creation and relinking`,
      async () => {
        const s = await stockFixture();
        const rx = await prescriptionFixture();
        await invalidatePrescription(rx, state);
        const payload = { ...payloadFor(s), prescriptionId: rx.id };
        const { requestKey, ...draft } = payload;
        await assert.rejects(
          () => billing.create(draft, branch.id, doctor.id),
          /prescription|visit/i,
        );
        await assert.rejects(
          () => billing.checkout(payload, branch.id, doctor.id),
          /prescription|visit/i,
        );
        const existing = await invoiceFixture();
        await assert.rejects(
          () =>
            billing.update(
              existing.invoice.id,
              { prescriptionId: rx.id },
              branch.id,
            ),
          /prescription|visit/i,
        );
        assert.equal(
          (
            await db.pharmacyInvoice.findUnique({
              where: { id: existing.invoice.id },
            })
          ).prescriptionId,
          null,
        );
        assert.equal(
          await db.pharmacyInvoice.count({ where: { prescriptionId: rx.id } }),
          0,
        );
        assert.equal(
          await db.stockTransaction.count({ where: { itemId: s.item.id } }),
          0,
        );
        assert.equal(
          (await db.inventoryItem.findUnique({ where: { id: s.item.id } }))
            .currentStock,
          20,
        );
        return {
          createdInvoices: 0,
          relinkedInvoices: 0,
          sales: 0,
          remainingStock: 20,
        };
      },
    );
    await probe(
      `Recheck ${state} prescription immediately before posting a saved draft`,
      async () => {
        const s = await stockFixture();
        const rx = await prescriptionFixture();
        const { requestKey, ...draft } = {
          ...payloadFor(s),
          prescriptionId: rx.id,
        };
        const invoice = await billing.create(draft, branch.id, doctor.id);
        await invalidatePrescription(rx, state);
        await assert.rejects(
          () =>
            billing.updateStatus(invoice.id, "CONFIRMED", branch.id, doctor.id),
          /prescription|visit/i,
        );
        assert.equal(
          (await db.pharmacyInvoice.findUnique({ where: { id: invoice.id } }))
            .status,
          "DRAFT",
        );
        assert.equal(
          await db.stockTransaction.count({ where: { itemId: s.item.id } }),
          0,
        );
        assert.equal(
          (await db.inventoryItem.findUnique({ where: { id: s.item.id } }))
            .currentStock,
          20,
        );
        return { status: "DRAFT", sales: 0, remainingStock: 20 };
      },
    );
  }

  const observePrescriptionLock = (pause = false) => {
    let release, acquired, attempting;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const locked = new Promise((resolve) => {
      acquired = resolve;
    });
    const attempted = new Promise((resolve) => {
      attempting = resolve;
    });
    const client = new Proxy(db, {
      get(target, key) {
        if (key === "$transaction")
          return (command, options) =>
            target.$transaction(
              (tx) =>
                command(
                  new Proxy(tx, {
                    get(inner, prop) {
                      if (prop === "$queryRaw")
                        return async (...args) => {
                          const prescriptionLock = String(args[0]).includes(
                            "FOR UPDATE OF r",
                          );
                          if (prescriptionLock) attempting();
                          const result = await inner.$queryRaw(...args);
                          if (prescriptionLock) {
                            acquired();
                            if (pause) await gate;
                          }
                          return result;
                        };
                      const value = inner[prop];
                      return typeof value === "function"
                        ? value.bind(inner)
                        : value;
                    },
                  }),
                ),
              options,
            );
        const value = target[key];
        return typeof value === "function" ? value.bind(target) : value;
      },
    });
    return { client, locked, attempted, release: () => release() };
  };
  await probe(
    "Cancellation winning the prescription lock rejects concurrent stock posting",
    async () => {
      const s = await stockFixture();
      const rx = await prescriptionFixture();
      const { requestKey, ...draft } = {
        ...payloadFor(s),
        prescriptionId: rx.id,
      };
      const invoice = await billing.create(draft, branch.id, doctor.id);
      const cancelLock = observePrescriptionLock(true);
      const postingLock = observePrescriptionLock();
      const cancellation = new PrescriptionsService(
        cancelLock.client,
        {},
      ).cancelPrescription(
        rx.id,
        branch.id,
        "Synthetic cancellation",
        doctor.id,
      );
      await cancelLock.locked;
      const posting = new PharmacyInvoiceService(
        postingLock.client,
        numbering,
      ).updateStatus(invoice.id, "CONFIRMED", branch.id, doctor.id);
      const rejected = assert.rejects(posting, /active prescriptions/);
      await postingLock.attempted;
      cancelLock.release();
      await Promise.all([cancellation, rejected]);
      assert.equal(
        (await db.prescription.findUnique({ where: { id: rx.id } })).status,
        "CANCELLED",
      );
      assert.equal(
        (await db.pharmacyInvoice.findUnique({ where: { id: invoice.id } }))
          .status,
        "DRAFT",
      );
      assert.equal(
        (await db.inventoryItem.findUnique({ where: { id: s.item.id } }))
          .currentStock,
        20,
      );
      assert.equal(
        await db.stockTransaction.count({ where: { itemId: s.item.id } }),
        0,
      );
      return {
        prescriptionStatus: "CANCELLED",
        invoiceStatus: "DRAFT",
        remainingStock: 20,
        sales: 0,
      };
    },
  );
  await probe(
    "Stock posting winning the prescription lock commits before cancellation",
    async () => {
      const s = await stockFixture();
      const rx = await prescriptionFixture();
      await db.prescription.update({
        where: { id: rx.id },
        data: { validUntil: new Date("2099-01-01") },
      });
      const { requestKey, ...draft } = {
        ...payloadFor(s),
        prescriptionId: rx.id,
      };
      const invoice = await billing.create(draft, branch.id, doctor.id);
      const postingLock = observePrescriptionLock(true);
      const cancelLock = observePrescriptionLock();
      const posting = new PharmacyInvoiceService(
        postingLock.client,
        numbering,
      ).updateStatus(invoice.id, "CONFIRMED", branch.id, doctor.id);
      await postingLock.locked;
      const cancellation = new PrescriptionsService(
        cancelLock.client,
        {},
      ).cancelPrescription(
        rx.id,
        branch.id,
        "Synthetic cancellation after posting",
        doctor.id,
      );
      await cancelLock.attempted;
      postingLock.release();
      await Promise.all([posting, cancellation]);
      assert.equal(
        (await db.prescription.findUnique({ where: { id: rx.id } })).status,
        "CANCELLED",
      );
      assert.equal(
        (await db.pharmacyInvoice.findUnique({ where: { id: invoice.id } }))
          .status,
        "CONFIRMED",
      );
      assert.equal(
        (await db.inventoryItem.findUnique({ where: { id: s.item.id } }))
          .currentStock,
        15,
      );
      assert.equal(
        await db.stockTransaction.count({ where: { itemId: s.item.id } }),
        1,
      );
      return {
        postingBeforeCancellation: true,
        invoiceStatus: "CONFIRMED",
        remainingStock: 15,
        sales: 1,
      };
    },
  );
  await probe(
    "Changing a prescription-linked draft patient must preserve prescription ownership",
    async () => {
      const s = await stockFixture();
      const rx = await prescriptionFixture();
      const { requestKey, ...draft } = {
        ...payloadFor(s),
        prescriptionId: rx.id,
      };
      const invoice = await billing.create(draft, branch.id, doctor.id);
      const another = await db.patient.create({
        data: {
          branchId: branch.id,
          name: "Other synthetic patient",
          gender: "FEMALE",
          phone: "0000000000",
        },
      });
      await assert.rejects(
        () => billing.update(invoice.id, { patientId: another.id }, branch.id),
        /selected patient/,
      );
      assert.equal(
        (await db.pharmacyInvoice.findUnique({ where: { id: invoice.id } }))
          .patientId,
        patient.id,
      );
      return { originalPatientRetained: true };
    },
  );

  for (const change of [{ status: "INACTIVE" }, { expiryDate: "2000-01-01" }]) {
    for (const command of ["checkout", "confirm"])
      await probe(
        `Reject ${command} when batch ${Object.keys(change)[0]} changes after allocation`,
        async () => {
          const s = await stockFixture();
          const payload = payloadFor(s);
          const { requestKey, ...draft } = payload;
          const invoice =
            command === "confirm"
              ? await billing.create(draft, branch.id, doctor.id)
              : null;
          let changed = false;
          const proxy = new Proxy(db, {
            get(target, key) {
              if (key === "$transaction")
                return (fn, options) =>
                  target.$transaction(
                    (tx) =>
                      fn(
                        new Proxy(tx, {
                          get(inner, prop) {
                            if (prop === "pharmacyInvoice")
                              return new Proxy(inner.pharmacyInvoice, {
                                get(delegate, method) {
                                  if (method === "update")
                                    return async (args) => {
                                      if (
                                        !changed &&
                                        args.data.status === "CONFIRMED"
                                      ) {
                                        changed = true;
                                        await new InventoryService(
                                          db,
                                        ).updateInventoryItem(
                                          s.item.id,
                                          change,
                                          branch.id,
                                        );
                                      }
                                      return delegate.update(args);
                                    };
                                  const value = delegate[method];
                                  return typeof value === "function"
                                    ? value.bind(delegate)
                                    : value;
                                },
                              });
                            const value = inner[prop];
                            return typeof value === "function"
                              ? value.bind(inner)
                              : value;
                          },
                        }),
                      ),
                    options,
                  );
              const value = target[key];
              return typeof value === "function" ? value.bind(target) : value;
            },
          });
          const service = new PharmacyInvoiceService(proxy, numbering);
          await assert.rejects(
            () =>
              command === "checkout"
                ? service.checkout(payload, branch.id, doctor.id)
                : service.updateStatus(
                    invoice.id,
                    "CONFIRMED",
                    branch.id,
                    doctor.id,
                  ),
            /stock|identity/i,
          );
          assert.equal(changed, true);
          assert.equal(
            (await db.inventoryItem.findUnique({ where: { id: s.item.id } }))
              .currentStock,
            20,
          );
          assert.equal(
            await db.stockTransaction.count({ where: { itemId: s.item.id } }),
            0,
          );
          if (invoice)
            assert.equal(
              (
                await db.pharmacyInvoice.findUnique({
                  where: { id: invoice.id },
                })
              ).status,
              "DRAFT",
            );
          else
            assert.equal(
              await db.pharmacyInvoice.count({
                where: { checkoutRequestKey: requestKey },
              }),
              0,
            );
          return {
            changeApplied: change,
            saleRejected: true,
            remainingStock: 20,
            sales: 0,
          };
        },
      );
  }
  const reconcile = () =>
    execFileSync(
      process.execPath,
      [
        root + "/node_modules/prisma/build/index.js",
        "db",
        "execute",
        "--url",
        url,
        "--file",
        root +
          "/backend/prisma/migrations/20261005123000_pharmacy_balance_reconciliation/migration.sql",
      ],
      { cwd: root, stdio: "pipe" },
    );
  await probe(
    "Balance reconciliation derives caches from receipts and is rerunnable",
    async () => {
      const s = await invoiceFixture(5);
      await db.pharmacyInvoice.update({
        where: { id: s.invoice.id },
        data: { paidAmount: 0, balanceAmount: 0 },
      });
      await db.pharmacyPayment.create({
        data: {
          invoiceId: s.invoice.id,
          amount: 30,
          method: "CASH",
          status: "COMPLETED",
        },
      });
      const before = await db.pharmacyPayment.findMany({
        where: { invoiceId: s.invoice.id },
      });
      const oldInvoice = await db.pharmacyInvoice.findUnique({
        where: { id: s.invoice.id },
      });
      reconcile();
      const first = await db.pharmacyInvoice.findUnique({
        where: { id: s.invoice.id },
      });
      assert.equal(first.paidAmount, 30);
      assert.equal(first.balanceAmount, 70);
      assert.equal(first.paymentStatus, "PARTIALLY_PAID");
      assert.equal(first.updatedAt.getTime(), oldInvoice.updatedAt.getTime());
      assert.equal(first.mutationVersion, oldInvoice.mutationVersion);
      reconcile();
      assert.deepEqual(
        await db.pharmacyInvoice.findUnique({ where: { id: s.invoice.id } }),
        first,
      );
      assert.deepEqual(
        await db.pharmacyPayment.findMany({
          where: { invoiceId: s.invoice.id },
        }),
        before,
      );
      return {
        paid: 30,
        balance: 70,
        paymentRowsPreserved: true,
        secondRunUnchanged: true,
      };
    },
  );
  await probe(
    "Balance reconciliation stops visibly on overpayment without altering receipts",
    async () => {
      const s = await invoiceFixture(5);
      const receipt = await db.pharmacyPayment.create({
        data: {
          invoiceId: s.invoice.id,
          amount: 150,
          method: "CASH",
          status: "COMPLETED",
        },
      });
      const before = await db.pharmacyInvoice.findUnique({
        where: { id: s.invoice.id },
      });
      assert.throws(reconcile, /reconciliation stopped/);
      assert.deepEqual(
        await db.pharmacyInvoice.findUnique({ where: { id: s.invoice.id } }),
        before,
      );
      assert.deepEqual(
        await db.pharmacyPayment.findUnique({ where: { id: receipt.id } }),
        receipt,
      );
      return {
        overpaymentReported: true,
        invoiceUnchanged: true,
        receiptUnchanged: true,
      };
    },
  );
})()
  .catch((e) => {
    results.push({ name: "Harness setup", outcome: "FAIL", error: e.message });
    process.exitCode = 1;
  })
  .finally(async () => {
    await db?.$disconnect();
    if (created)
      await admin.$executeRawUnsafe(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.$disconnect();
    fs.writeFileSync(
      "/tmp/billing-integrity-after.json",
      JSON.stringify({ schemaRemoved: created, results }, null, 2),
    );
    console.log(JSON.stringify(results, null, 2));
    if (results.some((r) => r.outcome === "FAIL")) process.exitCode = 1;
  });
