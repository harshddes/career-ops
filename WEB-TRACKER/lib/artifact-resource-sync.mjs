import { existsSync, readdirSync, statSync } from 'fs';
import { basename, extname, join } from 'path';
import {
  CANONICAL_JOBS_FILE,
  CAREER_OPS_DIR,
  readConsiderJobs,
  slugify,
  writeConsiderJobs,
} from './jobs-to-consider-store.mjs';

const ARTIFACT_SPECS = [
  { prefix: 'cover-letter-', extensions: new Set(['.pdf']), resourceKey: 'cover_letter_pdf' },
  { prefix: 'cv-', extensions: new Set(['.tex']), resourceKey: 'resume_tex' },
  { prefix: 'cv-', extensions: new Set(['.pdf']), resourceKey: 'resume_pdf' },
  { prefix: 'application-email-', extensions: new Set(['.md']), resourceKey: 'email_draft' },
];

const DATE_SUFFIX_RE = /-\d{4}-\d{2}-\d{2}$/;
const DATE_CAPTURE_RE = /-(\d{4}-\d{2}-\d{2})$/;

function normalizeRelativePath(value = '') {
  return String(value || '').replace(/\\/g, '/').replace(/^\/+/, '');
}

function stripDateSuffix(value) {
  return value.replace(DATE_SUFFIX_RE, '');
}

function artifactDateScore(value) {
  const match = value.match(DATE_CAPTURE_RE);
  if (!match) return 0;
  const score = Date.parse(`${match[1]}T00:00:00.000Z`);
  return Number.isFinite(score) ? score : 0;
}

function parseArtifactPath(fileName) {
  const ext = extname(fileName).toLowerCase();
  const stem = basename(fileName, ext);
  const spec = ARTIFACT_SPECS.find(item => stem.startsWith(item.prefix) && item.extensions.has(ext));
  if (!spec) return null;

  const core = stripDateSuffix(stem.slice(spec.prefix.length));
  if (!core) return null;

  return {
    core,
    dateScore: artifactDateScore(stem),
    ext,
    resourceKey: spec.resourceKey,
  };
}

function resourceAliasFromPath(resourcePath, resourceKey) {
  const fileName = basename(normalizeRelativePath(resourcePath));
  const parsed = parseArtifactPath(fileName);
  if (!parsed || parsed.resourceKey !== resourceKey) return null;
  return parsed.core;
}

function jobAliases(job) {
  const aliases = new Set([
    slugify(job.id),
    slugify(`${job.company} ${job.title}`),
  ]);

  for (const key of ['resume_tex', 'resume_pdf', 'cover_letter_pdf', 'email_draft']) {
    const alias = resourceAliasFromPath(job.resources?.[key], key);
    if (alias) aliases.add(alias);
  }

  return [...aliases].filter(Boolean).sort((a, b) => b.length - a.length);
}

function artifactMatchesJob(artifactCore, aliases) {
  return aliases.some(alias => artifactCore === alias || artifactCore.endsWith(`-${alias}`));
}

function artifactScore(artifact) {
  return artifact.dateScore || artifact.mtimeMs || 0;
}

function currentResourceScore(resourcePath, outputDir) {
  const clean = normalizeRelativePath(resourcePath);
  if (!clean) return 0;

  const parsed = parseArtifactPath(basename(clean));
  const dateScore = parsed?.dateScore || 0;
  const absolutePath = join(outputDir, basename(clean));
  let mtimeMs = 0;
  if (existsSync(absolutePath)) {
    try {
      mtimeMs = statSync(absolutePath).mtimeMs;
    } catch {}
  }
  return dateScore || mtimeMs;
}

function listArtifacts(outputDir) {
  if (!existsSync(outputDir)) return [];

  return readdirSync(outputDir, { withFileTypes: true })
    .filter(entry => entry.isFile())
    .map((entry) => {
      const parsed = parseArtifactPath(entry.name);
      if (!parsed) return null;
      const absolutePath = join(outputDir, entry.name);
      const stats = statSync(absolutePath);
      return {
        ...parsed,
        fileName: entry.name,
        mtimeMs: stats.mtimeMs,
        relativePath: `output/${entry.name}`,
      };
    })
    .filter(Boolean);
}

export function syncArtifactResources({
  jobsFile = CANONICAL_JOBS_FILE,
  outputDir = join(CAREER_OPS_DIR, 'output'),
} = {}) {
  const store = readConsiderJobs(jobsFile);
  const artifacts = listArtifacts(outputDir);
  if (!artifacts.length || !store.jobs.length) {
    return { changed: false, updated: 0, linked: [] };
  }

  const aliasesByJobId = new Map(store.jobs.map(job => [job.id, jobAliases(job)]));
  const updatesByJobId = new Map();

  for (const artifact of artifacts) {
    const matches = store.jobs.filter(job => artifactMatchesJob(artifact.core, aliasesByJobId.get(job.id) || []));
    if (matches.length !== 1) continue;

    const job = matches[0];
    const current = updatesByJobId.get(job.id)?.[artifact.resourceKey]
      || job.resources?.[artifact.resourceKey]
      || '';
    const currentScore = currentResourceScore(current, outputDir);

    if (current && current !== artifact.relativePath && currentScore > artifactScore(artifact)) continue;

    const jobUpdates = updatesByJobId.get(job.id) || {};
    jobUpdates[artifact.resourceKey] = artifact.relativePath;
    updatesByJobId.set(job.id, jobUpdates);
  }

  if (!updatesByJobId.size) {
    return { changed: false, updated: 0, linked: [] };
  }

  const linked = [];
  const nextJobs = store.jobs.map((job) => {
    const updates = updatesByJobId.get(job.id);
    if (!updates) return job;

    const resources = { ...(job.resources || {}) };
    let changed = false;
    for (const [key, value] of Object.entries(updates)) {
      if (resources[key] === value) continue;
      resources[key] = value;
      changed = true;
      linked.push({ jobId: job.id, resourceKey: key, path: value });
    }

    if (!changed) return job;
    return {
      ...job,
      last_updated: new Date().toISOString(),
      resources,
    };
  });

  if (!linked.length) {
    return { changed: false, updated: 0, linked: [] };
  }

  writeConsiderJobs({ ...store, jobs: nextJobs }, jobsFile);
  return {
    changed: true,
    updated: new Set(linked.map(item => item.jobId)).size,
    linked,
  };
}

if (process.argv[1]?.endsWith('artifact-resource-sync.mjs')) {
  const result = syncArtifactResources();
  console.log(JSON.stringify(result, null, 2));
}
