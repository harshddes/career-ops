/**
 * Canonical fat catalogs: live WAL for default paths, compact JSON for temp/test files.
 */
import { resolve } from 'path';
import { atomicWrite, compactJsonLine } from './atomic-write.mjs';
import {
  peekLiveStamp,
  readLiveOrImport,
  upsertLiveRow,
  writeLiveCollection,
} from './db.mjs';
import { rememberMtimeStore, readMtimeCachedStore } from './mtime-store-cache.mjs';

const normalizedCache = new Map();

export function isCanonicalFile(filePath, canonicalPath) {
  if (!filePath) return true;
  try {
    return resolve(filePath) === resolve(canonicalPath);
  } catch {
    return filePath === canonicalPath;
  }
}

export function readLiveOrJson({
  table,
  canonicalPath,
  filePath,
  empty,
  parse,
  extraCanonicalPaths = [],
}) {
  const live = isCanonicalFile(filePath, canonicalPath)
    || extraCanonicalPaths.some(path => isCanonicalFile(filePath, path));
  if (live) {
    const stamp = peekLiveStamp(table);
    const hit = normalizedCache.get(table);
    if (hit && hit.stamp === stamp && stamp !== '0:0') return hit.store;
    const parsed = readLiveOrImport(table, canonicalPath) || empty();
    const store = parse(parsed);
    normalizedCache.set(table, { stamp: peekLiveStamp(table), store });
    return store;
  }
  return readMtimeCachedStore(filePath, { empty, parse });
}

export function writeLiveOrJson({
  table,
  canonicalPath,
  filePath,
  next,
  extraCanonicalPaths = [],
}) {
  const live = isCanonicalFile(filePath, canonicalPath)
    || extraCanonicalPaths.some(path => isCanonicalFile(filePath, path));
  if (live) {
    const written = writeLiveCollection(table, next);
    normalizedCache.set(table, { stamp: peekLiveStamp(table), store: written });
    return written;
  }
  atomicWrite(filePath, compactJsonLine(next));
  rememberMtimeStore(filePath, next);
  return next;
}

export function upsertLiveOrWrite({
  table,
  canonicalPath,
  filePath,
  store,
  row,
  metaPatch = {},
  extraCanonicalPaths = [],
}) {
  const live = isCanonicalFile(filePath, canonicalPath)
    || extraCanonicalPaths.some(path => isCanonicalFile(filePath, path));
  if (!live) return null;
  upsertLiveRow(table, row, metaPatch);
  const stamp = peekLiveStamp(table);
  const cached = normalizedCache.get(table);
  if (cached?.store) {
    const itemKey = Array.isArray(cached.store.opportunities)
      ? 'opportunities'
      : Array.isArray(cached.store.jobs)
        ? 'jobs'
        : Array.isArray(cached.store.prospects)
          ? 'prospects'
          : '';
    if (itemKey) {
      const items = cached.store[itemKey];
      const idx = items.findIndex(item => item?.id === row.id);
      if (idx >= 0) items[idx] = row;
      else items.push(row);
    }
    cached.stamp = stamp;
    return cached.store;
  }
  if (store && Array.isArray(store.opportunities || store.jobs || store.prospects)) {
    const itemKey = Array.isArray(store.opportunities)
      ? 'opportunities'
      : Array.isArray(store.jobs)
        ? 'jobs'
        : 'prospects';
    if ((store[itemKey] || []).length > 1) {
      normalizedCache.set(table, { stamp, store });
      return store;
    }
  }
  normalizedCache.delete(table);
  return store || null;
}

export function dashboardSnapshot(store, extra = {}) {
  const items = store.opportunities || store.jobs || store.prospects || store.companies || [];
  return {
    ...store,
    generated_at: new Date().toISOString(),
    total: items.length,
    count: items.length,
    ...extra,
  };
}

export function writeDashboardSnapshot(outputPath, store, extra = {}) {
  const output = dashboardSnapshot(store, extra);
  atomicWrite(outputPath, compactJsonLine(output));
  return output;
}

export function resetLiveNormalizedCache() {
  normalizedCache.clear();
}
