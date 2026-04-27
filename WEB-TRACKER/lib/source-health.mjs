import { existsSync, readFileSync } from 'fs';

function readJson(path, fallback) {
  if (!existsSync(path)) return fallback;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}

export function summarizeSourceHealth({ registryPath, statePath, jobsPath, phdPath }, now = new Date()) {
  const registry = readJson(registryPath, { sources: [] });
  const state = readJson(statePath, { sources: {} });
  const jobs = readJson(jobsPath, null);
  const phd = readJson(phdPath, null);
  const status_counts = {};
  const failing_sources = [];
  const stale_sources = [];

  for (const source of registry.sources || []) {
    const ss = state.sources?.[source.id] || {};
    const status = ss.last_status ?? 'never';
    status_counts[status] = (status_counts[status] || 0) + 1;

    if (status === 0 || status >= 400) {
      failing_sources.push({
        id: source.id,
        name: source.name,
        source_type: source.source_type,
        status,
        api_url: source.api_url || null,
        careers_url: source.careers_url || null,
        notes: source.notes || null,
      });
    }

    if (ss.next_poll && new Date(ss.next_poll) < now) {
      stale_sources.push({
        id: source.id,
        name: source.name,
        next_poll: ss.next_poll,
        last_poll: ss.last_poll || null,
      });
    }
  }

  return {
    generated_at: now.toISOString(),
    sources_total: (registry.sources || []).length,
    tracked_sources: Object.keys(state.sources || {}).length,
    status_counts,
    failing_sources,
    stale_sources,
    data_freshness: {
      fusion_jobs_generated_at: jobs?.generated_at || null,
      phd_opportunities_generated_at: phd?.generated_at || null,
    },
  };
}
