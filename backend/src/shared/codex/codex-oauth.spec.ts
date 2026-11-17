import { ServiceUnavailableException } from '@nestjs/common';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { codexDiagnostic, CodexFailure, completeJsonWithCodexOAuth, isCodexOAuthReady, resetCodexOAuthReadiness } from './codex-oauth';

const PATIENT = 'Meera Iyer has had a dry cough for nine days and takes metformin 500 mg';
const PROMPT = `You fill a clinic form.\n<transcript>\n${PATIENT}\n</transcript>\nReturn JSON only.`;
const NOT_SUPPORTED =
  'ERROR: unexpected status 400 Bad Request: {"detail":"The \'gpt-x\' model is not supported when using Codex with a ChatGPT account."}';
const REQUEST_FAILED = 'Codex request failed. Check the server OAuth login and model availability.';

function sixteenCharRuns(text: string): string[] {
  const flat = text.toLowerCase().replace(/\s+/g, ' ');
  return Array.from({ length: flat.length - 15 }, (_, i) => flat.slice(i, i + 16));
}

const sharesRunWith = (haystack: string, secret: string) => {
  const flat = haystack.toLowerCase().replace(/\s+/g, ' ');
  return sixteenCharRuns(secret).some((run) => flat.includes(run));
};

describe('codexDiagnostic', () => {
  it('keeps only the error report from output that echoes the prompt', () => {
    const output = [
      'OpenAI Codex v0.98.0 (research preview)',
      '--------',
      'workdir: /tmp/codex-json-abc',
      'model: gpt-x',
      '--------',
      'user',
      PROMPT,
      NOT_SUPPORTED,
    ].join('\n');
    const diagnostic = codexDiagnostic(output, [PROMPT]);
    expect(diagnostic).toBe(NOT_SUPPORTED);
    expect(sharesRunWith(diagnostic, PATIENT)).toBe(false);
  });

  it('drops an error line that quotes the prompt', () => {
    const output = `ERROR: invalid_request near "${PATIENT.slice(0, 30)}"\n${NOT_SUPPORTED}`;
    expect(codexDiagnostic(output, [PROMPT])).toBe(NOT_SUPPORTED);
  });

  it('drops an error line that quotes the prompt with different case and spacing', () => {
    const output = `Error: could not parse MEERA  IYER HAS had\ta dry cough`;
    expect(codexDiagnostic(output, [PROMPT])).toBe('');
  });

  it('redacts bearer tokens, sk- keys, JWTs and long hex runs', () => {
    const output = [
      'ERROR: unauthorized: Authorization: Bearer abcDEF123456789xyz rejected',
      'error: invalid api key sk-proj-AbC123dEf456GhI789',
      'ERROR: forbidden token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U',
    ].join('\n');
    expect(codexDiagnostic(output, [])).toBe([
      'ERROR: unauthorized: Authorization: Bearer [redacted] rejected',
      'error: invalid api key [redacted]',
      'ERROR: forbidden token [redacted]',
    ].join(' | '));
    expect(codexDiagnostic('ERROR: request 0123456789abcdef0123456789abcdef01 failed', [])).toBe('ERROR: request [redacted] failed');
  });

  it('keeps the last three error lines', () => {
    const output = ['ERROR: one', 'ERROR: two', 'some progress', 'ERROR: three', 'ERROR: four'].join('\n');
    expect(codexDiagnostic(output, [])).toBe('ERROR: two | ERROR: three | ERROR: four');
  });

  it('cuts a long error line to 300 characters', () => {
    const line = `ERROR: ${'stream error '.repeat(100)}`.slice(0, 1000);
    expect(codexDiagnostic(line, [])).toBe(line.slice(0, 300));
  });

  it('strips ANSI colour codes and drops lines Codex did not mark as an error', () => {
    const output = '\u001b[31mERROR\u001b[0m: stream disconnected before completion\n2025-11-17T10:00:00.123Z  WARN usage limit reached\nall good';
    expect(codexDiagnostic(output, [])).toBe('ERROR: stream disconnected before completion');
  });

  it('drops a line of model output that only contains an error-like word', () => {
    const output = 'The patient asked for a fitness certificate and the request timed out twice.\nERROR: unexpected status 429 Too Many Requests';
    expect(codexDiagnostic(output, [])).toBe('ERROR: unexpected status 429 Too Many Requests');
  });

  it('redacts a short quoted piece of input and a phone number, and keeps a quoted identifier', () => {
    const output = [
      "ERROR: unexpected status 400: {\"error\":{\"message\":\"Invalid value 'Meera Iyer' at input, call 98450 12301\"}}",
      "ERROR: unexpected status 400: The 'gpt-x' model is not supported; field `chiefComplaints` rejected 'సునీత దేవి'",
    ].join('\n');
    expect(codexDiagnostic(output, [])).toBe(
      "ERROR: unexpected status 400: {\"error\":{\"message\":\"Invalid value '[redacted]' at input, call [redacted]\"}} | "
      + "ERROR: unexpected status 400: The 'gpt-x' model is not supported; field `chiefComplaints` rejected '[redacted]'",
    );
  });

  it('drops an error line that echoes short transcript lines JSON-escaped', () => {
    const secret = 'Transcript:\nMeera Iyer\n9876543210\nfever 3 days';
    const output = 'ERROR: invalid input="Meera Iyer\\n9876543210\\nfever 3 days"\nERROR: unexpected status 400';
    expect(codexDiagnostic(output, [secret])).toBe('ERROR: unexpected status 400');
  });

  it('drops a sentence that merely begins with the word Error', () => {
    const output = 'Error in prescription noted for Ms Iyer; filling chief complaint.\nerror: stream closed';
    expect(codexDiagnostic(output, [])).toBe('error: stream closed');
  });

  it('returns an empty string for empty output', () => {
    expect(codexDiagnostic('', [PROMPT])).toBe('');
  });
});

