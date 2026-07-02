#!/usr/bin/env node
import { existsSync, readFileSync } from 'fs';
import {
  normalizeResearchProspect,
  readResearchProspects,
  researchProspectConfig,
  syncResearchProspectsToDashboard,
  writeResearchProspects,
} from '../lib/research-prospect-store.mjs';

const SOURCES = ['umich', 'kth', 'ipp'];
const REFRESHED_RESEARCHED_ROWS = new Set(['research_interests', 'recent_publication']);

function readRawProspects(source) {
  const { canonicalFile } = researchProspectConfig(source);
  if (!existsSync(canonicalFile)) return [];
  const parsed = JSON.parse(readFileSync(canonicalFile, 'utf-8'));
  return Array.isArray(parsed.prospects) ? parsed.prospects : [];
}

function mergeDefenseSheet(rawProspect = {}) {
  const oldSheet = new Map((rawProspect.defense_sheet || []).map(row => [row.id, row]));
  const normalized = normalizeResearchProspect({ ...rawProspect, defense_sheet: [] });
  const defense_sheet = normalized.defense_sheet.map(row => {
    const old = oldSheet.get(row.id);
    if (!old) return row;
    return {
      ...row,
      researched_answer: REFRESHED_RESEARCHED_ROWS.has(row.id)
        ? row.researched_answer
        : old.researched_answer || row.researched_answer,
      user_response: old.user_response || '',
    };
  });
  return { ...normalized, defense_sheet };
}

for (const source of SOURCES) {
  const rawProspects = readRawProspects(source);
  if (!rawProspects.length) {
    console.log(`${source}: no prospects found, skipped`);
    continue;
  }
  const store = readResearchProspects({ source });
  store.prospects = rawProspects.map(mergeDefenseSheet);
  writeResearchProspects(store, { source, preserveUserState: true });
  syncResearchProspectsToDashboard({ source });
  console.log(`${source}: backfilled defense sheets for ${store.prospects.length} prospects`);
}
