#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const raw = JSON.parse(readFileSync('batch/exhibitors/rocket-lab/greenhouse-jobs-raw.json', 'utf8'));
const jobs = raw.jobs || [];

const keepRes = [
  /instrument/i, /diagnos/i, /detector/i, /sensor/i, /plasma/i, /payload/i,
  /avionics/i, /electrical engineer/i, /electronics engineer/i, /rf engineer/i, /microwave/i,
  /vacuum/i, /propulsion engineer/i, /propulsion test/i, /test engineer/i, /test systems/i,
  /systems engineer/i, /spacecraft systems/i, /integration engineer/i,
  /optical/i, /laser/i, /mass.?spec/i, /ion.?optic/i, /telemetry/i,
  /flight test/i, /environmental test/i, /guidance/i, /navigation/i,
  /materials engineer/i, /manufacturing engineer/i,
  /mechanical engineer/i, /thermal engineer/i, /structural engineer/i,
  /hardware engineer/i, /fpga/i, /embedded software/i, /power systems/i,
  /space systems engineer/i, /mission systems/i, /instrumentation/i,
  /development engineer/i, /ground systems engineer/i,
];

function stripHtml(html = '') {
  return String(html).replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

const scored = [];
for (const j of jobs) {
  const title = j.title || '';
  const loc = j.location?.name || '';
  const content = stripHtml(j.content || '').slice(0, 5000);
  const blob = `${title} ${content}`;
  const citizenshipBlock = /must be a u\.?s\.? (citizen|person)|u\.?s\.? citizenship required|requires an active (secret|ts|top secret)|active secret clearance required|ts\/sci required/i.test(blob)
    || /secret clearance|top secret/i.test(title);
  const keepHit = keepRes.find(r => r.test(title));
  let band = 'skip';
  let score = 2.0;
  let reason = 'title not in instrumentation/hardware target set';

  if (citizenshipBlock) {
    band = 'blocked';
    score = 1.0;
    reason = 'clearance/citizenship hard gate';
  } else if (/intern|co-op|coop /i.test(title)) {
    band = 'skip';
    score = 2.2;
    reason = 'internship/co-op';
  } else if (keepHit) {
    band = 'adjacent';
    score = 3.5;
    reason = `hardware-adjacent: ${keepHit}`;
    if (/avionics|electrical engineer|electronics engineer|payload|instrument|sensor|test engineer|systems engineer|propulsion engineer|propulsion test|ground systems|rf engineer|fpga|optical|laser|vacuum|thermal engineer|space systems|mission systems|instrumentation|hardware engineer|power systems/i.test(title)) {
      band = 'keep';
      score = 4.1;
      reason = `strong hardware/instrumentation fit: ${keepHit}`;
    }
    if (/plasma|detector|optical engineer|laser|vacuum|mass.?spec|fpga|rf engineer|instrumentation/i.test(title)) {
      band = 'keep';
      score = 4.4;
      reason = `core instrumentation/diagnostics adjacency: ${keepHit}`;
    }
    // Generic mechanical/manufacturing/structural stay adjacent (report only) unless avionics/payload/test flavored
    if (/mechanical engineer|manufacturing engineer|structural engineer|materials engineer|development engineer/i.test(title)
      && !/avionics|payload|propulsion|test|instrument|sensor|electrical/i.test(title)) {
      band = 'adjacent';
      score = 3.4;
      reason = 'adjacent hardware manufacturing/mechanical — report only unless user overrides';
    }
  }

  scored.push({
    id: String(j.id),
    title,
    location: loc,
    url: j.absolute_url || `https://job-boards.greenhouse.io/rocketlab/jobs/${j.id}`,
    band,
    score,
    reason,
    dept: j.departments?.[0]?.name || '',
  });
}

const keep = scored.filter(j => j.band === 'keep').sort((a, b) => b.score - a.score || a.title.localeCompare(b.title));
const blocked = scored.filter(j => j.band === 'blocked');
mkdirSync('batch/exhibitors/rocket-lab', { recursive: true });
writeFileSync('batch/exhibitors/rocket-lab/triage.json', `${JSON.stringify({
  scanned: scored.length,
  keep_count: keep.length,
  blocked_count: blocked.length,
  keep,
  blocked,
}, null, 2)}\n`);

console.log(JSON.stringify({
  scanned: scored.length,
  keep: keep.length,
  blocked: blocked.length,
  top: keep.slice(0, 40).map(j => ({ title: j.title, score: j.score, loc: j.location })),
}, null, 2));
