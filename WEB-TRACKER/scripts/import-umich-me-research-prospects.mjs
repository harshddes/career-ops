#!/usr/bin/env node
/**
 * Merge U-M Mechanical Engineering faculty prospects into the existing
 * umich research prospect store without wiping other departments.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  readResearchProspects,
  syncResearchProspectsToDashboard,
  writeResearchProspects,
} from '../lib/research-prospect-store.mjs';
import { applyResearchFitScoring } from '../lib/research-fit-scoring.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ARTIFACT = join(__dirname, '..', 'research', 'umich-me-faculty-prospects-2026.json');
const RESEARCH_DATE = '2026-07-09';

function identityKeys(prospect) {
  return [
    prospect.id,
    prospect.contact_email ? `email:${String(prospect.contact_email).toLowerCase()}` : '',
    prospect.profile_url ? `url:${String(prospect.profile_url).toLowerCase()}` : '',
  ].filter(Boolean);
}

function validateProspects(items) {
  const seen = new Set();
  const errors = [];
  for (const prospect of items) {
    if (!prospect.name) errors.push(`${prospect.id || 'unknown'} missing name`);
    if (!prospect.department) errors.push(`${prospect.name || prospect.id} missing department`);
    if (!Number.isFinite(Number(prospect.score))) errors.push(`${prospect.name || prospect.id} missing score`);
    if (!prospect.profile_url && !prospect.lab_url && !prospect.evidence?.some(item => item.url)) {
      errors.push(`${prospect.name || prospect.id} missing source URL`);
    }
    const key = `${String(prospect.name || '').toLowerCase()}|${String(prospect.department || '').toLowerCase()}|${prospect.contact_email || prospect.profile_url}`;
    if (seen.has(key)) errors.push(`${prospect.name || prospect.id} appears duplicated in ME artifact`);
    seen.add(key);
  }
  return errors;
}

const artifact = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
const meProspects = Array.isArray(artifact.prospects) ? artifact.prospects : [];
const validationErrors = validateProspects(meProspects);
if (validationErrors.length) {
  console.error(validationErrors.map(error => `- ${error}`).join('\n'));
  process.exitCode = 1;
  process.exit();
}

const existing = readResearchProspects({ source: 'umich', preserveUserState: true });
const byKey = new Map();
for (const prospect of existing.prospects || []) {
  for (const key of identityKeys(prospect)) byKey.set(key, prospect);
}

let updated = 0;
let inserted = 0;
const merged = [...(existing.prospects || [])];

for (const incoming of meProspects) {
  const match = identityKeys(incoming)
    .map(key => byKey.get(key))
    .find(Boolean);

  if (match) {
    const index = merged.findIndex(item => item.id === match.id);
    const next = applyResearchFitScoring({
      ...match,
      ...incoming,
      id: match.id,
      first_seen: match.first_seen || incoming.first_seen,
      status: match.status || incoming.status || 'not_contacted',
      last_contacted: match.last_contacted || '',
      last_followed_up: match.last_followed_up || '',
      follow_up_date: match.follow_up_date || '',
      notes: match.notes || '',
      evidence: incoming.evidence || match.evidence || [],
      hiring_signals: incoming.hiring_signals || match.hiring_signals || [],
      last_updated: new Date().toISOString(),
    });
    merged[index] = next;
    for (const key of identityKeys(next)) byKey.set(key, next);
    updated += 1;
  } else {
    const next = applyResearchFitScoring({
      ...incoming,
      first_seen: incoming.first_seen || `${RESEARCH_DATE}T00:00:00.000Z`,
      last_updated: new Date().toISOString(),
    });
    merged.push(next);
    for (const key of identityKeys(next)) byKey.set(key, next);
    inserted += 1;
  }
}

merged.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.name).localeCompare(String(b.name)));

const store = writeResearchProspects({
  ...existing,
  scope: existing.scope || 'University of Michigan Ann Arbor research prospects',
  research_run: artifact.research_run || existing.research_run,
  research_date: RESEARCH_DATE,
  source_report: artifact.source_report || existing.source_report,
  me_faculty_import: {
    artifact: 'WEB-TRACKER/research/umich-me-faculty-prospects-2026.json',
    research_run: artifact.research_run,
    inserted,
    updated,
    me_total: meProspects.length,
  },
  prospects: merged,
}, { source: 'umich', preserveUserState: true });

const synced = syncResearchProspectsToDashboard({ institution: 'umich' });
const meCount = store.prospects.filter(p => p.department === 'Mechanical Engineering').length;

console.log(`ME artifact prospects: ${meProspects.length}`);
console.log(`Inserted: ${inserted}; updated: ${updated}`);
console.log(`U-M store total: ${store.prospects.length}`);
console.log(`Mechanical Engineering in store: ${meCount}`);
console.log(`Dashboard mirror total: ${synced.total}`);
console.log(`Missing emails in ME set: ${store.prospects.filter(p => p.department === 'Mechanical Engineering' && !p.contact_email).length}`);
