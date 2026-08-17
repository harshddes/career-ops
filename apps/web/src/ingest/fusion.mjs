import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectFusionJob } from './project.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const REGISTRY_PATH = join(ROOT, 'WEB-TRACKER', 'config', 'source-registry.json');

function parseGreenhouse(json, name) {
  return (json.jobs || []).map(job => ({
    title: job.title || '',
    url: job.absolute_url || '',
    company: name,
    location: job.location?.name || '',
    posted_at: job.updated_at || job.first_published_at || null,
  }));
}

function parseAshby(json, name) {
  return (json.jobs || []).map(job => ({
    title: job.title || '',
    url: job.jobUrl || '',
    company: name,
    location: job.location || '',
    posted_at: job.publishedAt || null,
  }));
}

function parseLever(json, name) {
  if (!Array.isArray(json)) return [];
  return json.map(job => ({
    title: job.text || '',
    url: job.hostedUrl || '',
    company: name,
    location: job.categories?.location || '',
    posted_at: job.createdAt ? new Date(job.createdAt).toISOString() : null,
  }));
}

const PARSERS = { greenhouse: parseGreenhouse, ashby: parseAshby, lever: parseLever };

export function loadFusionRegistry(path = REGISTRY_PATH) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function fusionTitleFilter(registry) {
  const pos = (registry.title_filter?.positive || []).map(key => key.toLowerCase());
  const neg = (registry.title_filter?.negative || []).map(key => key.toLowerCase());
  return (title) => {
    const text = String(title || '').toLowerCase();
    return (pos.length === 0 || pos.some(key => text.includes(key))) && !neg.some(key => text.includes(key));
  };
}

export async function fetchFusionCompact({
  fetchImpl = fetch,
  registryPath = REGISTRY_PATH,
  timeoutMs = 12_000,
} = {}) {
  const registry = loadFusionRegistry(registryPath);
  const matchTitle = fusionTitleFilter(registry);
  const sources = (registry.sources || []).filter(source => (
    source.enabled !== false
    && source.source_type === 'job_api'
    && source.api_url
    && PARSERS[source.platform]
  ));
  const jobs = [];
  for (const source of sources) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(source.api_url, { signal: controller.signal });
      if (!response.ok) continue;
      const json = await response.json();
      const parsed = PARSERS[source.platform](json, source.name).filter(job => matchTitle(job.title));
      for (const job of parsed) {
        jobs.push(projectFusionJob(job, {
          id: `org-${source.id}`,
          name: source.name,
          careers_url: source.careers_url,
          website: source.careers_url,
        }));
      }
    } catch {
      // Skip one ATS board; the rest of the ingest still runs.
    } finally {
      clearTimeout(timer);
    }
  }
  return jobs;
}
