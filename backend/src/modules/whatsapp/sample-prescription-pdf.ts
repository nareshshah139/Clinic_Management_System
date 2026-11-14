export type SampleClinic = {
  name: string;
  address: string;
  phone: string | null;
};

const SAMPLE_MEDICINES = [
  {
    name: 'Paracetamol 500 mg tablet',
    dose: '1 tablet three times a day after food',
    duration: '3 days',
  },
  {
    name: 'Cetirizine 10 mg tablet',
    dose: '1 tablet at night',
    duration: '5 days',
  },
];

/** A one-page prescription that says on its face it is a sample, so a test send is never mistaken for care. */
export function renderSamplePrescriptionPdf(
  clinic: SampleClinic,
  doctorName: string,
  date: string,
): Promise<Buffer> {
  const PDFDocument = require('pdfkit');
  const doc = new PDFDocument({
    size: 'A4',
    margin: 48,
    info: { Title: 'Sample prescription', Author: clinic.name },
  });
  const chunks: Buffer[] = [];
  doc.on('data', (chunk: Buffer) => chunks.push(chunk));
  const done = new Promise<Buffer>((resolve) =>
    doc.on('end', () => resolve(Buffer.concat(chunks))),
  );

  doc.fontSize(18).text(clinic.name, { align: 'center' });
  doc.fontSize(10).text(clinic.address, { align: 'center' });
  if (clinic.phone) doc.text(`Phone: ${clinic.phone}`, { align: 'center' });
  doc.moveDown();
  const top = doc.y;
  doc.rect(48, top, doc.page.width - 96, 34).fill('#B91C1C');
  doc
    .fillColor('#FFFFFF')
    .fontSize(13)
    .text('SAMPLE - NOT FOR CLINICAL USE', 48, top + 10, {
      width: doc.page.width - 96,
      align: 'center',
    });
  doc.fillColor('#000000').moveDown(2);
  doc.x = 48;
  doc.fontSize(11).text('Patient: Test Patient (fictional)');
  doc.text(`Date: ${date}`);
  doc.text(doctorName);
  doc.moveDown();
  doc.fontSize(13).text('Rx');
  doc.fontSize(11);
  SAMPLE_MEDICINES.forEach((medicine, index) => {
    doc.moveDown(0.5).text(`${index + 1}. ${medicine.name}`);
    doc
      .fontSize(10)
      .text(`   ${medicine.dose} for ${medicine.duration}`)
      .fontSize(11);
  });
  doc.moveDown(2);
  doc
    .fontSize(9)
    .fillColor('#444444')
    .text(
      "This document was sent to test the clinic's WhatsApp link. It is not a prescription and must not be dispensed.",
    );
  doc.end();
  return done;
}
