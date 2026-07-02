import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const WEB_TRACKER_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');

function unquote(value = '') {
  const text = String(value).trim();
  if (
    (text.startsWith('"') && text.endsWith('"'))
    || (text.startsWith("'") && text.endsWith("'"))
  ) {
    return text.slice(1, -1);
  }
  return text;
}

export function loadEnv({ dir = WEB_TRACKER_DIR } = {}) {
  const envPath = join(dir, '.env');
  if (!existsSync(envPath)) {
    return { loaded: false, path: envPath };
  }

  const content = readFileSync(envPath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = unquote(trimmed.slice(eq + 1));
    if (!(key in process.env)) process.env[key] = value;
  }

  return { loaded: true, path: envPath };
}
