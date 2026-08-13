import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { NEVER_STAGE, collectResetPaths } from '../scripts/push-local-to-github.mjs';

test('nightly GitHub sync never stages .env or force-pushes', () => {
  const source = readFileSync(new URL('../scripts/push-local-to-github.mjs', import.meta.url), 'utf-8');
  const cmd = readFileSync(new URL('../scripts/push-local-to-github.cmd', import.meta.url), 'utf-8');
  assert.ok(NEVER_STAGE.includes('WEB-TRACKER/.env'));
  assert.ok(NEVER_STAGE.includes('.env'));
  assert.ok(collectResetPaths().includes('WEB-TRACKER/.env'));
  assert.match(source, /\['add', '-f', '--', APPLICATIONS_FILE\]/);
  assert.match(source, /git\(\['push'\]\)/);
  assert.doesNotMatch(source, /push', '--force/);
  assert.doesNotMatch(source, /git config/);
  assert.match(cmd, /push-local-to-github\.mjs/);
  assert.match(cmd, /github-sync\.log/);
});
