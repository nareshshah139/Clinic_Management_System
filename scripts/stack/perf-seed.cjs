const DAY = "2026-11-20";

async function seed({ db, branch, users }) {
  const other = await db.branch.create({ data: { name: "Synthetic satellite clinic", address: "Test only" } });
  const doctors = [users.doctor.id];
  for (let i = 1; i <= 4; i++) {
    const doctor = await db.user.create({ data: {
      branchId: i === 4 ? other.id : branch.id, role: "DOCTOR",
      email: `perf-doctor-${i}@example.invalid`, password: "not-a-login", firstName: "Synthetic", lastName: `Doctor ${i}`,
    } });
    doctors.push(doctor.id);
  }
  for (const [key, branchId, count, schedule, staff] of [
    ["main", branch.id, 40000, doctors.slice(0, 4), users.pharmacist.id],
    ["other", other.id, 10000, doctors.slice(4), doctors[4]],
  ]) {
    await db.$executeRawUnsafe(`
      INSERT INTO patients (id, name, gender, phone, email, "branchId", "primaryDoctorId", "createdAt", "updatedAt")
      SELECT $1 || '-p-' || n, (ARRAY['Asha','Mira','Amit','Vijay'])[1+n%4] || ' ' ||
        (ARRAY['Shah','Patel','Iyer','Rao','Joshi','Patil','Das','Khan','Singh','Nair','Seth'])[1+n%11],
        CASE WHEN n%4<2 THEN 'FEMALE' ELSE 'MALE' END, '91' || lpad((n*7919%100000000)::text,8,'0'),
        'patient-' || n || '@example.invalid', $2, ($4::text[])[1+n%cardinality($4::text[])],
        '${DAY}'::date - (n%2500) * interval '1 day', now()
      FROM generate_series(1,$3::int) n
    `, key, branchId, count, schedule);
    await db.$executeRawUnsafe(`
      INSERT INTO appointments (id, "patientId", "doctorId", "branchId", date, slot, status, "tokenNumber", "updatedAt")
      SELECT $1 || '-a-' || n, $1 || '-p-' || (1+n*13%$3::int),
        ($4::text[])[1+(n-1)%cardinality($4::text[])], $2,
        '${DAY} 04:30'::timestamp - ((n-1)/(20*cardinality($4::text[])))*interval '1 day',
        to_char(time '09:00' + ((n-1)/cardinality($4::text[])%20)*interval '15 minutes','HH24:MI'),
        (CASE WHEN n>20*cardinality($4::text[]) THEN 'COMPLETED' WHEN n%5=0 THEN 'CHECKED_IN' ELSE 'SCHEDULED' END)::"AppointmentStatus",
        1+(n-1)/cardinality($4::text[])%20, now()
      FROM generate_series(1,$3::int*2) n
    `, key, branchId, count, schedule);
    await db.$executeRawUnsafe(`
      INSERT INTO visits (id, "patientId", "doctorId", "appointmentId", complaints, exam, plan, diagnosis, status,
                           "createdAt", "updatedAt", "deletedAt")
      SELECT $1 || '-v-' || n, COALESCE(a."patientId",$1 || '-p-' || (1+n*17%$2::int)),
        COALESCE(a."doctorId",($3::text[])[1+n%cardinality($3::text[])]), a.id,
        (ARRAY['Routine follow-up','Itchy rash','Headache','Medication review'])[1+n%4],
        repeat('Synthetic exam findings. ', 10), repeat('Synthetic treatment instructions. ', 10),
        CASE WHEN n%3=0 THEN 'Dermatitis' ELSE 'Routine review' END, 'COMPLETED',
        COALESCE(a.date,'${DAY} 04:30'::timestamp - ((n-1)/160)*interval '1 day') + n%3600*interval '1 second',
        now(), CASE WHEN n%73=0 THEN now() END
      FROM generate_series(1,$2::int*4) n
      LEFT JOIN appointments a ON a.id = $1 || '-a-' || CASE WHEN n>160 AND n%2=0 THEN (n/2)::text END
    `, key, count, schedule);
    const service = await db.service.create({ data: { branchId, name: "Consultation", type: "CONSULTATION", priceMrp: 500, priceNet: 500 } });
    await db.$executeRawUnsafe(`
      INSERT INTO new_invoices (id, "invoiceNo", "patientId", "visitId", "appointmentId", "branchId", total, balance, received, status, "createdAt", "updatedAt")
      SELECT $1 || '-i-' || n, $1 || '-CB-' || n, v."patientId", v.id, v."appointmentId", $2, 500,
        CASE WHEN n%10=0 THEN 500 ELSE 0 END, CASE WHEN n%10=0 THEN 0 ELSE 500 END, 'CONFIRMED', v."createdAt", now()
      FROM generate_series(1,$3::int) n JOIN visits v ON v.id=$1 || '-v-' || (n*4)
    `, key, branchId, count);
    await db.$executeRawUnsafe(`
      INSERT INTO new_invoice_items (id, "invoiceId", "serviceId", name, "unitPrice", total, "updatedAt")
      SELECT i.id || '-line', i.id, $2, 'Consultation', 500, 500, now()
      FROM new_invoices i WHERE i."branchId"=$1
    `, branchId, service.id);
    await db.$executeRawUnsafe(`
      INSERT INTO new_payments (id, "invoiceId", amount, mode, "reconStatus", "createdAt", "receivedAt", "updatedAt")
      SELECT id || '-payment', id, received, 'UPI', 'COMPLETED', "createdAt", "createdAt", now()
      FROM new_invoices WHERE "branchId"=$1 AND received>0
    `, branchId);
    await db.$executeRawUnsafe(`
      INSERT INTO drugs (id, name, price, "manufacturerName", "packSizeLabel", "branchId", "updatedAt")
      SELECT $1 || '-d-' || n, (ARRAY['Paracetamol','Cetirizine','Clotrimazole','Sunscreen'])[1+n%4] || ' ' || n,
        50, 'Synthetic Labs', '10 tablets', $2, now()
      FROM generate_series(1,1000) n
    `, key, branchId);
    await db.$executeRawUnsafe(`
      INSERT INTO inventory_items (id, name, "branchId", type, "costPrice", "sellingPrice", unit,
                                   "currentStock", "stockStatus", "batchNumber", "expiryDate", "updatedAt")
      SELECT d.id || '-b-' || b, d.name, $1, 'MEDICINE', 25, 50, 'STRIPS', 1000, 'IN_STOCK', 'Batch ' || b,
        now()+b*interval '1 year', now()
      FROM drugs d CROSS JOIN generate_series(1,3) b WHERE d."branchId"=$1
    `, branchId);
    await db.$executeRawUnsafe(`
      INSERT INTO "_DrugToInventoryItem" ("A","B")
      SELECT d.id,d.id || '-b-' || b FROM drugs d CROSS JOIN generate_series(1,3) b WHERE d."branchId"=$1
    `, branchId);
    await db.$executeRawUnsafe(`
      INSERT INTO stock_transactions (id, "branchId", "itemId", "userId", type, quantity, "quantityDelta", "unitPrice",
                                      "totalAmount", "batchNumber", "expiryDate", "updatedAt")
      SELECT id || '-opening', "branchId", id, $2, 'PURCHASE', 1000, 1000, 25, 25000, "batchNumber", "expiryDate", now()
      FROM inventory_items WHERE "branchId"=$1
    `, branchId, staff);
    await db.$executeRawUnsafe(`
      INSERT INTO pharmacy_invoices (id,"invoiceNumber","patientId","branchId",subtotal,"totalAmount","paidAmount",
                                     "paymentMethod","paymentStatus","billingName","billingPhone",status,"invoiceDate","createdAt","updatedAt","createdById")
      SELECT $1 || '-rx-' || n, $1 || '-RX-' || n, p.id, $2, 100, 100, 100, 'UPI','COMPLETED',
        p.name,p.phone,'CONFIRMED','${DAY} 05:00'::timestamp-(n/35)*interval '1 day',
        '${DAY} 05:00'::timestamp-(n/35)*interval '1 day',now(),$4
      FROM generate_series(1,$3::int) n JOIN patients p ON p.id=$1 || '-p-' || n
    `, key, branchId, count, staff);
    await db.$executeRawUnsafe(`
      INSERT INTO pharmacy_invoice_items (id,"invoiceId","drugId",quantity,"unitPrice","totalAmount","updatedAt")
      SELECT i.id || '-line-' || n,i.id,$1 || '-d-' || (1+(substring(i.id from '[0-9]+$')::int+n)%1000),1,50,50,now()
      FROM pharmacy_invoices i CROSS JOIN generate_series(1,2) n WHERE i."branchId"=$2
    `, key, branchId);
    await db.$executeRawUnsafe(`
      INSERT INTO pharmacy_payments (id,"invoiceId",amount,method,status,"paymentDate","createdAt","updatedAt")
      SELECT id || '-payment',id,"paidAmount",'UPI','COMPLETED',"invoiceDate","createdAt",now()
      FROM pharmacy_invoices WHERE "branchId"=$1
    `, branchId);
  }
  for (const table of [
    "patients", "appointments", "visits", "new_invoices", "new_invoice_items", "new_payments",
    "drugs", "inventory_items", '"_DrugToInventoryItem"', "stock_transactions",
    "pharmacy_invoices", "pharmacy_invoice_items", "pharmacy_payments",
  ]) await db.$executeRawUnsafe(`ANALYZE ${table}`);
}

module.exports = { DAY, seed };
