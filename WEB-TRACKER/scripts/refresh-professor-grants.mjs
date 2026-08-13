#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, isAbsolute, join } from 'path';
import {
  CAREER_OPS_DIR,
  readResearchProspects,
  syncResearchProspectsToDashboard,
  writeResearchProspects,
} from '../lib/research-prospect-store.mjs';
import { collectProfessorGrants } from '../lib/professor-grants/adapters.mjs';
import { buildGrantResearchPlan, normalizeProfessorCountry } from '../lib/professor-grants/router.mjs';
import { normalizeActiveGrants } from '../lib/professor-grants/schema.mjs';

const SOURCE = 'professor-list';
const RUNTIME_DIR = join(CAREER_OPS_DIR, 'WEB-TRACKER', 'runtime', 'professor-grants');

function argumentValue(name, fallback = '') {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || fallback : fallback;
}

function hasArgument(name) {
  return process.argv.includes(name);
}

function splitArgument(name) {
  return argumentValue(name).split(',').map(value => value.trim()).filter(Boolean);
}

function isCsvGrantFound(prospect = {}) {
  return /^yes\b/i.test(String(prospect.source_details?.enriched_research?.grant_found || ''))
    || (prospect.active_grants || []).length > 0;
}

function matchesBatch(prospect = {}, batch = 'all') {
  const category = String(prospect.outreach_category || '');
  const country = normalizeProfessorCountry(prospect);
  if (batch === 'replied') return ['positive_reply', 'replied'].includes(category);
  if (batch === 'grant-found') return isCsvGrantFound(prospect);
  if (batch === 'routed') return ['CH', 'US', 'NL', 'DE', 'FR', 'UK'].includes(country);
  if (batch === 'hard') return country === 'IT' || !country;
  return true;
}

function selectedProspects(prospects = []) {
  const batch = argumentValue('--batch', 'all');
  const ids = new Set(splitArgument('--ids'));
  const countries = new Set(splitArgument('--countries').map(value => value.toUpperCase()));
  const unchecked = hasArgument('--unchecked');
  const limit = Math.max(0, Number(argumentValue('--limit', '0')) || 0);
  const selected = prospects.filter(prospect => {
    if (!matchesBatch(prospect, batch)) return false;
    if (ids.size && !ids.has(prospect.id)) return false;
    if (countries.size && !countries.has(normalizeProfessorCountry(prospect))) return false;
    if (unchecked && prospect.grants_checked_at) return false;
    return true;
  });
  return limit ? selected.slice(0, limit) : selected;
}

function findingsFromFile(filePath = '') {
  if (!filePath) return new Map();
  const payload = JSON.parse(readFileSync(filePath, 'utf-8'));
  const rows = Array.isArray(payload) ? payload : (payload.results || payload.findings || []);
  return new Map(rows.map(row => [row.prospect_id || row.id, row]));
}

function mergeGrants(current = [], incoming = []) {
  return normalizeActiveGrants([...(current || []), ...(incoming || [])]);
}

function writeRunArtifact(run) {
  mkdirSync(RUNTIME_DIR, { recursive: true });
  const stamp = run.started_at.replace(/[:.]/g, '-');
  const output = argumentValue('--output');
  const path = output
    ? (isAbsolute(output) ? output : join(CAREER_OPS_DIR, output))
    : join(RUNTIME_DIR, `${stamp}-${run.batch}.json`);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(run, null, 2)}\n`, 'utf-8');
  return path;
}

const store = readResearchProspects({ source: SOURCE });
const selected = selectedProspects(store.prospects);
const batch = argumentValue('--batch', 'all');
const live = hasArgument('--live');
const findingsFile = argumentValue('--results');
const findings = findingsFromFile(findingsFile);
const apply = live || Boolean(findingsFile);
const startedAt = new Date().toISOString();
const run = {
  version: 1,
  started_at: startedAt,
  source: SOURCE,
  batch,
  mode: live ? 'live' : findingsFile ? 'results' : 'dry-run',
  selected_count: selected.length,
  selected: selected.map(buildGrantResearchPlan),
  results: [],
};

for (const prospect of selected) {
  let result;
  if (findings.has(prospect.id)) {
    const supplied = findings.get(prospect.id);
    result = {
      prospect_id: prospect.id,
      checked_at: supplied.checked_at || new Date().toISOString(),
      grants: normalizeActiveGrants(supplied.grants),
      attempts: supplied.attempts || [{ portal: 'external_research', status: 'ok' }],
    };
  } else if (live) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      result = await collectProfessorGrants(prospect, { signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  } else {
    continue;
  }

  // A check is "complete" when every portal we can actually parse succeeded.
  // Portals that intentionally need firecrawl/parallel stay as deferred notes
  // but still stamp grants_checked_at so the card is not stuck forever.
  const actionableAttempts = (result.attempts || [])
    .filter(attempt => attempt.status !== 'external_research_required');
  const complete = actionableAttempts.length
    ? actionableAttempts.every(attempt => attempt.status === 'ok')
    : Boolean(findings.has(prospect.id));
  const deferred = (result.attempts || [])
    .some(attempt => attempt.status === 'external_research_required');
  const index = store.prospects.findIndex(item => item.id === prospect.id);
  if (index >= 0) {
    store.prospects[index] = {
      ...store.prospects[index],
      active_grants: mergeGrants(store.prospects[index].active_grants, result.grants),
      grants_checked_at: result.checked_at || new Date().toISOString(),
      grant_research_status: complete
        ? (deferred ? 'complete_with_deferred_portals' : 'complete')
        : 'partial',
      grant_research_attempts: result.attempts,
      last_updated: new Date().toISOString(),
    };
  }
  run.results.push({
    prospect_id: prospect.id,
    grants_found: result.grants?.length || 0,
    complete,
    attempts: result.attempts,
  });
}

if (apply) {
  writeResearchProspects(store, { source: SOURCE, preserveUserState: true });
  syncResearchProspectsToDashboard({ source: SOURCE });
}

run.completed_at = new Date().toISOString();
run.applied = apply;
run.completed_count = run.results.filter(result => result.complete).length;
run.external_research_required = run.results.filter(result => !result.complete).length;
const artifact = writeRunArtifact(run);

console.log(JSON.stringify({
  mode: run.mode,
  batch,
  selected: selected.length,
  processed: run.results.length,
  completed: run.completed_count,
  external_research_required: run.external_research_required,
  artifact,
}, null, 2));
