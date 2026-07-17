#!/usr/bin/env node
/**
 * Merge U-M NAME faculty prospects into the existing umich research prospect store
 * without wiping other departments or overwriting non-NAME records via email collision.
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
const ARTIFACT = join(__dirname, '..', 'research', 'umich-name-faculty-prospects-2026.json');
const RESEARCH_DATE = '2026-07-09';
const DEPARTMENT = 'Naval Architecture and Marine Engineering';

function identityKeys(prospect, { allowEmail = true } = {}) {
  const keys = [prospect.id];
  if (prospect.profile_url) keys.push(`url:${String(prospect.profile_url).toLowerCase()}`);
  if (allowEmail && prospect.contact_email) {
    keys.push(`email:${String(prospect.contact_email).toLowerCase()}`);
  }
  return keys.filter(Boolean);
}

function validateProspects(items) {
  const seen = new Set();
  const errors = [];
  for (const prospect of items) {
    if (!prospect.name) errors.push(`${prospect.id || 'unknown'} missing name`);
    if (prospect.department !== DEPARTMENT) {
      errors.push(`${prospect.name || prospect.id} department must be ${DEPARTMENT}`);
    }
    if (!Number.isFinite(Number(prospect.score))) errors.push(`${prospect.name || prospect.id} missing score`);
    if (!(prospect.research_interests_summary || '').trim()) {
      errors.push(`${prospect.name || prospect.id} missing research_interests_summary`);
    }
    if (!prospect.profile_url && !prospect.lab_url && !prospect.evidence?.some(item => item.url)) {
      errors.push(`${prospect.name || prospect.id} missing source URL`);
    }
    if (seen.has(prospect.id)) errors.push(`${prospect.id} duplicated in NAME artifact`);
    seen.add(prospect.id);
  }
  return errors;
}

const artifact = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
const nameProspects = Array.isArray(artifact.prospects) ? artifact.prospects : [];
const validationErrors = validateProspects(nameProspects);
if (validationErrors.length) {
  console.error(validationErrors.map(error => `- ${error}`).join('\n'));
  process.exitCode = 1;
  process.exit();
}

const existing = readResearchProspects({ source: 'umich', preserveUserState: true });
const byKey = new Map();
for (const prospect of existing.prospects || []) {
  const allowEmail = prospect.department === DEPARTMENT;
  for (const key of identityKeys(prospect, { allowEmail })) byKey.set(key, prospect);
}

let updated = 0;
let inserted = 0;
const merged = [...(existing.prospects || [])];
const meCountBefore = merged.filter(p => p.department === 'Mechanical Engineering').length;

for (const incoming of nameProspects) {
  // Match only by NAME id or NAME profile_url. Never by email across departments.
  const match = identityKeys(incoming, { allowEmail: false })
    .map(key => byKey.get(key))
    .find(Boolean);

  if (match && match.department === DEPARTMENT) {
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
    for (const key of identityKeys(next, { allowEmail: true })) byKey.set(key, next);
    updated += 1;
  } else {
    const next = applyResearchFitScoring({
      ...incoming,
      first_seen: incoming.first_seen || `${RESEARCH_DATE}T00:00:00.000Z`,
      last_updated: new Date().toISOString(),
    });
    merged.push(next);
    for (const key of identityKeys(next, { allowEmail: true })) byKey.set(key, next);
    inserted += 1;
  }
}

merged.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.name).localeCompare(String(b.name)));

const store = writeResearchProspects({
  ...existing,
  scope: existing.scope || 'University of Michigan Ann Arbor research prospects',
  research_date: RESEARCH_DATE,
  source_report: artifact.source_report || existing.source_report,
  name_faculty_import: {
    artifact: 'WEB-TRACKER/research/umich-name-faculty-prospects-2026.json',
    research_run: artifact.research_run || '',
    inserted,
    updated,
    name_total: nameProspects.length,
  },
  prospects: merged,
}, { source: 'umich', preserveUserState: true });

const synced = syncResearchProspectsToDashboard({ institution: 'umich' });
const nameCount = store.prospects.filter(p => p.department === DEPARTMENT).length;
const meCountAfter = store.prospects.filter(p => p.department === 'Mechanical Engineering').length;

console.log(`NAME artifact prospects: ${nameProspects.length}`);
console.log(`Inserted: ${inserted}; updated: ${updated}`);
console.log(`U-M store total: ${store.prospects.length}`);
console.log(`NAME in store: ${nameCount}`);
console.log(`ME before/after: ${meCountBefore}/${meCountAfter}`);
console.log(`Dashboard mirror total: ${synced.total}`);
console.log(`Missing emails in NAME set: ${store.prospects.filter(p => p.department === DEPARTMENT && !p.contact_email).length}`);
