import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { twitchBuildEnvironment } from './twitch-build-env.mjs';

let projectRoot;
beforeEach(() => {
  projectRoot = mkdtempSync(path.join(tmpdir(), 'twitch-build-env-test-'));
});
afterEach(() => {
  rmSync(projectRoot, { recursive: true, force: true });
});

test('loads only the Client ID from .env.local and preserves the parent environment', () => {
  writeFileSync(
    path.join(projectRoot, '.env.local'),
    '# local app\nTWITCH_CLIENT_ID="  testLocalClient  "\nOTHER_SETTING=notLoaded\n',
  );
  const original = { PATH: 'test-path' };
  assert.deepEqual(twitchBuildEnvironment(projectRoot, original), {
    PATH: 'test-path',
    TWITCH_CLIENT_ID: 'testLocalClient',
  });
  assert.deepEqual(original, { PATH: 'test-path' });
});

test('prefers the CI/build environment over the local file', () => {
  writeFileSync(path.join(projectRoot, '.env.local'), 'TWITCH_CLIENT_ID=testLocalClient\n');
  assert.equal(
    twitchBuildEnvironment(projectRoot, { TWITCH_CLIENT_ID: 'testCiClient' }).TWITCH_CLIENT_ID,
    'testCiClient',
  );
});

test('supports builds with only an environment variable and no local file', () => {
  assert.equal(
    twitchBuildEnvironment(projectRoot, { TWITCH_CLIENT_ID: 'testClient' }).TWITCH_CLIENT_ID,
    'testClient',
  );
});

test('fails clearly when no Client ID is configured', () => {
  assert.throws(() => twitchBuildEnvironment(projectRoot, {}), /TWITCH_CLIENT_ID is required/);
});

test('rejects empty environment values instead of silently using the local ID', () => {
  writeFileSync(path.join(projectRoot, '.env.local'), 'TWITCH_CLIENT_ID=testLocalClient\n');
  for (const value of ['', '   ']) {
    assert.throws(
      () => twitchBuildEnvironment(projectRoot, { TWITCH_CLIENT_ID: value }),
      /TWITCH_CLIENT_ID is required/,
    );
  }
});

test('rejects empty local configuration and embedded whitespace', () => {
  writeFileSync(path.join(projectRoot, '.env.local'), 'TWITCH_CLIENT_ID=\n');
  assert.throws(() => twitchBuildEnvironment(projectRoot, {}), /TWITCH_CLIENT_ID is required/);
  for (const value of ['test client', 'test\nclient', 'test\tclient']) {
    assert.throws(
      () => twitchBuildEnvironment(projectRoot, { TWITCH_CLIENT_ID: value }),
      /must not contain whitespace/,
    );
  }
});

test('does not hide local file errors other than a missing file', () => {
  mkdirSync(path.join(projectRoot, '.env.local'));
  assert.throws(() => twitchBuildEnvironment(projectRoot, {}));
});
