// Repo path: backend/src/modules/voice/voice.controller.ts
// One free status route and three parse routes, one per intent. Each parse route carries exactly
// the roles and permissions of the write its form's confirm calls, so the parser is never a wider
// door than the form. voice.controller.spec.ts reflects on both controllers and fails if they drift.
//
// Throttling: ThrottlerModule (@Global) and ThrottlerGuard (APP_GUARD) are already registered once,
// in auth.module.ts:12-17 and :33-36. Global guards apply in module scan order, AppModule's own
// first (@nestjs/core scanner.js:100-106), so JwtAuthGuard has set req.user before ThrottlerGuard
// runs. This module adds only route-level @Throttle metadata. See rationale "Problems found" 1.

import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { UserRole } from '@prisma/client';
import type { ParsedAppointment, ParsedStockCount, ParsedVisitNote, VoiceStatus } from '@cms/shared-types/voice';
import { Roles } from '../../shared/decorators/roles.decorator';
import { Permissions } from '../../shared/decorators/permissions.decorator';
import { VoiceService } from './voice.service';
import { ParseRequestDto } from './voice.dto';

/** Per signed-in user; IP only if a route were ever reached without a user. */
export function voiceUserTracker(req: Record<string, any>): string {
  return req.user?.id ? `user:${req.user.id}` : `ip:${req.ip}`;
}

/**
 * @cc [owner:nareshshah139,label:security] voice-parse-throttled
 * Each parse route MUST allow at most 20 requests per 60 seconds per signed-in user; @nestjs/throttler
 * 6.x reads ttl in milliseconds.
 */
export const VOICE_PARSE_THROTTLE = {
  default: { ttl: 60_000, limit: 20, getTracker: voiceUserTracker },
} as const;

/** Every staff role. OWNER, ADMIN and DOCTOR pass RolesGuard anyway; the effect is that PATIENT is refused. */
export const VOICE_STAFF_ROLES = [
  UserRole.NURSE, UserRole.RECEPTION, UserRole.PHARMACIST, UserRole.MANAGER, UserRole.LAB_TECH, UserRole.ACCOUNTANT,
] as const;

/**
 * @cc [owner:nareshshah139,label:security] voice-parse-same-door
 * Each parse route MUST require the same roles and permissions as the write its form confirms:
 * visit-note as PATCH /visits/:id, appointment as POST /appointments, stock-count as
 * POST /drugs/inventory-change-requests. No route in this controller writes.
 */
@Controller('voice')
export class VoiceController {
  constructor(private readonly voice: VoiceService) {}

  /**
   * @cc [owner:nareshshah139,label:security] voice-status-free
   * GET /voice/status MUST refuse PATIENT logins, MUST answer for spoken and typed input alike, and
   * MUST report only whether a key is configured without contacting the provider.
   */
  @Get('status')
  @Roles(...VOICE_STAFF_ROLES)
  status(): VoiceStatus {
    return this.voice.status();
  }

  /** Mirrors VisitsController.update (visits.controller.ts:462-464). */
  @Post('visit-note')
  @HttpCode(200)
  @Roles(UserRole.DOCTOR, UserRole.ADMIN, UserRole.OWNER)
  @Throttle(VOICE_PARSE_THROTTLE)
  visitNote(@Body() body: ParseRequestDto): Promise<ParsedVisitNote> {
    return this.voice.parse('visit-note', body.text);
  }

  /** Mirrors AppointmentsController.create (appointments.controller.ts:47-49). */
  @Post('appointment')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.DOCTOR, UserRole.NURSE, UserRole.RECEPTION)
  @Permissions('appointments:create')
  @Throttle(VOICE_PARSE_THROTTLE)
  appointment(@Body() body: ParseRequestDto): Promise<ParsedAppointment> {
    return this.voice.parse('book-appointment', body.text);
  }

  /** Mirrors DrugController.createInventoryChangeRequests (drug.controller.ts:138-140). */
  @Post('stock-count')
  @HttpCode(200)
  @Roles(UserRole.ADMIN, UserRole.PHARMACIST)
  @Permissions('pharmacy:drug:inventory-change:create')
  @Throttle(VOICE_PARSE_THROTTLE)
  stockCount(@Body() body: ParseRequestDto): Promise<ParsedStockCount> {
    return this.voice.parse('stock-count', body.text);
  }
}
