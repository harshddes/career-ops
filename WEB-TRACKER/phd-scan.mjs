#!/usr/bin/env node
/**
 * phd-scan.mjs — PhD/Research position scanner
 *
 * Scans PhD-specific boards and lab portals from source-registry.json
 * for rolling funded positions, postdocs, and research associate roles.
 * Separate pipeline from commercial job scanning because:
 *   - Different cadence (less frequent)
 *   - Different data model (funding type, opening model, deadlines)
 *   - Different ranking (advisor fit, program reputation matter more)
 *
 * Sources that lack APIs get periodic page-change detection via fingerprinting.
 *
 * Usage:
 *   node phd-scan.mjs              # scan due PhD/lab sources
 *   node phd-scan.mjs --all        # scan all PhD/lab sources
 *   node phd-scan.mjs --dry-run    # preview
 */

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { fetchWithValidators, fingerprint } from './lib/conditional-fetch.mjs';
import { enrichOpportunityWithWorkAuth } from './lib/work-auth.mjs';
import {
  loadRegistry, loadState, saveState,
  getDueSources, recordPollResult, computeNextPoll,
} from './lib/cadence-engine.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(BASE, 'data');
const PHD_FILE = join(DATA_DIR, 'phd-opportunities.json');
const EVENT_QUEUE = join(DATA_DIR, 'event-queue.ndjson');

mkdirSync(DATA_DIR, { recursive: true });

const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const SCAN_ALL = args.includes('--all');

// ── Load existing PhD data ──────────────────────────────────────────

function loadExisting() {
  if (!existsSync(PHD_FILE)) {
    return { opportunities: [], seen_fingerprints: {} };
  }
  return JSON.parse(readFileSync(PHD_FILE, 'utf-8'));
}

// ── Check a portal page for changes ─────────────────────────────────

async function checkPortalChange(source, state) {
  const url = source.careers_url;
  if (!url) return { changed: false, status: 0 };

  const cache = {
    etag: state.sources[source.id]?.etag,
    lastModified: state.sources[source.id]?.last_modified,
  };

  const result = await fetchWithValidators(url, cache);

  if (!result.changed && result.status === 304) {
    return { changed: false, status: 304, etag: result.etag, lastModified: result.lastModified };
  }

  if (result.error || !result.data) {
    return { changed: false, status: result.status, error: result.error };
  }

  const newFp = fingerprint(result.data);
  const oldFp = state.sources[source.id]?.content_fingerprint;

  const contentChanged = !oldFp || oldFp !== newFp;

  return {
    changed: contentChanged,
    status: result.status,
    etag: result.etag,
    lastModified: result.lastModified,
    content_fingerprint: newFp,
    content: typeof result.data === 'string' ? result.data : null,
  };
}

// ── Scan all PhD/lab/admissions sources ─────────────────────────────

async function scanPhdSources(sources, state) {
  const changedSources = [];

  for (const source of sources) {
    try {
      console.log(`  Checking [${source.source_type}] ${source.name}...`);
      const result = await checkPortalChange(source, state);

      const pollResult = {
        changed: result.changed,
        status: result.status,
        new_count: result.changed ? 1 : 0,
        etag: result.etag,
        lastModified: result.lastModified,
      };

      recordPollResult(state, source.id, pollResult);

      if (result.content_fingerprint) {
        if (!state.sources[source.id]) state.sources[source.id] = {};
        state.sources[source.id].content_fingerprint = result.content_fingerprint;
      }

      const policy = registry.cadence_policy[source.source_type] || registry.cadence_policy.phd_board;
      state.sources[source.id].next_poll = computeNextPoll(source, state.sources[source.id], policy);

      if (result.changed) {
        changedSources.push(enrichOpportunityWithWorkAuth({
          source_id: source.id,
          name: source.name,
          source_type: source.source_type,
          url: source.careers_url,
          opening_model: source.opening_model || 'unknown',
          deadline: source.deadline || null,
          importance: source.importance,
          h1b_status: source.h1b_status || 'n/a',
          detected_at: new Date().toISOString(),
          notes: source.notes || null,
          needs_deep_research: true,
        }, source));

        if (!DRY_RUN) {
          const event = {
            type: 'phd_portal_changed',
            source_id: source.id,
            name: source.name,
            timestamp: new Date().toISOString(),
          };
          appendFileSync(EVENT_QUEUE, JSON.stringify(event) + '\n');
        }

        console.log(`    → CHANGE DETECTED`);
      } else {
        console.log(`    → no change`);
      }
    } catch (err) {
      console.log(`    → ERROR: ${err.message}`);
    }
  }

  return changedSources;
}

// ── Main ────────────────────────────────────────────────────────────

const registry = loadRegistry();
const state = loadState();
const existing = loadExisting();

const phdSources = registry.sources.filter(s =>
  s.enabled && ['phd_board', 'lab_portal', 'admissions_page'].includes(s.source_type)
);

let toScan;
if (SCAN_ALL) {
  toScan = phdSources;
} else {
  const due = getDueSources(registry, state);
  toScan = due.filter(s => ['phd_board', 'lab_portal', 'admissions_page'].includes(s.source_type));
}

console.log(`\n[phd-scan] ${DRY_RUN ? '(DRY RUN) ' : ''}Checking ${toScan.length} PhD/lab/admissions sources...\n`);

const changedSources = await scanPhdSources(toScan, state);

if (!DRY_RUN) {
  const merged = [...existing.opportunities];
  for (const cs of changedSources) {
    const idx = merged.findIndex(o => o.source_id === cs.source_id);
    if (idx >= 0) {
      merged[idx] = { ...merged[idx], ...cs };
    } else {
      merged.push(cs);
    }
  }

  const output = {
    generated_at: new Date().toISOString(),
    total: merged.length,
    changed_this_run: changedSources.length,
    opportunities: merged,
    seen_fingerprints: existing.seen_fingerprints || {},
  };

  writeFileSync(PHD_FILE, JSON.stringify(output, null, 2));
  saveState(state);
}

console.log(`\n[phd-scan] ${changedSources.length} sources with changes out of ${toScan.length} checked\n`);
