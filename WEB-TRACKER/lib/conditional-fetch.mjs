/**
 * conditional-fetch.mjs — ETag/Last-Modified aware fetcher
 *
 * Returns { changed, status, data, etag, lastModified } so the caller
 * can skip processing when nothing changed (HTTP 304).
 */

const FETCH_TIMEOUT_MS = 15_000;

export async function fetchWithValidators(url, cache = {}) {
  const headers = { 'User-Agent': 'career-ops-web-tracker/1.0' };
  if (cache.etag) headers['If-None-Match'] = cache.etag;
  if (cache.lastModified) headers['If-Modified-Since'] = cache.lastModified;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, { headers, signal: controller.signal });

    if (res.status === 304) {
      return { changed: false, status: 304, data: null, etag: cache.etag, lastModified: cache.lastModified };
    }

    const etag = res.headers.get('etag') ?? cache.etag ?? null;
    const lastModified = res.headers.get('last-modified') ?? cache.lastModified ?? null;

    if (!res.ok) {
      return { changed: false, status: res.status, data: null, etag, lastModified, error: `HTTP ${res.status}` };
    }

    const contentType = res.headers.get('content-type') || '';
    const data = contentType.includes('json') ? await res.json() : await res.text();

    return { changed: true, status: res.status, data, etag, lastModified };
  } catch (err) {
    return { changed: false, status: 0, data: null, etag: cache.etag, lastModified: cache.lastModified, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fingerprint content for change detection on pages without ETag support.
 * Returns a short hash string.
 */
export function fingerprint(content) {
  const str = typeof content === 'string' ? content : JSON.stringify(content);
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(36);
}
