import { existsSync, readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const WEB_TRACKER_DIR = join(LIB_DIR, '..');
export const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
export const PHD_RESEARCH_SOURCES_FILE = join(WEB_TRACKER_DIR, 'data', 'phd-prospect-sources.json');

const DEFAULT_PHD_SOURCES = [
  {
    id: 'kth',
    label: 'KTH & FP3 Network',
    country: 'Sweden',
    prospects_file: 'kth-research-prospects.json',
    api_prefix: '/api/phd-research-prospects/kth',
  },
];

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export function cleanSourceId(value = '') {
  return cleanText(value).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
}

function defaultProspectsFile(sourceId) {
  return sourceId === 'private-co' ? 'private-co-phd-paths.json' : `${sourceId}-research-prospects.json`;
}

function normalizeSource(raw = {}) {
  const id = cleanSourceId(raw.id);
  if (!id) return null;
  return {
    ...raw,
    id,
    label: cleanText(raw.label || raw.name || id.toUpperCase()),
    prospects_file: cleanText(raw.prospects_file) || defaultProspectsFile(id),
    api_prefix: cleanText(raw.api_prefix) || `/api/phd-research-prospects/${id}`,
  };
}

export function loadPhdResearchSources(filePath = PHD_RESEARCH_SOURCES_FILE) {
  if (!existsSync(filePath)) return { version: 1, sources: DEFAULT_PHD_SOURCES };
  try {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
    const sources = Array.isArray(parsed?.sources)
      ? parsed.sources.map(normalizeSource).filter(Boolean)
      : [];
    return {
      version: parsed?.version || 1,
      generated_at: parsed?.generated_at || null,
      sources: sources.length ? sources : DEFAULT_PHD_SOURCES,
    };
  } catch {
    return { version: 1, sources: DEFAULT_PHD_SOURCES };
  }
}

export function allResearchSources() {
  const phdSources = loadPhdResearchSources().sources;
  return [
    {
      id: 'umich',
      label: 'U-M Research',
      prospects_file: 'umich-research-prospects.json',
      api_prefix: '/api/research-prospects',
      options: undefined,
    },
    ...phdSources.map(source => ({
      ...source,
      options: { source: source.id },
    })),
  ];
}

export function sourceIdFromProspectsFilename(fileName = '') {
  const clean = cleanText(fileName).toLowerCase().replace(/\\/g, '/').split('/').pop();
  if (!clean) return '';
  const match = allResearchSources().find(source => cleanText(source.prospects_file).toLowerCase() === clean);
  return match?.id || '';
}

export function researchProspectsFilenames() {
  return new Set(allResearchSources().map(source => cleanText(source.prospects_file)).filter(Boolean));
}
