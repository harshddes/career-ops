/**
 * gzip / brotli for JSON API responses. Pretty-print stays on disk, not the wire.
 */

import { brotliCompressSync, constants as zlibConstants, gzipSync } from 'zlib';

const MIN_BYTES = 512;

export function compactJson(value) {
  return JSON.stringify(value);
}

export function encodeCompressedBody(body, acceptEncoding = '') {
  const raw = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf-8');
  const accept = String(acceptEncoding || '').toLowerCase();
  if (raw.length < MIN_BYTES) {
    return { payload: raw, encoding: '' };
  }
  if (/\bbr\b/.test(accept)) {
    return {
      payload: brotliCompressSync(raw, {
        params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 4 },
      }),
      encoding: 'br',
    };
  }
  if (/\bgzip\b/.test(accept)) {
    return { payload: gzipSync(raw), encoding: 'gzip' };
  }
  return { payload: raw, encoding: '' };
}

export function applyCompressedJsonHeaders(res, encoding) {
  res.setHeader?.('Content-Type', 'application/json; charset=utf-8');
  res.setHeader?.('Cache-Control', 'no-store');
  res.setHeader?.('Vary', 'Accept-Encoding');
  if (encoding) res.setHeader?.('Content-Encoding', encoding);
}
