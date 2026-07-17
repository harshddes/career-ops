import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  euraxessMatchesFilters,
  euraxessRole,
  euraxessTopic,
} from '../lib/euraxess/filters.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

test('role comes from the title, not body noise', () => {
  assert.equal(euraxessRole({ title: 'Project Engineer (Cryogenic)' }), 'engineer');
  assert.equal(euraxessRole({ title: 'PhD Candidate - Plasmonic Antennas' }), 'phd');
  assert.equal(euraxessRole({ title: 'Postdoctoral Researcher in Plasma Physics' }), 'postdoc_faculty');
  assert.equal(euraxessRole({ title: 'Research Scientist - Sensors' }), 'researcher');
});

test('Green Steel scrap handling PhD is manufacturing / mechanical', () => {
  assert.equal(
    euraxessTopic({
      id: 'euraxess-fusion-447781',
      title: 'PhD Position Particle Based Modelling of Scrap Handling for Green Steel Production',
      summary: 'scrap handling systems for continuous furnace infeed Electric Arc Furnaces (EAFs) particle-based modelling Mechanical Engineering Process engineering',
      url: 'https://euraxess.ec.europa.eu/jobs/447781',
    }),
    'manufacturing',
  );
});

test('topic taxonomy covers electronics, electrical, robotics, materials', () => {
  assert.equal(euraxessTopic({ title: 'Doctoral Candidate - Laboratory for Microelectronics' }), 'electronics');
  assert.equal(euraxessTopic({ title: 'PhD in Electrical Power Engineering' }), 'electrical');
  assert.equal(euraxessTopic({ title: 'PhD Project: Safe Human-Robot Collaboration Using UWB and AI' }), 'robotics');
  assert.equal(euraxessTopic({ title: 'Fixed-term PhD position in materials physical chemistry (M/F)' }), 'materials');
  assert.equal(euraxessTopic({
    title: 'PhD in plasma diagnostics and FPGA readout',
    summary: 'Fusion instrumentation',
    score_breakdown: { strong_matches: ['plasma', 'diagnostics', 'fpga'] },
  }), 'plasma');
});

test('steel scrap is not detectors; cryogenic stays cryogenics', () => {
  assert.equal(
    euraxessTopic({
      title: 'PhD Position Particle Based Modelling of Scrap Handling for Green Steel Production',
      summary: 'Scrap handling for green steel',
      score_breakdown: { strong_matches: ['particle'], adjacent_matches: [] },
    }),
    'manufacturing',
  );
  assert.equal(
    euraxessTopic({
      title: 'Project Engineer (Cryogenic)',
      summary: 'Synchrotron upgrade',
      score_breakdown: { strong_matches: ['cryogenic', 'synchrotron'] },
    }),
    'cryogenics',
  );
});

test('filters combine fit + role + topic without requiring server facets', () => {
  const cryo = {
    title: 'Project Engineer (Cryogenic)',
    summary: 'Synchrotron',
    score_band: 'top_priority',
    visible: true,
    archived: false,
    status: 'open_unverified',
    worker_status: 'queued',
    score_breakdown: { strong_matches: ['cryogenic', 'synchrotron'] },
  };
  assert.equal(euraxessMatchesFilters(cryo, {
    scoreBand: 'visible',
    role: 'engineer',
    topic: 'cryogenics',
    status: 'still_apply',
    ready: 'queued',
  }), true);
  assert.equal(euraxessMatchesFilters(cryo, { scoreBand: 'visible', role: 'phd', topic: 'all' }), false);
  assert.equal(euraxessMatchesFilters(cryo, { scoreBand: 'visible', role: 'all', topic: 'plasma' }), false);
});

test('live store: Green Steel id classifies manufacturing; visible other rate is near zero', () => {
  const store = JSON.parse(readFileSync(join(ROOT, 'data', 'euraxess-opportunities.json'), 'utf-8'));
  const opps = store.opportunities || [];
  const green = opps.find(o => o.id === 'euraxess-fusion-447781' || /447781/.test(o.url || ''));
  assert.ok(green, 'Green Steel opportunity present in store');
  assert.equal(euraxessTopic(green), 'manufacturing');

  const visible = opps.filter(o => o.visible && !o.archived);
  const visibleOther = visible.filter(o => euraxessTopic(o) === 'other');
  assert.ok(
    visibleOther.length <= 1,
    `visible other should be near zero, got ${visibleOther.length}: ${visibleOther.map(o => o.title).join(' | ')}`,
  );
});
