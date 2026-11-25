import { Body, Controller, Get, HttpCode, Logger, Post, UnauthorizedException } from '@nestjs/common';
import { Caller, PortalInternal } from './portal-internal.decorator';
import type { PortalCaller } from './portal-call';
import { identityOf } from './session-caller';
import { ChooseProfileDto, CodeRequestDto, VerifyDto } from '../portal/sign-in.dto';
import { CODE_REJECTED_MESSAGE, CODE_REQUEST_ANSWER, SignInService } from '../portal/sign-in.service';

/** Every code request is answered after this long, whatever happened (PP-55). */
export const codeAnswerMs = () => Number(process.env.PORTAL_CODE_ANSWER_MS) || 1500;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Sign-in, profile choice and sign-out for the patient portal service (PP-55 to PP-61).
 * The portal service keeps the session token in its own cookie and sends it back as a `session` caller.
 */
@Controller('internal/portal')
@PortalInternal()
export class InternalSignInController {
  private readonly logger = new Logger(InternalSignInController.name);

  constructor(private readonly signIn: SignInService) {}

  private principal = (caller: PortalCaller) => identityOf(this.signIn, caller);

  @Post('sign-in/code')
  @HttpCode(200)
  async requestCode(@Body() body: CodeRequestDto) {
    const started = Date.now();
    const work = this.signIn.requestCode(body.phone).catch((e) => this.logger.error(`Sign-in code request failed: ${(e as Error).message}`));
    // The answer comes at a fixed time whatever happened, so a sent code and a refused one look the same.
    await Promise.race([work, sleep(codeAnswerMs())]);
    await sleep(Math.max(0, codeAnswerMs() - (Date.now() - started)));
    return CODE_REQUEST_ANSWER;
  }

  @Post('sign-in/verify')
  @HttpCode(200)
  async verify(@Body() body: VerifyDto) {
    const outcome = await this.signIn.verifyCode(body.phone, body.code);
    if (!outcome.ok) throw new UnauthorizedException(CODE_REJECTED_MESSAGE);
    return { token: outcome.token, absoluteExpiresAt: outcome.absoluteExpiresAt.toISOString(), ...(await this.signIn.profileList(outcome.principal)) };
  }

  @Get('session')
  async session(@Caller() caller: PortalCaller) {
    return this.signIn.profileList(await this.principal(caller));
  }

  @Post('session/profile')
  @HttpCode(200)
  async choose(@Caller() caller: PortalCaller, @Body() body: ChooseProfileDto) {
    const principal = await this.principal(caller);
    if (!(await this.signIn.chooseProfile(principal, body.ref))) throw new UnauthorizedException('That profile is not available on this number.');
    return this.signIn.profileList(principal);
  }

  @Post('sign-out')
  @HttpCode(200)
  async signOut(@Caller() caller: PortalCaller) {
    await this.signIn.signOut(await this.principal(caller), false);
    return { signedOut: true };
  }

  @Post('sign-out-everywhere')
  @HttpCode(200)
  async signOutEverywhere(@Caller() caller: PortalCaller) {
    await this.signIn.signOut(await this.principal(caller), true);
    return { signedOut: true };
  }
}
