import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  mergeEuraxessOpportunities,
  normalizeEuraxessOpportunityRecord,
  patchEuraxessOpportunity,
  readEuraxessOpportunities,
} from '../lib/euraxess/opportunity-store.mjs';
import { euraxessTopic } from '../lib/euraxess/filters.mjs';

test('execution block survives merge/rescan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'euraxess-exec-'));
  try {
    const filePath = join(dir, 'euraxess-opportunities.json');
    mkdirSync(dir, { recursive: true });
    const base = normalizeEuraxessOpportunityRecord({
      id: 'euraxess-fusion-447781',
      external_id: '447781',
      url: 'https://euraxess.ec.europa.eu/jobs/447781',
      title: 'PhD Position Particle Based Modelling of Scrap Handling for Green Steel Production',
      institution: 'TU Delft',
      summary: 'scrap handling green steel mechanical engineering',
      score: 2.9,
      score_band: 'adjacent_review',
      visible: true,
      archived: false,
      status: 'open_unverified',
      execution: {
        stage: 'making_artifacts',
        ready_checked: true,
        stage_updated_at: '2026-07-12T00:00:00.000Z',
        notes: 'pack in progress',
      },
    });
    writeFileSync(filePath, JSON.stringify({ version: 1, opportunities: [base], scan_summary: {} }, null, 2));

    const incoming = normalizeEuraxessOpportunityRecord({
      id: 'euraxess-fusion-447781',
      external_id: '447781',
      url: 'https://euraxess.ec.europa.eu/jobs/447781',
      title: 'PhD Position Particle Based Modelling of Scrap Handling for Green Steel Production',
      institution: 'TU Delft',
      summary: 'scrap handling green steel mechanical engineering',
      score: 3.1,
      score_band: 'adjacent_review',
      visible: true,
      archived: false,
      status: 'open_unverified',
    });
    const { store } = mergeEuraxessOpportunities([incoming], { filePath, scanSummary: { status: 'ok' } });
    const item = store.opportunities.find(o => o.id === 'euraxess-fusion-447781');
    assert.equal(item.execution.stage, 'making_artifacts');
    assert.equal(item.execution.ready_checked, true);
    assert.equal(item.execution.notes, 'pack in progress');
    assert.equal(euraxessTopic(item), 'manufacturing');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('patch execution ready_checked sets stage', () => {
  const dir = mkdtempSync(join(tmpdir(), 'euraxess-patch-'));
  try {
    const filePath = join(dir, 'data', 'euraxess-opportunities.json');
    mkdirSync(join(dir, 'data'), { recursive: true });
    const base = normalizeEuraxessOpportunityRecord({
      id: 'euraxess-fusion-1',
      external_id: '1',
      url: 'https://euraxess.ec.europa.eu/jobs/1',
      title: 'Project Engineer (Cryogenic)',
      institution: 'ALBA',
      summary: 'cryogenic synchrotron',
      score: 4.2,
      score_band: 'top_priority',
      visible: true,
      archived: false,
      status: 'open_unverified',
    });
    writeFileSync(filePath, JSON.stringify({ version: 1, opportunities: [base], scan_summary: {} }, null, 2));
    const { opportunity } = patchEuraxessOpportunity('euraxess-fusion-1', {
      execution: { ready_checked: true, stage: 'ready_for_application', stage_updated_at: new Date().toISOString() },
    }, filePath);
    assert.equal(opportunity.execution.stage, 'ready_for_application');
    assert.equal(opportunity.execution.ready_checked, true);
    const reread = readEuraxessOpportunities(filePath);
    assert.equal(reread.opportunities[0].execution.stage, 'ready_for_application');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
