import { Body, Controller, Get, HttpCode, Logger, Post, Res, UnauthorizedException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Portal, SignedIn } from './portal.decorator';
import type { PortalIdentityPrincipal } from './principal';
import { CODE_REQUEST_ANSWER, CODE_REJECTED_MESSAGE, SignInService } from './sign-in.service';
import { ChooseProfileDto, CodeRequestDto, VerifyDto } from './sign-in.dto';
import { SESSION_COOKIE, cookieOptions } from './session';

/** Every code request is answered after this long, whatever happened (PP-55). */
export const codeAnswerMs = () => Number(process.env.PORTAL_CODE_ANSWER_MS) || 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Sign-in, profile choice and sign-out for the portal (PP-55 to PP-61). */
@ApiTags('Portal')
@Controller('portal')
export class SignInController {
  private readonly logger = new Logger(SignInController.name);

  constructor(private readonly signIn: SignInService) {}

  @Post('auth/code')
  @HttpCode(200)
  @Portal('sign-in')
  async requestCode(@Body() body: CodeRequestDto) {
    const started = Date.now();
    const work = this.signIn.requestCode(body.phone).catch((e) => this.logger.error(`Sign-in code request failed: ${(e as Error).message}`));
    // The answer comes at a fixed time whatever happened, so a sent code and a refused one look the same.
    await Promise.race([work, sleep(codeAnswerMs())]);
    await sleep(Math.max(0, codeAnswerMs() - (Date.now() - started)));
    return CODE_REQUEST_ANSWER;
  }

  @Post('auth/verify')
  @HttpCode(200)
  @Portal('sign-in')
  async verify(@Body() body: VerifyDto, @Res({ passthrough: true }) res: Response) {
    const outcome = await this.signIn.verifyCode(body.phone, body.code);
    if (!outcome.ok) throw new UnauthorizedException(CODE_REJECTED_MESSAGE);
    res.cookie(SESSION_COOKIE, outcome.token, cookieOptions(outcome.absoluteExpiresAt.getTime() - Date.now()));
    return this.signIn.profileList(outcome.principal);
  }

  @Get('session')
  @Portal('session')
  async session(@SignedIn() principal: PortalIdentityPrincipal) {
    return this.signIn.profileList(principal);
  }

  @Post('session/profile')
  @HttpCode(200)
  @Portal('session')
  async choose(@SignedIn() principal: PortalIdentityPrincipal, @Body() body: ChooseProfileDto) {
    if (!(await this.signIn.chooseProfile(principal, body.ref))) throw new UnauthorizedException('That profile is not available on this number.');
    return this.signIn.profileList(principal);
  }

  @Post('auth/sign-out')
  @HttpCode(200)
  @Portal('session')
  async signOut(@SignedIn() principal: PortalIdentityPrincipal, @Res({ passthrough: true }) res: Response) {
    await this.signIn.signOut(principal, false);
    res.cookie(SESSION_COOKIE, '', cookieOptions(0));
    return { signedOut: true };
  }

  @Post('auth/sign-out-everywhere')
  @HttpCode(200)
  @Portal('session')
  async signOutEverywhere(@SignedIn() principal: PortalIdentityPrincipal, @Res({ passthrough: true }) res: Response) {
    await this.signIn.signOut(principal, true);
    res.cookie(SESSION_COOKIE, '', cookieOptions(0));
    return { signedOut: true };
  }
}
