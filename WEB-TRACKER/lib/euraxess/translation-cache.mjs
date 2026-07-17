import { existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const TRACKER_DIR = join(LIB_DIR, '..', '..');
const CACHE_FILE = join(TRACKER_DIR, 'data', 'euraxess-translation-cache.json');

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function readCache() {
  if (!existsSync(CACHE_FILE)) return { version: 1, entries: {} };
  try {
    const parsed = JSON.parse(readFileSync(CACHE_FILE, 'utf-8'));
    return {
      version: 1,
      entries: parsed?.entries && typeof parsed.entries === 'object' ? parsed.entries : {},
    };
  } catch {
    return { version: 1, entries: {} };
  }
}

function atomicWrite(filePath, content) {
  mkdirSync(dirname(filePath), { recursive: true });
  const tempPath = join(dirname(filePath), `.${basename(filePath)}.tmp-${Date.now()}`);
  writeFileSync(tempPath, content, 'utf-8');
  try {
    renameSync(tempPath, filePath);
  } catch (err) {
    if (!['EPERM', 'EACCES'].includes(err?.code)) throw err;
    writeFileSync(filePath, content, 'utf-8');
    try { unlinkSync(tempPath); } catch {}
  }
}

function writeCache(cache) {
  atomicWrite(CACHE_FILE, `${JSON.stringify({ version: 1, updated_at: new Date().toISOString(), entries: cache.entries }, null, 2)}\n`);
}

async function deeplTranslate(text, env = process.env) {
  const key = cleanText(env.DEEPL_API_KEY || env.EURAXESS_DEEPL_API_KEY);
  if (!key) return '';
  const endpoint = key.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';
  const body = new URLSearchParams({
    text,
    target_lang: cleanText(env.EURAXESS_TRANSLATION_TARGET || 'EN-US'),
  });
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });
  if (!res.ok) return '';
  const parsed = await res.json();
  return cleanText(parsed?.translations?.[0]?.text);
}

export async function applyTranslationCache(prospect, { env = process.env } = {}) {
  if (!prospect?.translation_cache_key) return prospect;
  const cache = readCache();
  const cached = cache.entries[prospect.translation_cache_key];
  if (cached) {
    return {
      ...prospect,
      translated_title: prospect.translated_title || cached.title || '',
      translated_summary: prospect.translated_summary || cached.summary || '',
      language: prospect.language || cached.detected_source_language || '',
    };
  }

  const enabled = ['1', 'true', 'yes', 'on'].includes(cleanText(env.EURAXESS_TRANSLATION_ENABLED).toLowerCase());
  const sourceLanguage = cleanText(prospect.language).toLowerCase();
  if (!enabled || sourceLanguage === 'en') return prospect;

  const [title, summary] = await Promise.all([
    prospect.name ? deeplTranslate(prospect.name, env) : '',
    prospect.notes ? deeplTranslate(prospect.notes.slice(0, 1800), env) : '',
  ]);
  if (!title && !summary) return prospect;

  cache.entries[prospect.translation_cache_key] = {
    title,
    summary,
    detected_source_language: prospect.language || '',
    translated_at: new Date().toISOString(),
  };
  writeCache(cache);
  return {
    ...prospect,
    translated_title: prospect.translated_title || title,
    translated_summary: prospect.translated_summary || summary,
  };
}