describe('completeJsonWithCodexOAuth failures through a real child process', () => {
  let directory: string;
  const saved = process.env.PHARMACY_AGENT_CODEX_PATH;

  function fakeCodex(login: string, exec: string): string {
    const script = path.join(directory, 'codex');
    fs.writeFileSync(script, `#!/usr/bin/env bash
if [ "$1" = "login" ]; then ${login}; fi
${exec}
`, { mode: 0o755 });
    return script;
  }

  beforeEach(() => {
    directory = fs.mkdtempSync(path.join(os.tmpdir(), 'fake-codex-'));
    resetCodexOAuthReadiness();
  });
  afterEach(() => {
    fs.rmSync(directory, { recursive: true, force: true });
    if (saved === undefined) delete process.env.PHARMACY_AGENT_CODEX_PATH;
    else process.env.PHARMACY_AGENT_CODEX_PATH = saved;
  });

  const failure = async (timeoutMs = 10000): Promise<CodexFailure> => {
    const error = await completeJsonWithCodexOAuth({ prompt: PROMPT, schema: {}, timeoutMs }).then(
      () => undefined,
      (caught: unknown) => caught,
    );
    expect(error).toBeInstanceOf(CodexFailure);
    expect(error).toBeInstanceOf(ServiceUnavailableException);
    return error as CodexFailure;
  };

  it('reports a failed exec with its exit code and a diagnostic free of the prompt', async () => {
    process.env.PHARMACY_AGENT_CODEX_PATH = fakeCodex(
      'echo "Logged in using ChatGPT"; exit 0',
      `echo "user"; cat; echo; echo '${NOT_SUPPORTED.replace(/'/g, "'\\''")}' >&2; exit 1`,
    );
    const error = await failure();
    expect({ kind: error.kind, exitCode: error.exitCode, signal: error.signal, message: error.message, diagnostic: error.diagnostic }).toEqual({
      kind: 'codex-exec', exitCode: 1, signal: null, message: REQUEST_FAILED, diagnostic: NOT_SUPPORTED,
    });
    expect(sharesRunWith(error.diagnostic, PATIENT)).toBe(false);
  });

  it('reports a timeout', async () => {
    process.env.PHARMACY_AGENT_CODEX_PATH = fakeCodex('echo "Logged in using ChatGPT"; exit 0', 'exec sleep 5');
    const error = await failure(200);
    expect({ kind: error.kind, message: error.message }).toEqual({ kind: 'codex-timeout', message: 'Codex timed out. Try again.' });
  });

  it('reports a binary that cannot start', async () => {
    process.env.PHARMACY_AGENT_CODEX_PATH = path.join(directory, 'missing');
    const error = await failure();
    expect({ kind: error.kind, exitCode: error.exitCode, message: error.message }).toEqual({
      kind: 'codex-start', exitCode: null, message: 'Codex could not start. Check PHARMACY_AGENT_CODEX_PATH.',
    });
    expect(error.diagnostic).toBe(`Error: spawn ${path.join(directory, 'missing')} ENOENT`);
  });

  it('reports an API key login', async () => {
    process.env.PHARMACY_AGENT_CODEX_PATH = fakeCodex('echo "Logged in using an API key"; exit 0', 'exit 0');
    const error = await failure();
    expect({ kind: error.kind, exitCode: error.exitCode, message: error.message }).toEqual({
      kind: 'codex-login', exitCode: 0, message: 'Codex ChatGPT OAuth login is required on the server.',
    });
  });

  it('reports a failing login status as a login failure with the existing message', async () => {
    process.env.PHARMACY_AGENT_CODEX_PATH = fakeCodex('echo "Not logged in" >&2; exit 1', 'exit 0');
    const error = await failure();
    expect({ kind: error.kind, exitCode: error.exitCode, message: error.message }).toEqual({
      kind: 'codex-login', exitCode: 1, message: REQUEST_FAILED,
    });
    expect(await isCodexOAuthReady()).toBe(false);
  });
});
