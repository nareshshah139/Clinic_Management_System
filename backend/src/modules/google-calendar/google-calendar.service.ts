import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { google, calendar_v3 } from 'googleapis';
import { PrismaService } from '../../shared/database/prisma.service';
import { SchedulingUtils } from '../appointments/utils/scheduling.utils';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar';

@Injectable()
export class GoogleCalendarService {
  private readonly logger = new Logger('GoogleCalendarService');

  constructor(private readonly prisma: PrismaService) {}

  isConfigured(): boolean {
    return !!(process.env.GCAL_CLIENT_ID && process.env.GCAL_CLIENT_SECRET && process.env.GCAL_REDIRECT_URI);
  }

  private createOAuthClient() {
    const clientId = process.env.GCAL_CLIENT_ID;
    const clientSecret = process.env.GCAL_CLIENT_SECRET;
    const redirectUri = process.env.GCAL_REDIRECT_URI;

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
      state: state || undefined,
    });
  }

  async handleOAuthCallback(userId: string, code: string) {
    if (!code) {
      throw new BadRequestException('Missing code');
    }

    const oauth2Client = this.ensureClient();
    let tokens;
    try {
      ({ tokens } = await oauth2Client.getToken(code));
    } catch (err: any) {
      const apiMessage =
        err?.response?.data?.error_description ||
        err?.response?.data?.error ||
        err?.message ||
        'Unknown token exchange error';
      this.logger.warn(`Google token exchange failed for user ${userId}: ${apiMessage}`);
      throw new BadRequestException(`Google token exchange failed: ${apiMessage}`);
    }

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

    const calendarId = 'primary';
    let selectedCalendar: calendar_v3.Schema$Calendar | null = null;
    try {
      const primaryCalendar = await calendar.calendars.get({ calendarId });
      selectedCalendar = primaryCalendar.data;
    } catch (err) {
      this.logger.warn(`Failed to read primary calendar: ${err instanceof Error ? err.message : String(err)}`);
    }

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

  /**
   * Resolve Google Calendar credentials for the sync.
   * Uses the caller's credentials (whoever is logged in and has connected their Google Calendar).
   */
  private async resolveCalendarCredentials(callerUserId?: string) {
    if (!callerUserId) return null;
    const user = await this.prisma.user.findUnique({
      where: { id: callerUserId },
      select: { googleRefreshToken: true, googleCalendarId: true },
    });
    if (!user?.googleRefreshToken) return null;
    return { refreshToken: user.googleRefreshToken, calendarId: user.googleCalendarId || 'primary' };
  }

  async syncAppointmentEvent(appointmentId: string, callerUserId?: string): Promise<{ eventId?: string; error?: string }> {
    const oauth2Client = this.createOAuthClient();
    if (!oauth2Client) {
      this.logger.warn(`Calendar sync skipped for appointment ${appointmentId}: Google Calendar not configured (missing GCAL_* env vars)`);
      return { error: 'Google Calendar not configured on server' };
    }

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

    if (!appointment) {
      this.logger.warn(`Calendar sync: appointment ${appointmentId} not found`);
      return { error: 'Appointment not found' };
    }

    // Try caller first (the logged-in user), then fall back to the doctor
    const callerCreds = await this.resolveCalendarCredentials(callerUserId);
    const doctorCreds = appointment.doctor?.googleRefreshToken
      ? { refreshToken: appointment.doctor.googleRefreshToken, calendarId: appointment.doctor.googleCalendarId || 'primary' }
      : null;
    const creds = callerCreds || doctorCreds;

    if (!creds) {
      this.logger.warn(`Calendar sync skipped for appointment ${appointmentId}: no connected Google Calendar (caller=${callerUserId}, doctor=${appointment.doctorId})`);
      return { error: 'No connected Google Calendar. Please connect via the appointments page.' };
    }

    const slot = SchedulingUtils.parseTimeSlot(appointment.slot);
    const dateStr = appointment.date.toISOString().split('T')[0];
    const tz = 'Asia/Kolkata';

    oauth2Client.setCredentials({ refresh_token: creds.refreshToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    const patientName = appointment.patient?.name || 'Patient';
    const doctorName = `${appointment.doctor?.firstName ?? ''} ${appointment.doctor?.lastName ?? ''}`.trim();

    const requestBody: calendar_v3.Schema$Event = {
      summary: `${patientName} — ${appointment.visitType ?? 'Appointment'}`,
      description: `Doctor: ${doctorName || 'Doctor'}\nPatient: ${patientName}\nVisit type: ${
        appointment.visitType || ''
      }\nSlot: ${appointment.slot}${appointment.room ? `\nRoom: ${appointment.room.name}` : ''}`,
      start: { dateTime: `${dateStr}T${slot.start}:00`, timeZone: tz },
      end: { dateTime: `${dateStr}T${slot.end}:00`, timeZone: tz },
      attendees: [
        appointment.patient?.email ? { email: appointment.patient.email, displayName: patientName } : undefined,
        appointment.doctor?.email ? { email: appointment.doctor.email, displayName: doctorName || undefined } : undefined,
      ].filter(Boolean) as calendar_v3.Schema$EventAttendee[],
      reminders: { useDefault: true },
    };

    try {
      if (appointment.googleEventId) {
        await calendar.events.patch({
          calendarId: creds.calendarId,
          eventId: appointment.googleEventId,
          requestBody,
        });
        this.logger.log(`Calendar event updated: ${appointment.googleEventId} for appointment ${appointmentId}`);
        return { eventId: appointment.googleEventId };
      }

      const insert = await calendar.events.insert({
        calendarId: creds.calendarId,
        requestBody,
      });

      if (insert.data.id) {
        await this.prisma.appointment.update({
          where: { id: appointment.id },
          data: { googleEventId: insert.data.id },
        });
        this.logger.log(`Calendar event created: ${insert.data.id} for appointment ${appointmentId}`);
        return { eventId: insert.data.id };
      }

      return { error: 'Google API returned no event ID' };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to sync appointment ${appointmentId} to Google Calendar: ${msg}`);
      return { error: msg };
    }
  }

  async deleteAppointmentEvent(appointmentId: string, callerUserId?: string) {
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

    const callerCreds = await this.resolveCalendarCredentials(callerUserId);
    const doctor = await this.prisma.user.findUnique({
      where: { id: appointment.doctorId },
      select: { googleRefreshToken: true, googleCalendarId: true },
    });
    const doctorCreds = doctor?.googleRefreshToken
      ? { refreshToken: doctor.googleRefreshToken, calendarId: doctor.googleCalendarId || 'primary' }
      : null;
    const creds = callerCreds || doctorCreds;

    if (!creds) return;

    oauth2Client.setCredentials({ refresh_token: creds.refreshToken });

    const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

    try {
      await calendar.events.delete({
        calendarId: creds.calendarId,
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
