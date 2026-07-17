import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  mergePhdscannerOpportunities,
  normalizePhdscannerOpportunityRecord,
  writePhdscannerOpportunities,
} from '../lib/phdscanner/opportunity-store.mjs';

function tempStorePath() {
  return join(mkdtempSync(join(tmpdir(), 'career-ops-phdscanner-exec-')), 'phdscanner-opportunities.json');
}

test('execution stage survives merge/rescan', () => {
  const filePath = tempStorePath();
  writePhdscannerOpportunities({
    version: 1,
    opportunities: [
      normalizePhdscannerOpportunityRecord({
        id: 'phdscanner-keep',
        title: 'PhD plasma diagnostics',
        university: 'Demo',
        url: 'https://example.org/keep',
        score: 4.0,
        status: 'open',
        execution: {
          stage: 'making_artifacts',
          ready_checked: true,
          stage_updated_at: '2026-07-01T00:00:00.000Z',
        },
        artifacts: { research_report: 'reports/phdscanner-keep.md' },
      }),
    ],
  }, filePath);

  const { store } = mergePhdscannerOpportunities([
    {
      id: 'phdscanner-keep',
      title: 'PhD plasma diagnostics',
      university: 'Demo',
      url: 'https://example.org/keep',
      score: 4.1,
      status: 'open',
      summary: 'rescanned',
    },
  ], { filePath });

  const item = store.opportunities.find(o =>
    o.id === 'phdscanner-keep'
    || o.external_id === 'keep'
    || (o.sources || []).some(source => source.external_id === 'keep' || /keep/.test(source.url || ''))
    || /plasma diagnostics/i.test(o.title || '')
  );
  assert.ok(item);
  assert.equal(item.execution.stage, 'making_artifacts');
  assert.equal(item.artifacts.research_report, 'reports/phdscanner-keep.md');
});
