/**
 * Mtime memory-cache for fat JSON stores.
 * A cache hit returns the already-normalized object — no readFile / JSON.parse / normalize*.
 */

import { existsSync, readFileSync, statSync } from 'fs';

const cache = new Map();

function fileMtimeMs(filePath) {
  try {
    return existsSync(filePath) ? statSync(filePath).mtimeMs : 0;
  } catch {
    return 0;
  }
}

export function getMtimeStoreCacheEntry(filePath) {
  return cache.get(String(filePath || '')) || null;
}

export function invalidateMtimeStoreCache(filePath = '') {
  if (!filePath) {
    cache.clear();
    return;
  }
  cache.delete(String(filePath));
}

export function rememberMtimeStore(filePath, store) {
  const key = String(filePath || '');
  cache.set(key, {
    mtime: fileMtimeMs(key),
    store,
    hits: 0,
  });
  return store;
}

export function readMtimeCachedStore(filePath, { empty, parse } = {}) {
  const key = String(filePath || '');
  const mtime = fileMtimeMs(key);
  const cached = cache.get(key);
  if (cached && cached.mtime === mtime) {
    cached.hits += 1;
    return cached.store;
  }
  if (!existsSync(key)) {
    const store = typeof empty === 'function' ? empty() : empty;
    rememberMtimeStore(key, store);
    return store;
  }
  const parsed = JSON.parse(readFileSync(key, 'utf-8'));
  const store = typeof parse === 'function' ? parse(parsed) : parsed;
  rememberMtimeStore(key, store);
  return store;
}
