#!/usr/bin/env node
/**
 * Deduplicate and canonically rescore every U-M research prospect.
 * User workflow state is preserved; generated scoring/defense content is rebuilt.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyResearchFitScoring, RESEARCH_FIT_POLICY_VERSION } from '../lib/research-fit-scoring.mjs';
import {
  readResearchProspects,
  syncResearchProspectsToDashboard,
  writeResearchProspects,
} from '../lib/research-prospect-store.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESEARCH_DIR = join(__dirname, '..', 'research');
const AUDIT_PATH = join(RESEARCH_DIR, 'umich-research-fit-audit-2026.json');
const INITIAL_SOURCE_RECORDS = 197;
const INITIAL_DUPLICATES_MERGED = 8;

const NAME_ALIASES = new Map([
  ['steve ceccio', 'steven l ceccio'],
  ['steven ceccio', 'steven l ceccio'],
]);

const LEGACY_SCORE_BASELINES = new Map([
  ['jing tang', {
    score: 4,
    tier: 'A',
    reason: 'Legacy manual manufacturing/T1 score; removed because autonomous-lab AI dominates the verified daily work.',
  }],
]);

function clean(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function personKey(prospect) {
  const normalized = clean(prospect.name).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  return NAME_ALIASES.get(normalized) || normalized || clean(prospect.id).toLowerCase();
}

function unique(values = []) {
  return [...new Set(values.map(clean).filter(Boolean))];
}

function uniqueEvidence(items = []) {
  const seen = new Set();
  return items.filter(item => {
    const key = clean(item?.url) || `${clean(item?.label)}|${clean(item?.note)}`;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function longer(a, b) {
  return clean(b).length > clean(a).length ? b : a;
}

function meaningfulStatus(items) {
  const order = ['archived', 'responded', 'follow_up', 'contacted', 'draft_ready', 'not_contacted'];
  return order.find(status => items.some(item => item.status === status)) || 'not_contacted';
}

function mergeDefenseSheets(items) {
  const rows = new Map();
  for (const item of items) {
    for (const row of item.defense_sheet || []) {
      const id = clean(row.id || row.question);
      if (!id) continue;
      const existing = rows.get(id) || {};
      rows.set(id, {
        ...row,
        user_response: clean(existing.user_response) || clean(row.user_response),
      });
    }
  }
  return [...rows.values()];
}

function mergeGroup(items) {
  const primary = [...items].sort((a, b) => {
    const aEvidence = (a.evidence || []).length + (a.lab_url ? 2 : 0) + (a.current_focus ? 2 : 0);
    const bEvidence = (b.evidence || []).length + (b.lab_url ? 2 : 0) + (b.current_focus ? 2 : 0);
    return bEvidence - aEvidence;
  })[0];

  const departments = unique(items.flatMap(item => item.departments?.length ? item.departments : [item.department]));
  const areaAssessments = Object.assign({}, ...items.map(item => item.area_assessments || {}));
  const researchFields = unique(items.flatMap(item => item.research_fields || []));
  const methods = unique(items.flatMap(item => item.methods || [])).slice(0, 12);
  const facilities = unique(items.flatMap(item => item.facilities || [])).slice(0, 10);
  const keywords = unique(items.flatMap(item => item.research_keywords || [])).slice(0, 14);
  const evidence = uniqueEvidence(items.flatMap(item => item.evidence || [])).slice(0, 16);
  const hiringSignals = uniqueEvidence(items.flatMap(item => item.hiring_signals || [])).slice(0, 8);

  let currentFocus = '';
  let interests = '';
  let recentPublication = '';
  let lab = '';
  let labUrl = '';
  let notes = '';
  for (const item of items) {
    currentFocus = longer(currentFocus, item.current_focus);
    interests = longer(interests, item.research_interests_summary);
    recentPublication = longer(recentPublication, item.recent_publication);
    lab = longer(lab, item.lab);
    labUrl = labUrl || item.lab_url || '';
    notes = longer(notes, item.notes);
  }

  return {
    ...primary,
    id: primary.id,
    department: primary.department || departments[0] || '',
    departments,
    research_fields: researchFields,
    area_assessments: areaAssessments,
    outreach_tier: '',
    research_keywords: keywords,
    methods,
    facilities,
    evidence,
    hiring_signals: hiringSignals,
    current_focus: currentFocus,
    research_interests_summary: interests,
    recent_publication: recentPublication,
    lab,
    lab_url: labUrl,
    contact_email: items.find(item => item.contact_email)?.contact_email || '',
    status: meaningfulStatus(items),
    last_contacted: items.find(item => item.last_contacted)?.last_contacted || '',
    last_followed_up: items.find(item => item.last_followed_up)?.last_followed_up || '',
    follow_up_date: items.find(item => item.follow_up_date)?.follow_up_date || '',
    notes,
    defense_sheet: mergeDefenseSheets(items),
    first_seen: [...items].map(item => item.first_seen).filter(Boolean).sort()[0] || primary.first_seen,
    last_updated: new Date().toISOString(),
  };
}

const store = readResearchProspects({ source: 'umich', preserveUserState: true });
const groups = new Map();
for (const prospect of store.prospects || []) {
  const key = personKey(prospect);
  if (!groups.has(key)) groups.set(key, []);
  groups.get(key).push(prospect);
}

const auditRows = [];
const rescored = [];
for (const items of groups.values()) {
  const merged = mergeGroup(items);
  let scored = applyResearchFitScoring(merged);
  const oldRecords = items.map(item => ({
    id: item.id,
    department: item.department,
    score: item.score,
    tier: item.tier,
    priority: item.priority,
    outreach_tier: item.outreach_tier || '',
  }));
  const retainedBaseline = items.map(item => item.score_audit).find(item => item?.initial_tier);
  const legacyBaseline = retainedBaseline || LEGACY_SCORE_BASELINES.get(personKey(scored)) || {
    score: oldRecords[0]?.score,
    tier: oldRecords[0]?.tier,
    reason: 'Immediately preceding stored score before canonical rescoring.',
  };
  scored = {
    ...scored,
    score_audit: {
      policy_version: RESEARCH_FIT_POLICY_VERSION,
      report: 'WEB-TRACKER/research/umich-research-fit-audit-2026.json',
      initial_score: legacyBaseline.initial_score ?? legacyBaseline.score,
      initial_tier: legacyBaseline.initial_tier ?? legacyBaseline.tier,
      current_score: scored.score,
      current_tier: scored.tier,
      changed: (legacyBaseline.initial_tier ?? legacyBaseline.tier) !== scored.tier
        || Number(legacyBaseline.initial_score ?? legacyBaseline.score) !== Number(scored.score),
      reason: legacyBaseline.reason || '',
    },
  };
  auditRows.push({
    id: scored.id,
    name: scored.name,
    merged_records: oldRecords,
    old_record_count: items.length,
    new_score: scored.score,
    new_tier: scored.tier,
    daily_work_type: scored.daily_work_type,
    score_breakdown: scored.score_breakdown,
    tier_cap: scored.tier_cap,
    cap_reasons: scored.cap_reasons,
    verified_overlap: scored.verified_overlap,
    missing_evidence: scored.missing_evidence,
    evidence_used: (scored.evidence || []).map(item => ({ label: item.label, url: item.url })).filter(item => item.url),
    explanation: scored.fit_rationale,
  });
  rescored.push(scored);
}

rescored.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.name).localeCompare(String(b.name)));
auditRows.sort((a, b) => Number(b.new_score || 0) - Number(a.new_score || 0) || String(a.name).localeCompare(String(b.name)));

const tierCounts = rescored.reduce((acc, prospect) => {
  acc[prospect.tier] = (acc[prospect.tier] || 0) + 1;
  return acc;
}, {});

const audit = {
  generated_at: new Date().toISOString(),
  policy_version: RESEARCH_FIT_POLICY_VERSION,
  comparison_baseline: 'immediately preceding stored score/tier; initial legacy record count retained separately',
  initial_source_records: Number(store.research_fit_initial_source_records || INITIAL_SOURCE_RECORDS),
  duplicates_merged_total: Number(store.research_fit_duplicates_merged || INITIAL_DUPLICATES_MERGED),
  source_records: (store.prospects || []).length,
  canonical_people: rescored.length,
  duplicates_merged: (store.prospects || []).length - rescored.length,
  tier_counts: tierCounts,
  tier_ab_review: auditRows.filter(row => ['A', 'B'].includes(row.new_tier)).map(row => ({
    name: row.name,
    tier: row.new_tier,
    score: row.new_score,
    daily_work_type: row.daily_work_type,
    verified_overlap: row.verified_overlap,
    explanation: row.explanation,
  })),
  prospects: auditRows,
};

mkdirSync(RESEARCH_DIR, { recursive: true });
writeFileSync(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`, 'utf8');

const written = writeResearchProspects({
  ...store,
  research_fit_policy_version: RESEARCH_FIT_POLICY_VERSION,
  research_fit_initial_source_records: Number(store.research_fit_initial_source_records || INITIAL_SOURCE_RECORDS),
  research_fit_duplicates_merged: Number(store.research_fit_duplicates_merged || INITIAL_DUPLICATES_MERGED),
  research_fit_audit: 'WEB-TRACKER/research/umich-research-fit-audit-2026.json',
  prospects: rescored,
}, { source: 'umich', preserveUserState: true });

syncResearchProspectsToDashboard({ institution: 'umich' });

console.log(`Rescored ${store.prospects.length} records into ${written.prospects.length} canonical people.`);
console.log(`Duplicates merged: ${store.prospects.length - written.prospects.length}`);
console.log(`Tier counts: ${JSON.stringify(tierCounts)}`);
console.log(`Audit: ${AUDIT_PATH}`);
