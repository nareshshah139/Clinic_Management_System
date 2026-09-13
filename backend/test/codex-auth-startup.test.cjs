const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const startup = path.resolve(__dirname, '../start.sh');
const cache = value => JSON.stringify({ auth_mode: 'chatgpt', tokens: { access_token: value } });

function runStartup({ existing, bootstrap } = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'clinic-auth-startup-'));
  const authHome = path.join(directory, 'codex-home');
  const bin = path.join(directory, 'bin');
  fs.mkdirSync(authHome);
  fs.mkdirSync(bin);
  if (existing !== undefined) fs.writeFileSync(path.join(authHome, 'auth.json'), existing, { mode: 0o600 });
  fs.writeFileSync(path.join(bin, 'node'), '#!/bin/sh\nif [ "$1" = "dist/main.js" ]; then\n  test -z "$CODEX_AUTH_JSON_B64" && test -z "$CODEX_ACCESS_TOKEN" || exit 41\n  echo APP_STARTED\n  exit 0\nfi\nexec "$TEST_NODE_EXECUTABLE" "$@"\n', { mode: 0o700 });
  fs.writeFileSync(path.join(bin, 'codex'), '#!/bin/sh\nif [ "$1" = login ] && [ "$2" = status ]; then\n  test -s "$CODEX_HOME/auth.json" || exit 1\n  echo "Logged in using ChatGPT"\n  exit 0\nfi\nexit 42\n', { mode: 0o700 });
  try {
    const result = spawnSync('/bin/sh', [startup], {
      cwd: directory,
      env: {
        PATH: `${bin}:/usr/bin:/bin`,
        CODEX_HOME: authHome,
        TEST_NODE_EXECUTABLE: process.execPath,
        ...(bootstrap === undefined ? {} : { CODEX_AUTH_JSON_B64: Buffer.from(bootstrap).toString('base64') }),
      },
      encoding: 'utf8', timeout: 10000,
    });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /APP_STARTED/);
    const authPath = path.join(authHome, 'auth.json');
    return { output: result.stdout, auth: fs.existsSync(authPath) ? fs.readFileSync(authPath, 'utf8') : null };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('restart preserves refreshed credentials instead of restoring stale bootstrap credentials', () => {
  const refreshed = cache('refreshed-fixture');
  const result = runStartup({ existing: refreshed, bootstrap: cache('stale-fixture') });
  assert.equal(result.auth, refreshed);
  assert.doesNotMatch(result.output, /refreshed-fixture|stale-fixture/);
});

test('first boot initializes the auth cache when no persistent cache exists', () => {
  const initial = cache('bootstrap-fixture');
  assert.equal(runStartup({ bootstrap: initial }).auth, initial);
});

test('invalid bootstrap does not prevent the application from starting', () => {
  const result = runStartup({ bootstrap: 'invalid-fixture' });
  assert.equal(result.auth, null);
  assert.match(result.output, /invalid/);
});

test('existing server login works without bootstrap credentials', () => {
  const existing = cache('device-login-fixture');
  assert.equal(runStartup({ existing }).auth, existing);
});
