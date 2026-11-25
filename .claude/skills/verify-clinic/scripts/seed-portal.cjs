#!/usr/bin/env node
// Seeds two portal patients for the patient portal service proof (clinic-patient-portal scripts/verify-*.cjs) on one phone; Ravi gets an appointment, a visit with a prescription whose
// raw items carry clinical-only fields, and a clinic WhatsApp message. Asha gets nothing.
const { PrismaClient } = require(require.resolve('@prisma/client', { paths: [require('node:path').resolve(__dirname, '../../../../backend')] }));
const s = require(require('node:path').resolve(process.env.STATE));
const PHONE = process.env.PHONE || '9876500044';
const url = new URL('postgresql://postgres:postgres@127.0.0.1:5432/clinic_stack'); url.searchParams.set('schema', s.schema);
const db = new PrismaClient({ datasourceUrl: url.toString() });
(async () => {
  const ids = {};
  for (const name of ['Asha Reddy', 'Ravi Reddy']) {
    const p = await db.patient.create({ data: { name, gender: name.startsWith('Asha') ? 'F' : 'M', phone: PHONE, branchId: s.branchId } });
    await db.patientPortalProfile.create({ data: { patientId: p.id, phoneE164: `+91${PHONE}`, consentState: 'OPTED_IN', phoneConfirmedAt: new Date(), portalEnabled: true } });
    ids[name.split(' ')[0]] = p.id;
  }
  const doctorId = s.users.doctor.id;
  const tomorrow = new Date(Date.now() + 86400000); tomorrow.setUTCHours(0, 0, 0, 0);
  await db.appointment.create({ data: { patientId: ids.Ravi, doctorId, branchId: s.branchId, date: tomorrow, slot: '10:00-10:15' } });
  const visit = await db.visit.create({ data: { patientId: ids.Ravi, doctorId, complaints: 'SECRET-COMPLAINT itchy rash', diagnosis: 'SECRET-DIAGNOSIS', status: 'COMPLETED' } });
  await db.prescription.create({ data: { visitId: visit.id, status: 'ACTIVE', instructions: 'Avoid hot showers.',
    items: JSON.stringify([{ drugName: 'Cetirizine', dosage: '10', dosageUnit: 'mg', frequency: 'Once daily', duration: '5', durationUnit: 'days', clinicalData: { diagnosis: 'SECRET-ITEM-DIAGNOSIS' }, price: 'SECRET-PRICE', hsnCode: 'SECRET-HSN' }]) } });
  await db.patientMessage.create({ data: { patientId: ids.Ravi, phoneE164: `+91${PHONE}`, direction: 'OUTBOUND', channel: 'WHATSAPP', kind: 'text', body: 'Your review is tomorrow at 10.', assignment: 'EXACT', authorKind: 'staff' } });
  console.log(JSON.stringify(ids));
  await db.$disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
