-- Add Google Calendar integration columns to users and appointments
ALTER TABLE "users"
ADD COLUMN "googleCalendarId" TEXT,
ADD COLUMN "googleRefreshToken" TEXT;

ALTER TABLE "appointments"
ADD COLUMN "googleEventId" TEXT;

