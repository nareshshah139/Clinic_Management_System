import { extractWithCodexOAuth } from './codex-oauth';

describe('extractWithCodexOAuth failures', () => {
  const saved = process.env.PHARMACY_AGENT_CODEX_PATH;
  afterEach(() => {
    if (saved === undefined) delete process.env.PHARMACY_AGENT_CODEX_PATH;
    else process.env.PHARMACY_AGENT_CODEX_PATH = saved;
  });

  it('explains an unavailable bill reader in plain words without server settings', async () => {
    process.env.PHARMACY_AGENT_CODEX_PATH = '/nonexistent/codex-binary';
    const error: any = await extractWithCodexOAuth('prompt', []).catch(e => e);
    expect(error.message).toBe('The bill reader is not available right now. Type the bill instead, or try again later.');
    expect(error.message).not.toContain('PHARMACY_AGENT');
    expect(error.getStatus()).toBe(503);
  });
});
