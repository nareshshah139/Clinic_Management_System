import { ReportsService } from '../reports.service';
import { ExportFormat, ReportType } from '../dto/reports.dto';

const range = { startDate: '2026-01-01', endDate: '2026-01-31' };

describe('ReportsService PDF export', () => {
  it('returns a complete PDF with its trailer', async () => {
    const service = new ReportsService({} as any);
    jest.spyOn(service, 'generatePatientReport').mockResolvedValue({
      totalPatients: 3,
      newPatients: 1,
      returningPatients: 2,
      registrationTrends: Array.from({ length: 40 }, (_, i) => ({ date: `d${i}`, registrations: i })),
    } as any);

    const result = await service.exportReport({ reportType: ReportType.PATIENT, exportFormat: ExportFormat.PDF, parameters: range as any }, 'A');

    const bytes = Buffer.from(result.fileUrl.split(',')[1], 'base64');
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    expect(bytes.subarray(-8).toString()).toContain('%%EOF');
    expect(result.fileSize).toBe(bytes.length);
  });
});

describe('Doctor revenue visitCount', () => {
  it('counts visits, not distinct patients', async () => {
    const doctor = { id: 'd1', firstName: 'Asha', lastName: 'Rao' };
    const pay = (id: string, visitId: string) => ({ amount: 100, invoice: { id, patientId: 'p1', visitId, appointmentId: null, visit: { doctor }, appointment: null } });
    const prisma = { newPayment: { findMany: jest.fn().mockResolvedValue([pay('i1', 'v1'), pay('i2', 'v2'), pay('i3', 'v2')]) } };
    const service = new ReportsService(prisma as any);

    const [row] = await (service as any).getDoctorRevenueBreakdown({});

    expect(row.patientCount).toBe(1);
    expect(row.visitCount).toBe(2);
  });
});

describe('Appointment room names', () => {
  it('shows the room name instead of its id', async () => {
    const prisma = {
      appointment: {
        count: jest.fn().mockResolvedValue(1),
        groupBy: jest.fn().mockResolvedValue([]),
        findMany: jest.fn().mockResolvedValue([{ id: 'a1', date: new Date('2026-01-05T05:00:00Z'), status: 'COMPLETED', doctorId: 'd1', roomId: 'room-1', slot: '10:00' }]),
      },
      room: { findMany: jest.fn().mockResolvedValue([{ id: 'room-1', name: 'Consultation Room 1' }]) },
    };
    const service = new ReportsService(prisma as any);

    const report = await service.generateAppointmentReport({ ...range, includeRoomUtilization: true } as any, 'A');

    expect(report.roomUtilization[0].roomName).toBe('Consultation Room 1');
  });
});
