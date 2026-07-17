#!/usr/bin/env node
/**
 * Merge ME Manufacturing outreach enrichment into the U-M store.
 * Matches existing ME cards by profile_url / slug; inserts missing roster people.
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
const ARTIFACT = join(__dirname, '..', 'research', 'umich-me-manufacturing-outreach-prospects-2026.json');
const RESEARCH_DATE = '2026-07-09';
const DEPARTMENT = 'Mechanical Engineering';

function slugFromUrl(url = '') {
  const m = String(url).match(/\/faculty\/([a-z0-9-]+)\/?/i);
  return m ? m[1].toLowerCase() : '';
}

function identityKeys(prospect) {
  return [
    prospect.id,
    prospect.profile_url ? `url:${String(prospect.profile_url).toLowerCase().replace(/\/$/, '')}` : '',
    slugFromUrl(prospect.profile_url) ? `slug:${slugFromUrl(prospect.profile_url)}` : '',
  ].filter(Boolean);
}

const artifact = JSON.parse(readFileSync(ARTIFACT, 'utf8'));
const incomingList = Array.isArray(artifact.prospects) ? artifact.prospects : [];
if (!incomingList.length) {
  console.error('No manufacturing prospects in artifact');
  process.exit(1);
}

const existing = readResearchProspects({ source: 'umich', preserveUserState: true });
const byKey = new Map();
for (const prospect of existing.prospects || []) {
  for (const key of identityKeys(prospect)) byKey.set(key, prospect);
}

let updated = 0;
let inserted = 0;
const merged = [...(existing.prospects || [])];

for (const incoming of incomingList) {
  const slug = slugFromUrl(incoming.profile_url);
  const match = [
    `url:${String(incoming.profile_url || '').toLowerCase().replace(/\/$/, '')}`,
    slug ? `slug:${slug}` : '',
    incoming.id,
  ].map(key => byKey.get(key)).find(Boolean);

  if (match && match.department === DEPARTMENT) {
    const index = merged.findIndex(item => item.id === match.id);
    const researchFields = [...new Set([
      ...(match.research_fields || []),
      ...(incoming.research_fields || []),
      'Manufacturing',
    ])];
    const transferVectors = [...new Set([
      ...(incoming.transfer_vectors || []),
      ...(match.transfer_vectors || []),
    ])].slice(0, 6);

    const next = applyResearchFitScoring({
      ...match,
      title: incoming.title || match.title,
      lab: (incoming.lab && !/mechanical engineering research/i.test(incoming.lab))
        ? incoming.lab
        : (match.lab || incoming.lab),
      lab_url: incoming.lab_url || match.lab_url || '',
      contact_email: match.contact_email || incoming.contact_email || '',
      research_keywords: (incoming.research_keywords?.length ? incoming.research_keywords : match.research_keywords) || [],
      methods: [...new Set([...(incoming.methods || []), ...(match.methods || [])])].slice(0, 8),
      facilities: [...new Set([...(incoming.facilities || []), ...(match.facilities || [])])].slice(0, 6),
      transfer_vectors: transferVectors,
      research_fields: researchFields,
      outreach_tier: '',
      area_assessments: {
        ...(match.area_assessments || {}),
        ...(incoming.area_assessments || {}),
      },
      manufacturing_fit_primary: incoming.manufacturing_fit_primary,
      manufacturing_fit_secondary: incoming.manufacturing_fit_secondary,
      current_focus: incoming.current_focus || match.current_focus || '',
      laser_or_optical_flag: incoming.laser_or_optical_flag,
      lpbf_am_flag: incoming.lpbf_am_flag,
      process_sensing_flag: incoming.process_sensing_flag,
      sheet_metal_or_forming_flag: incoming.sheet_metal_or_forming_flag,
      role_note: incoming.role_note || match.role_note,
      likely_route: incoming.likely_route || match.likely_route,
      research_interests_summary: (incoming.research_interests_summary || '').length >= (match.research_interests_summary || '').length
        ? incoming.research_interests_summary
        : (match.research_interests_summary || incoming.research_interests_summary || ''),
      recent_publication: incoming.recent_publication || match.recent_publication || '',
      hiring_signals: [...(match.hiring_signals || []), ...(incoming.hiring_signals || [])]
        .filter((item, idx, arr) => item?.url && arr.findIndex(x => x.url === item.url) === idx)
        .slice(0, 6),
      evidence: [...(match.evidence || []), ...(incoming.evidence || [])]
        .filter((item, idx, arr) => item?.url && arr.findIndex(x => x.url === item.url) === idx)
        .slice(0, 8),
      uncertainty_notes: match.uncertainty_notes || incoming.uncertainty_notes || '',
      source_report: incoming.source_report || match.source_report,
      id: match.id,
      first_seen: match.first_seen || incoming.first_seen,
      status: match.status || 'not_contacted',
      last_contacted: match.last_contacted || '',
      last_followed_up: match.last_followed_up || '',
      follow_up_date: match.follow_up_date || '',
      notes: match.notes || '',
      last_updated: new Date().toISOString(),
    });
    merged[index] = next;
    for (const key of identityKeys(next)) byKey.set(key, next);
    updated += 1;
  } else if (!match) {
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
  research_date: RESEARCH_DATE,
  me_manufacturing_import: {
    artifact: 'WEB-TRACKER/research/umich-me-manufacturing-outreach-prospects-2026.json',
    research_run: artifact.research_run,
    inserted,
    updated,
    total_artifact: incomingList.length,
  },
  prospects: merged,
}, { source: 'umich', preserveUserState: true });

syncResearchProspectsToDashboard({ institution: 'umich' });

const mfg = store.prospects.filter(p => (p.research_fields || []).includes('Manufacturing'));
const byTier = mfg.reduce((acc, p) => {
  const key = p.area_assessments?.Manufacturing?.roster_tier || 'unset';
  acc[key] = (acc[key] || 0) + 1;
  return acc;
}, {});

console.log(`Manufacturing artifact: ${incomingList.length}`);
console.log(`Updated existing ME cards: ${updated}`);
console.log(`Inserted new cards: ${inserted}`);
console.log(`Store total: ${store.prospects.length}; Manufacturing tagged: ${mfg.length}`);
console.log(`Outreach segregation: ${JSON.stringify(byTier)}`);
