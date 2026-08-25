/**
 * Compact atomic JSON writes. Fail fast — never sleep the HTTP thread on Dropbox locks.
 */
import { mkdirSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname } from 'path';

const RETRY_CODES = new Set(['EPERM', 'EACCES', 'EBUSY', 'EAGAIN', 'UNKNOWN']);

export function compactJsonLine(value) {
  return `${JSON.stringify(value)}\n`;
}

export function atomicWrite(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = joinTemp(filePath);
  writeFileSync(tempPath, content, 'utf-8');
  try {
    renameSync(tempPath, filePath);
    return;
  } catch (err) {
    if (!RETRY_CODES.has(err?.code)) {
      try { unlinkSync(tempPath); } catch {}
      throw err;
    }
  }
  try {
    writeFileSync(filePath, content, 'utf-8');
    try { unlinkSync(tempPath); } catch {}
  } catch (writeErr) {
    try { unlinkSync(tempPath); } catch {}
    throw writeErr;
  }
}

function joinTemp(filePath) {
  return `${dirname(filePath)}/.${basename(filePath)}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
