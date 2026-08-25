import './live-env.mjs';

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  peekLiveStamp,
  readLiveCollection,
  readLiveRow,
  resetLiveMemoryForTests,
  upsertLiveRow,
  writeLiveCollection,
  liveEngineName,
  liveSqlitePath,
} from '../lib/db.mjs';
import { getLiveDataDir } from '../lib/data-paths.mjs';
import { resetLiveNormalizedCache } from '../lib/live-collection.mjs';
import {
  patchEuraxessOpportunity,
  writeEuraxessOpportunities,
} from '../lib/euraxess/opportunity-store.mjs';

function fatRow(id, title, blob) {
  return {
    id,
    title,
    institution: 'ITER Organization',
    country: 'France',
    summary: blob,
    score: 4.1,
    score_band: 'strong_review',
    status: 'open_unverified',
    visible: true,
    archived: false,
  };
}

test('upsertLiveRow patches one id and leaves the other row untouched', () => {
  resetLiveMemoryForTests();
  resetLiveNormalizedCache();
  const otherBlob = `keep-${'plasma '.repeat(200)}`;
  writeLiveCollection('euraxess_opportunities', {
    version: 1,
    generated_at: '2026-08-24T00:00:00.000Z',
    opportunities: [
      fatRow('euraxess-fusion-keep', 'Keep me', otherBlob),
      fatRow('euraxess-fusion-patch', 'Patch me', 'before'),
    ],
  });
  const stampBefore = peekLiveStamp('euraxess_opportunities');
  const returned = upsertLiveRow('euraxess_opportunities', {
    ...fatRow('euraxess-fusion-patch', 'Patch me', 'after'),
    notes: 'row-level write',
  }, { scan_summary: { patched: 1 } });
  assert.equal(returned.opportunities.length, 1, 'upsert must not materialize the whole catalog');

  const store = readLiveCollection('euraxess_opportunities');
  const keep = store.opportunities.find(row => row.id === 'euraxess-fusion-keep');
  const patched = store.opportunities.find(row => row.id === 'euraxess-fusion-patch');
  assert.equal(keep.summary, otherBlob);
  assert.equal(patched.summary, 'after');
  assert.equal(patched.notes, 'row-level write');
  assert.equal(readLiveRow('euraxess_opportunities', 'euraxess-fusion-keep').summary, otherBlob);

  if (liveEngineName() === 'sqlite') {
    assert.equal(existsSync(liveSqlitePath()), true);
  } else {
    const walFile = join(getLiveDataDir(), 'euraxess_opportunities', 'wal.ndjson');
    assert.equal(existsSync(walFile), true);
    const wal = readFileSync(walFile, 'utf-8');
    assert.match(wal, /euraxess-fusion-patch/);
    assert.doesNotMatch(wal, /euraxess-fusion-keep/);
  }
  assert.notEqual(peekLiveStamp('euraxess_opportunities'), stampBefore);
});

test('canonical EURAXESS patch writes compact JSON on a temp file, not pretty dumps', () => {
  const dir = mkdtempSync(join(tmpdir(), 'euraxess-compact-'));
  const filePath = join(dir, 'euraxess-opportunities.json');
  writeEuraxessOpportunities({
    opportunities: [fatRow('euraxess-fusion-1', 'Compact write', 'x'.repeat(80))],
  }, filePath);
  const raw = readFileSync(filePath, 'utf-8');
  assert.equal(raw.includes('\n  "'), false);
  assert.match(raw, /"id":"euraxess-fusion-1"/);
  const { opportunity } = patchEuraxessOpportunity('euraxess-fusion-1', { fit_rationale: 'one field' }, filePath);
  assert.equal(opportunity.fit_rationale, 'one field');
  const after = readFileSync(filePath, 'utf-8');
  assert.equal(after.includes('\n  "opportunities"'), false);
});
