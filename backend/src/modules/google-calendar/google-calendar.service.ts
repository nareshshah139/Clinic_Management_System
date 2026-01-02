import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';
import { PrismaService } from '../../shared/database/prisma.service';
import { SchedulingUtils } from '../appointments/utils/scheduling.utils';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger('GoogleCalendarService');

  constructor(private readonly prisma: PrismaService) {}

  private createOAuthClient() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      return null;
    }

    return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  }

  private ensureClient() {
    const client = this.createOAuthClient();
    if (!client) {
      throw new BadRequestException('Google Calendar is not configured on the server');
    }
    return client;
  }

  async getStatus(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        googleCalendarId: true,
        googleRefreshToken: true,
        email: true,
      },
    });

    return {
      connected: !!user?.googleRefreshToken,
      calendarId: user?.googleCalendarId || null,
      email: user?.email || null,
    };
  }

  async generateAuthUrl(state?: string) {
    const oauth2Client = this.ensureClient();
    return oauth2Client.generateAuthUrl({
      access_type: 'offline',
      prompt: 'consent',
      scope: [CALENDAR_SCOPE],
      state,
    });
  }

  async handleOAuthCallback(userId: string, code: string) {
    if (!code) {
      throw new BadRequestException('Missing code');
    }

    const oauth2Client = this.ensureClient();
    const { tokens } = await oauth2Client.getToken(code);

    // Preserve existing refresh token if Google returns only an access token
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { googleRefreshToken: true },
    });

    const refreshToken = tokens.refresh_token || user?.googleRefreshToken;

    if (!refreshToken) {
      throw new BadRequestException('Google did not return a refresh token. Please retry with "consent" prompt.');
    }

    oauth2Client.setCredentials({
      refresh_token: refreshToken,
      access_token: tokens.access_token,
      expiry_date: tokens.expiry_date,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    let selectedCalendar: calendar_v3.Schema$CalendarListEntry | undefined;
    try {
      const list = await calendar.calendarList.list({ maxResults: 5 });
      selectedCalendar =
        list.data.items?.find((c) => c.primary) ||
        list.data.items?.[0];
    } catch (err) {
      this.logger.warn(`Failed to read calendar list: ${err instanceof Error ? err.message : String(err)}`);
    }

    const calendarId = selectedCalendar?.id || 'primary';

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        googleRefreshToken: refreshToken,
        googleCalendarId: calendarId,
      },
    });

    return {
      calendarId,
      email: selectedCalendar?.summary || selectedCalendar?.id || null,
    };
  }

  async disconnect(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: {
        googleRefreshToken: null,
        googleCalendarId: null,
      },
    });
  }

  async syncAppointmentEvent(appointmentId: string) {
    const oauth2Client = this.createOAuthClient();
    if (!oauth2Client) return; // Not configured, fail silently

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      include: {
        patient: { select: { id: true, name: true, email: true, phone: true } },
        doctor: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            googleCalendarId: true,
            googleRefreshToken: true,
          },
        },
        room: { select: { name: true, type: true } },
      },
    });

    if (!appointment?.doctor?.googleRefreshToken) {
      return; // Doctor not connected
    }

    const slot = SchedulingUtils.parseTimeSlot(appointment.slot);
    const dateStr = appointment.date.toISOString().split('T')[0];
    const tz = 'Asia/Kolkata';

    oauth2Client.setCredentials({
      refresh_token: appointment.doctor.googleRefreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendarId = appointment.doctor.googleCalendarId || 'primary';

    const patientName = appointment.patient?.name || 'Patient';
    const doctorName = `${appointment.doctor.firstName ?? ''} ${appointment.doctor.lastName ?? ''}`.trim();

    const requestBody: calendar_v3.Schema$Event = {
      summary: `${patientName} — ${appointment.visitType ?? 'Appointment'}`,
      description: `Doctor: ${doctorName || 'Doctor'}\nPatient: ${patientName}\nVisit type: ${
        appointment.visitType || ''
      }\nSlot: ${appointment.slot}${appointment.room ? `\nRoom: ${appointment.room.name}` : ''}`,
      start: { dateTime: `${dateStr}T${slot.start}:00`, timeZone: tz },
      end: { dateTime: `${dateStr}T${slot.end}:00`, timeZone: tz },
      attendees: [
        appointment.patient?.email ? { email: appointment.patient.email, displayName: patientName } : undefined,
        appointment.doctor.email ? { email: appointment.doctor.email, displayName: doctorName || undefined } : undefined,
      ].filter(Boolean) as calendar_v3.Schema$EventAttendee[],
      reminders: { useDefault: true },
    };

    try {
      if (appointment.googleEventId) {
        await calendar.events.patch({
          calendarId,
          eventId: appointment.googleEventId,
          requestBody,
        });
        return appointment.googleEventId;
      }

      const insert = await calendar.events.insert({
        calendarId,
        requestBody,
      });

      if (insert.data.id) {
        await this.prisma.appointment.update({
          where: { id: appointment.id },
          data: { googleEventId: insert.data.id },
        });
        return insert.data.id;
      }
    } catch (err) {
      this.logger.warn(`Failed to sync appointment ${appointmentId} to Google: ${err instanceof Error ? err.message : String(err)}`);
    }

    return undefined;
  }

  async deleteAppointmentEvent(appointmentId: string) {
    const oauth2Client = this.createOAuthClient();
    if (!oauth2Client) return;

    const appointment = await this.prisma.appointment.findUnique({
      where: { id: appointmentId },
      select: {
        googleEventId: true,
        doctorId: true,
      },
    });

    if (!appointment?.googleEventId) return;

    const doctor = await this.prisma.user.findUnique({
      where: { id: appointment.doctorId },
      select: { googleRefreshToken: true, googleCalendarId: true },
    });

    if (!doctor?.googleRefreshToken) return;

    oauth2Client.setCredentials({
      refresh_token: doctor.googleRefreshToken,
    });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });
    const calendarId = doctor.googleCalendarId || 'primary';

    try {
      await calendar.events.delete({
        calendarId,
        eventId: appointment.googleEventId,
      });
      await this.prisma.appointment.update({
        where: { id: appointmentId },
        data: { googleEventId: null },
      });
    } catch (err) {
      this.logger.warn(`Failed to delete Google event for appointment ${appointmentId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

