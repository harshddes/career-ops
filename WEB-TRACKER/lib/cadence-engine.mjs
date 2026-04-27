#!/usr/bin/env node
/**
 * cadence-engine.mjs — Adaptive polling scheduler
 *
 * Computes next poll time per source based on observed hit rate,
 * source importance, and the cadence policy for each source type.
 * Supports burst mode after fresh hits and exponential backoff
 * on repeated no-change responses.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const BASE = dirname(fileURLToPath(import.meta.url));
const TRACKER_ROOT = join(BASE, '..');
const REGISTRY_PATH = join(TRACKER_ROOT, 'config', 'source-registry.json');
const STATE_PATH = join(TRACKER_ROOT, 'data', 'source-state.json');

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function loadRegistry() {
  return JSON.parse(readFileSync(REGISTRY_PATH, 'utf-8'));
}

export function loadState() {
  if (!existsSync(STATE_PATH)) return { version: '1.0.0', last_global_run: null, sources: {} };
  return JSON.parse(readFileSync(STATE_PATH, 'utf-8'));
}

export function saveState(state) {
  state.last_global_run = new Date().toISOString();
  writeFileSync(STATE_PATH, JSON.stringify(state, null, 2));
}

export function updateSourceHeat(prevHeat, changed) {
  return clamp(0.75 * (prevHeat ?? 0.2) + 0.25 * (changed ? 1.0 : 0.0), 0, 1);
}

/**
 * Compute next poll ISO timestamp for a source.
 */
export function computeNextPoll(source, sourceState, policy, now = Date.now()) {
  const heat = updateSourceHeat(sourceState?.heat, sourceState?.changed_last_run);
  const importance = clamp(source.importance ?? 0.5, 0, 1);

  const urgency = clamp(0.6 * heat + 0.4 * importance, 0, 1);

  const minMs = (policy.min_interval_min ?? 60) * 60_000;
  const maxMs = (policy.max_interval_min ?? 1440) * 60_000;

  let intervalMs = maxMs - urgency * (maxMs - minMs);

  if (sourceState?.last_status === 429 || sourceState?.last_status === 503) {
    intervalMs *= 1.5;
  }

  if (sourceState?.consecutive_no_change >= 3) {
    intervalMs *= 1.0 + 0.25 * Math.min(sourceState.consecutive_no_change, 8);
  }

  intervalMs = clamp(intervalMs, minMs, maxMs);

  return new Date(now + Math.round(intervalMs)).toISOString();
}

/**
 * Return sources that are due for polling right now.
 */
export function getDueSources(registry, state, now = Date.now()) {
  const due = [];
  const nowIso = new Date(now).toISOString();

  for (const source of registry.sources) {
    if (!source.enabled) continue;

    const ss = state.sources[source.id];
    if (!ss || !ss.next_poll || ss.next_poll <= nowIso) {
      due.push(source);
    }
  }

  due.sort((a, b) => (b.importance ?? 0) - (a.importance ?? 0));
  return due;
}

/**
 * Record the result of a poll for a source.
 */
export function recordPollResult(state, sourceId, result) {
  if (!state.sources[sourceId]) {
    state.sources[sourceId] = {};
  }
  const ss = state.sources[sourceId];

  ss.last_poll = new Date().toISOString();
  ss.last_status = result.status ?? 200;
  ss.changed_last_run = result.changed ?? false;
  ss.heat = updateSourceHeat(ss.heat, result.changed);
  ss.etag = result.etag ?? ss.etag ?? null;
  ss.last_modified = result.lastModified ?? ss.last_modified ?? null;

  if (result.changed) {
    ss.last_changed_at = new Date().toISOString();
    ss.consecutive_no_change = 0;
    ss.total_hits = (ss.total_hits ?? 0) + (result.new_count ?? 0);
  } else {
    ss.consecutive_no_change = (ss.consecutive_no_change ?? 0) + 1;
  }

  ss.total_polls = (ss.total_polls ?? 0) + 1;
  ss.hit_rate = ss.total_hits ? ss.total_hits / ss.total_polls : 0;

  return ss;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('cadence-engine.mjs')) {
  const registry = loadRegistry();
  const state = loadState();
  const due = getDueSources(registry, state);
  console.log(`Sources due for polling: ${due.length}`);
  for (const s of due) {
    console.log(`  [${s.source_type}] ${s.name} (importance: ${s.importance})`);
  }
}
