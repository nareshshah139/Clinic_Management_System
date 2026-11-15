import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { completeJsonWithCodexOAuth, isCodexOAuthReady, resetCodexOAuthReadiness } from '../../../shared/codex/codex-oauth';

const OUTPUT = '{"bpSystolic":120}';

function writeFakeCodex(directory: string, loginText: string, { hang = false } = {}): string {
  const script = path.join(directory, 'codex');
  fs.writeFileSync(script, `#!/usr/bin/env bash
if [ "$1" = "login" ]; then echo "${loginText}"; exit 0; fi
echo "$@" > "${directory}/args.txt"
cat > "${directory}/stdin.txt"
${hang ? 'exec sleep 30' : ''}
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then printf '%s' '${OUTPUT}' > "$2"; fi
  if [ "$1" = "--output-schema" ]; then cp "$2" "${directory}/schema.json"; fi
  shift
done
`, { mode: 0o755 });
  return script;
}

describe('codex exec helpers', () => {
  let directory: string;
  const saved = process.env.PHARMACY_AGENT_CODEX_PATH;
  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-codex-'));
    resetCodexOAuthReadiness();
  });
  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    if (saved === undefined) delete process.env.PHARMACY_AGENT_CODEX_PATH;
    else process.env.PHARMACY_AGENT_CODEX_PATH = saved;
  });

  it('returns the -o output and hands codex the prompt on stdin and the schema file', async () => {
    process.env.PHARMACY_AGENT_CODEX_PATH = writeFakeCodex(directory, 'Logged in using ChatGPT');
    const schema = { type: 'object', properties: { bpSystolic: { type: ['integer', 'null'] } }, required: ['bpSystolic'], additionalProperties: false };
    await expect(completeJsonWithCodexOAuth({ prompt: 'BP 120 by 80', schema, timeoutMs: 10000 })).resolves.toBe(OUTPUT);
    expect(fs.readFileSync(path.join(directory, 'stdin.txt'), 'utf8')).toBe('BP 120 by 80');
    expect(JSON.parse(fs.readFileSync(path.join(directory, 'schema.json'), 'utf8'))).toEqual(schema);
    const args = fs.readFileSync(path.join(directory, 'args.txt'), 'utf8');
    expect(args).toMatch(/^exec --ephemeral --skip-git-repo-check --ignore-user-config --ignore-rules -s read-only -C \S+ --output-schema \S+\/schema\.json -o \S+\/out\.json -c model_reasoning_effort="low" -\n$/);
  });

  it('passes the model when configured', async () => {
    process.env.PHARMACY_AGENT_CODEX_PATH = writeFakeCodex(directory, 'Logged in using ChatGPT');
    await completeJsonWithCodexOAuth({ prompt: 'p', schema: {}, model: 'test-model', timeoutMs: 10000 });
    expect(fs.readFileSync(path.join(directory, 'args.txt'), 'utf8')).toContain(' -m test-model -c ');
  });

  it('refuses when codex is logged in with an API key', async () => {
    process.env.PHARMACY_AGENT_CODEX_PATH = writeFakeCodex(directory, 'Logged in using an API key');
    await expect(completeJsonWithCodexOAuth({ prompt: 'p', schema: {}, timeoutMs: 10000 })).rejects.toThrow('Codex ChatGPT OAuth login is required on the server.');
    expect(fs.existsSync(path.join(directory, 'args.txt'))).toBe(false);
  });

  it('times out a hung codex', async () => {
    process.env.PHARMACY_AGENT_CODEX_PATH = writeFakeCodex(directory, 'Logged in using ChatGPT', { hang: true });
    const started = Date.now();
    await expect(completeJsonWithCodexOAuth({ prompt: 'p', schema: {}, timeoutMs: 500 })).rejects.toThrow('Codex timed out. Try again.');
    expect(Date.now() - started).toBeLessThan(5000);
  });

  it('reports readiness and caches it for a minute', async () => {
    process.env.PHARMACY_AGENT_CODEX_PATH = writeFakeCodex(directory, 'Logged in using ChatGPT');
    expect(await isCodexOAuthReady()).toBe(true);
    process.env.PHARMACY_AGENT_CODEX_PATH = writeFakeCodex(directory, 'Not logged in');
    expect(await isCodexOAuthReady()).toBe(true);
    resetCodexOAuthReadiness();
    expect(await isCodexOAuthReady()).toBe(false);
  });

  it('reports not ready when codex cannot start', async () => {
    process.env.PHARMACY_AGENT_CODEX_PATH = path.join(directory, 'missing');
    expect(await isCodexOAuthReady()).toBe(false);
  });
});
