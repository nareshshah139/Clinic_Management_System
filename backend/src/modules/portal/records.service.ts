import { BadRequestException, Injectable } from '@nestjs/common';
import { MessageAssignment, Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/database/prisma.service';
import { openPatientMessageItem } from '../messaging/attention';
import { InstrumentContent, Text } from '../follow-ups/content';
import type { PortalPatientPrincipal } from './principal';

export type RecordView = 'home' | 'appointments' | 'visits' | 'check-ins' | 'messages';

const UPCOMING = ['SCHEDULED', 'CONFIRMED'] as const;
const SHOWN_PRESCRIPTIONS = ['ACTIVE', 'COMPLETED', 'EXPIRED'] as const;
const VISIBLE_ASSIGNMENTS: MessageAssignment[] = ['EXACT', 'CONFIRMED'];
/** A call log is a staff note about the patient, not a message to them. */
const PATIENT_CHANNELS = ['WHATSAPP', 'PORTAL'];

/**
 * The prescription fields a patient sees. Anything else in an item (clinicalData carries the
 * visit's diagnosis, prices, HSN codes, warnings for the pharmacist) never leaves (PP-64).
 */
const ITEM_FIELDS = [
  'drugName', 'genericName', 'dosage', 'dosageUnit', 'dosePattern', 'frequency', 'duration', 'durationUnit', 'route', 'timing',
  'instructions', 'applicationSite', 'applicationAmount', 'dayPart', 'leaveOn', 'washOffAfterMinutes', 'taperSchedule',
  'foodInstructions', 'pulseRegimen', 'quantity',
] as const;
export type PrescriptionLine = Partial<Record<(typeof ITEM_FIELDS)[number], string | number | boolean>>;

const doctorName = (d: { firstName: string; lastName: string }) => `Dr. ${[d.firstName, d.lastName].filter(Boolean).join(' ')}`.trim();
const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

export function prescriptionLines(items: string): PrescriptionLine[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(items);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed
    .filter((i): i is Record<string, unknown> => !!i && typeof i === 'object')
    .map((i) => {
      const line: PrescriptionLine = {};
      for (const f of ITEM_FIELDS) {
        const v = i[f];
        if (typeof v === 'string' ? v.trim() : typeof v === 'number' || typeof v === 'boolean') line[f] = typeof v === 'string' ? v.trim() : (v as number | boolean);
      }
      return line;
    })
    .filter((l) => l.drugName);
}

function answerText(item: InstrumentContent['items'][number], value: unknown): Text | string | number | (Text | string)[] | null {
  if (value === undefined || value === null || value === '') return null;
  const label = (v: unknown) => item.options?.find((o) => o.value === v)?.label ?? String(v);
  if (item.type === 'single-choice') return label(value);
  if (item.type === 'multi-choice') return Array.isArray(value) ? value.map(label) : label(value);
  if (item.type === 'scale') return Number(value);
  if (item.type === 'text') return String(value);
  return null;
}

/**
 * @cc [owner:nareshshah139,label:privacy] portal-records-read-only
 * Portal records MUST be read for the patient the guard put in the principal and nobody else,
 * and MUST show only appointments, visit dates with the doctor, prescriptions rendered from
 * Prescription.items and instructions, the patient's check-ins and the message thread: never
 * complaints, history, examination, diagnosis, plan, clinic photos, invoices or lab orders (PP-63, PP-64).
 * Every read is one RECORD_VIEW access event (PP-66).
 */
@Injectable()
export class PortalRecordsService {
  constructor(private readonly prisma: PrismaService) {}

  private viewed(p: PortalPatientPrincipal, view: RecordView, now: Date) {
    return this.prisma.portalAccessEvent.create({ data: { identityId: p.identityId, sessionId: p.sessionId, patientId: p.patientId, kind: 'RECORD_VIEW', view, createdAt: now } });
  }

  private upcoming(patientId: string, now: Date, take?: number) {
    const today = new Date(now.getTime() - (now.getTime() + 330 * 60_000) % 86_400_000);
    return this.prisma.appointment.findMany({
      where: { patientId, status: { in: [...UPCOMING] }, date: { gte: today } },
      orderBy: [{ date: 'asc' }, { slot: 'asc' }],
      take,
      select: { date: true, slot: true, status: true, doctor: { select: { firstName: true, lastName: true } }, branch: { select: { name: true } } },
    }).then((rows) => rows.map((a) => ({ date: a.date, slot: a.slot, status: a.status, doctor: doctorName(a.doctor), branch: a.branch.name })));
  }

  private async visitRows(patientId: string, take?: number) {
    const visits = await this.prisma.visit.findMany({
      where: { patientId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take,
      select: {
        id: true, createdAt: true,
        appointment: { select: { date: true } },
        doctor: { select: { firstName: true, lastName: true } },
        prescription: { select: { status: true, items: true, instructions: true, language: true, createdAt: true } },
      },
    });
    return visits.map((v) => {
      const rx = v.prescription && (SHOWN_PRESCRIPTIONS as readonly string[]).includes(v.prescription.status) ? v.prescription : null;
      return {
        id: v.id,
        date: v.appointment?.date ?? v.createdAt,
        doctor: doctorName(v.doctor),
        prescription: rx && { status: rx.status, language: rx.language, items: prescriptionLines(rx.items), instructions: rx.instructions?.trim() || null, writtenAt: rx.createdAt },
      };
    });
  }

  private async checkInRows(patientId: string, where: Prisma.CheckInWhereInput = {}) {
    const rows = await this.prisma.checkIn.findMany({
      where: { track: { patientId }, state: { not: 'SCHEDULED' }, ...where },
      orderBy: { opensAt: 'desc' },
      take: 50,
      select: {
        id: true, state: true, opensAt: true, closesAt: true, endedAt: true,
        instrumentVersion: { select: { content: true } },
        response: { select: { answers: true, submittedAt: true, _count: { select: { attachments: true } } } },
      },
    });
    return rows.map((c) => {
      const content = c.instrumentVersion.content as unknown as InstrumentContent;
      const answers = (c.response?.answers ?? {}) as Record<string, unknown>;
      return {
        id: c.id,
        title: content.title,
        state: c.state,
        opensAt: c.opensAt,
        closesAt: c.closesAt,
        endedAt: c.endedAt,
        response: c.response && {
          submittedAt: c.response.submittedAt,
          photos: c.response._count.attachments,
          answers: content.items
            .filter((i) => i.type !== 'photo')
            .map((i) => ({ prompt: i.prompt, answer: answerText(i, answers[i.key]) }))
            .filter((a) => a.answer !== null),
        },
      };
    });
  }

  private async thread(patientId: string, take = 200) {
    const rows = await this.prisma.patientMessage.findMany({
      where: { patientId, assignment: { in: VISIBLE_ASSIGNMENTS }, channel: { in: PATIENT_CHANNELS } },
      orderBy: { createdAt: 'desc' },
      take,
      select: { id: true, direction: true, channel: true, body: true, mediaId: true, createdAt: true, _count: { select: { attachments: true } } },
    });
    return rows.reverse().map((m) => ({
      id: m.id,
      from: m.direction === 'INBOUND' ? ('patient' as const) : ('clinic' as const),
      channel: m.channel,
      body: m.body,
      photo: Boolean(m.mediaId) || m._count.attachments > 0,
      at: m.createdAt,
    }));
  }

  async home(p: PortalPatientPrincipal, now = new Date()) {
    const patient = await this.prisma.patient.findUniqueOrThrow({ where: { id: p.patientId }, select: { name: true, branch: { select: { name: true } } } });
    const [next, visits, open, messages] = await Promise.all([
      this.upcoming(p.patientId, now, 1),
      this.visitRows(p.patientId, 10),
      this.checkInRows(p.patientId, { state: 'OPEN' }),
      this.thread(p.patientId, 3),
    ]);
    await this.viewed(p, 'home', now);
    const latest = visits.find((v) => v.prescription);
    return {
      profile: { firstName: firstName(patient.name), branch: patient.branch.name },
      nextAppointment: next[0] ?? null,
      openCheckIns: open.map(({ id, title, closesAt }) => ({ id, title, closesAt })),
      latestPrescription: latest ? { date: latest.date, doctor: latest.doctor, ...latest.prescription! } : null,
      messages,
    };
  }

  async appointments(p: PortalPatientPrincipal, now = new Date()) {
    const upcoming = await this.upcoming(p.patientId, now);
    await this.viewed(p, 'appointments', now);
    return { upcoming };
  }

  async visits(p: PortalPatientPrincipal, now = new Date()) {
    const visits = await this.visitRows(p.patientId, 100);
    await this.viewed(p, 'visits', now);
    return { visits };
  }

  async checkIns(p: PortalPatientPrincipal, now = new Date()) {
    const checkIns = await this.checkInRows(p.patientId);
    await this.viewed(p, 'check-ins', now);
    return { checkIns };
  }

  async messages(p: PortalPatientPrincipal, now = new Date()) {
    const messages = await this.thread(p.patientId);
    await this.viewed(p, 'messages', now);
    return { messages };
  }

  /**
   * @cc [owner:nareshshah139,label:product] portal-message-lands
   * A message written in the portal MUST be stored once per client key as an INBOUND PORTAL
   * message of the chosen patient under that patient's open PATIENT_MESSAGE item (PP-65). It does
   * not open the WhatsApp reply window, which counts WhatsApp messages only.
   */
  async write(p: PortalPatientPrincipal, input: { body: string; clientKey: string }, now = new Date()) {
    const body = input.body.trim();
    if (!body) throw new BadRequestException('Write a message first.');
    await this.prisma.$transaction(async (tx) => {
      const profile = await tx.patientPortalProfile.findUnique({ where: { patientId: p.patientId }, select: { phoneE164: true } });
      const created = await tx.patientMessage.createMany({
        data: [{
          patientId: p.patientId, phoneE164: profile?.phoneE164 ?? '', direction: 'INBOUND', channel: 'PORTAL', kind: 'text', body,
          assignment: 'EXACT', authorKind: 'patient', clientKey: `${p.sessionId}:${input.clientKey}`, createdAt: now,
        }],
        skipDuplicates: true,
      });
      if (created.count) await openPatientMessageItem(tx, { patientId: p.patientId, phoneE164: profile?.phoneE164 ?? '', branchId: p.branchId }, now);
    });
    return { messages: await this.thread(p.patientId) };
  }
}
