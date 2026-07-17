import { execFile } from 'child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { basename, dirname, join, relative } from 'path';
import { fileURLToPath } from 'url';
import { AgentTaskQueue } from '../agent-task-queue.mjs';
import {
  patchConsiderJob,
  slugify,
  syncConsiderJobsToDashboard,
  upsertConsiderJob,
} from '../jobs-to-consider-store.mjs';
import { ParallelResearchProvider } from '../research-providers/parallel.mjs';
import {
  patchEuraxessOpportunity,
  readEuraxessOpportunities,
  syncEuraxessOpportunitiesToDashboard,
} from './opportunity-store.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const WEB_TRACKER_DIR = join(LIB_DIR, '..', '..');
export const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
export const DATA_DIR = join(WEB_TRACKER_DIR, 'data');
export const RUNTIME_DIR = join(WEB_TRACKER_DIR, 'runtime');
/** Dedicated EURAXESS lane — never mix with Jobs-to-Consider / Helion / CFS agent-tasks.ndjson */
export const TASKS_FILE = join(DATA_DIR, 'euraxess-agent-tasks.ndjson');
export const LEGACY_SHARED_TASKS_FILE = join(DATA_DIR, 'agent-tasks.ndjson');
export const FACTORY_RUN_DIR = join(RUNTIME_DIR, 'euraxess-factory');

const RESEARCH_THRESHOLD = 3.5;
const PACK_THRESHOLD = 4.0;
const RETRYABLE_WORKER_STATUSES = new Set(['failed_retryable', 'runner_unavailable', 'needs_worker']);

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanMultiline(value) {
  return String(value ?? '').replace(/\r\n/g, '\n').trim();
}

function today() {
  return new Date().toISOString().slice(0, 10);
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

function relToCareer(filePath) {
  if (!filePath) return '';
  const rel = relative(CAREER_OPS_DIR, filePath).replace(/\\/g, '/');
  return rel && !rel.startsWith('..') ? rel : '';
}

function runCommand(command, args, { cwd = CAREER_OPS_DIR, timeoutMs = 60_000 } = {}) {
  return new Promise(resolve => {
    execFile(command, args, { cwd, timeout: timeoutMs, windowsHide: true }, (err, stdout = '', stderr = '') => {
      resolve({
        ok: !err,
        exit_code: err?.code || 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: err?.message || '',
      });
    });
  });
}

export async function euraxessFactoryRunnerHealth({ env = process.env } = {}) {
  const [parallel, codex] = await Promise.all([
    runCommand('parallel-cli', ['--version'], { timeoutMs: 10_000 }),
    runCommand('codex', ['--version'], { timeoutMs: 10_000 }),
  ]);
  const artifactsEnabled = ['1', 'true', 'yes', 'on'].includes(cleanText(env.EURAXESS_FACTORY_ARTIFACTS_ENABLED).toLowerCase());
  return {
    generated_at: new Date().toISOString(),
    parallel: {
      ok: parallel.ok,
      detail: parallel.stdout || parallel.stderr || parallel.error || '',
    },
    artifact_runner: {
      configured: artifactsEnabled,
      command: cleanText(env.EURAXESS_FACTORY_ARTIFACT_RUNNER || 'codex'),
      ok: artifactsEnabled && codex.ok,
      detail: codex.stdout || codex.stderr || codex.error || (artifactsEnabled ? '' : 'Set EURAXESS_FACTORY_ARTIFACTS_ENABLED=true to allow draft application-pack generation.'),
    },
  };
}

function opportunityCompany(opportunity = {}) {
  return opportunity.institution || 'EURAXESS';
}

export function jobsToConsiderIdForOpportunity(opportunity = {}) {
  return opportunity.jobs_to_consider_id || slugify(`${opportunityCompany(opportunity)}-${opportunity.title}`);
}

export function ensureEuraxessConsiderJob(opportunity = {}) {
  const company = opportunityCompany(opportunity);
  const id = jobsToConsiderIdForOpportunity(opportunity);
  const resources = {
    ...(opportunity.resources || {}),
    ...(opportunity.artifacts?.research_report ? { report_md: opportunity.artifacts.research_report } : {}),
  };
  upsertConsiderJob({
    id,
    company,
    title: opportunity.title,
    url: opportunity.url,
    status: 'to_consider',
    source: 'euraxess',
    score: opportunity.score,
    fit_score: opportunity.score,
    liveness: opportunity.liveness || 'active',
    liveness_reason: opportunity.liveness_reason,
    notes: [
      `Queued from EURAXESS Factory (${Number(opportunity.score || 0).toFixed(1)}/5).`,
      opportunity.status === 'open_unverified' ? 'Verify deadline/application status before applying.' : '',
      opportunity.fit_rationale,
    ].filter(Boolean).join(' '),
    resources,
  });
  syncConsiderJobsToDashboard();
  return id;
}

function taskKey(task = {}) {
  return [task.type, task.source_id, task.title, task.url].filter(Boolean).join('|').toLowerCase();
}

function taskExists(tasks = [], input = {}) {
  const nextKey = taskKey(input);
  return tasks.some(task => taskKey(task) === nextKey);
}

export function createFactoryTasks(opportunity, jobsToConsiderId) {
  const queue = new AgentTaskQueue(TASKS_FILE);
  const existingTasks = queue.list();
  const created = [];
  const base = {
    company: opportunityCompany(opportunity),
    title: opportunity.title,
    url: opportunity.url,
    source_id: jobsToConsiderId,
    provider: 'euraxess',
  };
  const researchTask = {
    ...base,
    type: 'deep_research',
    notes: `EURAXESS Factory score ${Number(opportunity.score || 0).toFixed(1)}/5. Verify deadline/application status first. ${opportunity.fit_rationale || ''}`,
  };
  if (!taskExists([...existingTasks, ...created], researchTask)) created.push(queue.create(researchTask));

  if (Number(opportunity.score || 0) >= PACK_THRESHOLD) {
    const artifactTask = {
      ...base,
      type: 'application_artifact',
      artifact_kind: 'application_pack',
      expected_resources: ['resume_tex', 'resume_pdf', 'cover_letter_pdf', 'email_draft'],
      notes: 'Create draft artifacts only after confirming the EURAXESS posting is still active. Never submit automatically.',
    };
    if (!taskExists([...existingTasks, ...created], artifactTask)) created.push(queue.create(artifactTask));
  }
  return created;
}

export function queueEuraxessOpportunityWork(opportunity = {}, { pack = false } = {}) {
  const jobsToConsiderId = jobsToConsiderIdForOpportunity(opportunity);
  const queue = new AgentTaskQueue(TASKS_FILE);
  const existingTasks = queue.list();
  const created = [];
  const base = {
    company: opportunityCompany(opportunity),
    title: opportunity.title,
    url: opportunity.url,
    source_id: jobsToConsiderId,
    provider: 'euraxess',
  };
  if (pack) {
    const artifactTask = {
      ...base,
      type: 'application_artifact',
      artifact_kind: 'application_pack',
      expected_resources: ['resume_tex', 'resume_pdf', 'cover_letter_pdf', 'email_draft'],
      notes: 'Queued from EURAXESS dashboard. Draft only; never submit automatically.',
    };
    if (!taskExists(existingTasks, artifactTask)) created.push(queue.create(artifactTask));
  } else {
    const researchTask = {
      ...base,
      type: 'deep_research',
      notes: `Queued from EURAXESS dashboard. Score ${Number(opportunity.score || 0).toFixed(1)}/5. ${opportunity.fit_rationale || ''}`,
    };
    if (!taskExists(existingTasks, researchTask)) created.push(queue.create(researchTask));
  }
  return { jobsToConsiderId, tasks: created };
}

export function eligibleForFactory(opportunity = {}, { force = false } = {}) {
  const score = Number(opportunity.score || 0);
  if (!force && score < RESEARCH_THRESHOLD) return false;
  if (!['open', 'open_unverified', 'needs_deadline_verification'].includes(opportunity.status)) return false;
  if (!force && opportunity.coverage?.duplicate_of) return false;
  if (!force && ['research_ready', 'pack_ready', 'application_pack_ready', 'completed', 'failed_final'].includes(opportunity.worker_status)) return false;
  return true;
}

export function nextFactoryStage(opportunity = {}) {
  const score = Number(opportunity.score || 0);
  if (score >= PACK_THRESHOLD && !(opportunity.artifacts?.resume_pdf || opportunity.resources?.resume_pdf)) return 'queued_pack';
  if (score >= RESEARCH_THRESHOLD && !(opportunity.artifacts?.research_report || opportunity.research_report)) return 'queued_research';
  if (score >= RESEARCH_THRESHOLD) return 'research_ready';
  return 'scored';
}

function workerStatus(opportunity = {}) {
  return opportunity.automation?.worker_status || opportunity.worker_status || '';
}

function researchTopic(opportunity = {}) {
  return [
    'Research this EURAXESS opportunity using current public information.',
    `Title: ${opportunity.title}`,
    `Institution: ${opportunity.institution}`,
    `URL: ${opportunity.url}`,
    `Score: ${Number(opportunity.score || 0).toFixed(1)}/5`,
    `Fit rationale: ${opportunity.fit_rationale || ''}`,
    'Verify whether the posting is still active, find deadline/application instructions, summarize fit for Harsh Desai, and cite public sources.',
    'Do not draft or submit an application.',
  ].join('\n');
}

function reportPathFor(opportunity = {}) {
  const slug = slugify(`${opportunityCompany(opportunity)}-${opportunity.title}`).slice(0, 80);
  return join(CAREER_OPS_DIR, 'reports', `euraxess-${slug}-${today()}.md`);
}

function manifestPathFor(opportunity = {}) {
  const slug = slugify(`${opportunityCompany(opportunity)}-${opportunity.title}`).slice(0, 80);
  return join(FACTORY_RUN_DIR, `${today()}-${slug}-manifest.json`);
}

function buildReport({ opportunity, researchText = '', researchResultUrl = '' }) {
  return [
    `# EURAXESS Research: ${opportunity.title}`,
    '',
    `**Institution:** ${opportunity.institution || 'EURAXESS'}`,
    `**URL:** ${opportunity.url}`,
    `**Score:** ${Number(opportunity.score || 0).toFixed(1)}/5`,
    `**Status:** ${opportunity.status}`,
    `**Generated:** ${new Date().toISOString()}`,
    researchResultUrl ? `**Research run:** ${researchResultUrl}` : '',
    '',
    '## Fit Rationale',
    '',
    opportunity.fit_rationale || 'No fit rationale recorded.',
    '',
    '## Verification First',
    '',
    '- Verify deadline and application status on the EURAXESS/employer page before using any draft artifacts.',
    '- Do not submit or email anything without user review.',
    '',
    '## Research Notes',
    '',
    cleanMultiline(researchText) || 'No external research text was produced.',
    '',
  ].filter(line => line !== '').join('\n');
}

function writeManifest(opportunity, input = {}) {
  const manifestPath = manifestPathFor(opportunity);
  const manifest = {
    version: 1,
    generated_at: new Date().toISOString(),
    opportunity_id: opportunity.id,
    title: opportunity.title,
    url: opportunity.url,
    report_md: input.report_md || '',
    resources: input.resources || {},
    validation: input.validation || {},
    score: Number(opportunity.score || 0),
    decision: input.decision || {},
    errors: input.errors || [],
  };
  atomicWrite(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { manifest, manifest_path: relToCareer(manifestPath) };
}

async function runResearch(opportunity, { dryRun = false, pollTimeoutSec = 120 } = {}) {
  if (dryRun) {
    return { status: 'dry_run', report_md: '', research_result_url: '', text: '' };
  }
  try {
    const provider = new ParallelResearchProvider({
      cwd: CAREER_OPS_DIR,
      outputDir: join(DATA_DIR, 'research-runs'),
    });
    const health = await provider.health();
    if (!health.ok) {
      return { status: 'runner_unavailable', error: health.detail || 'parallel-cli unavailable' };
    }

    const task = {
      id: opportunity.id,
      company: opportunityCompany(opportunity),
      title: opportunity.title,
      url: opportunity.url,
    };
    const started = await provider.start({ task, topic: researchTopic(opportunity) });
    const polled = await provider.poll({
      runId: started.run_id,
      outputBase: started.output_base,
      timeoutSec: pollTimeoutSec,
      auditId: started.audit_id,
    });
    if (polled.status === 'timeout') {
      return {
        status: 'timeout',
        research_run_id: started.run_id,
        research_result_url: started.result_url,
        output_base: started.output_base,
      };
    }
    const reportPath = reportPathFor(opportunity);
    atomicWrite(reportPath, buildReport({
      opportunity,
      researchText: polled.result_text || '',
      researchResultUrl: started.result_url,
    }));
    return {
      status: 'completed',
      report_md: relToCareer(reportPath),
      research_run_id: started.run_id,
      research_result_url: started.result_url,
      text: polled.result_text || '',
    };
  } catch (err) {
    const detail = cleanText(err?.stdout || err?.stderr || err?.message || 'Factory research failed.');
    const billing = /insufficient credit|billing|payment/i.test(detail);
    return {
      status: billing ? 'runner_unavailable' : 'failed_retryable',
      error: billing
        ? `Parallel research unavailable (billing/credit): ${detail.slice(0, 240)}`
        : detail.slice(0, 400),
    };
  }
}

export function selectFactoryCandidates(store = readEuraxessOpportunities(), { max = 3, force = false, retryFailures = false } = {}) {
  return (store.opportunities || [])
    .filter(item => {
      if (!eligibleForFactory(item, { force })) return false;
      if (!retryFailures) return true;
      return RETRYABLE_WORKER_STATUSES.has(workerStatus(item));
    })
    .sort((a, b) => Number(b.score || 0) - Number(a.score || 0))
    .slice(0, Math.max(1, Number(max) || 3));
}

export async function processEuraxessFactory({ max = 3, dryRun = false, force = false, retryFailures = false, pollTimeoutSec = 120 } = {}) {
  mkdirSync(FACTORY_RUN_DIR, { recursive: true });
  const store = readEuraxessOpportunities();
  const candidates = selectFactoryCandidates(store, { max, force, retryFailures });
  const results = [];

  for (const opportunity of candidates) {
    const jobsToConsiderId = jobsToConsiderIdForOpportunity(opportunity);
    const stage = nextFactoryStage(opportunity);
    const tasks = dryRun ? [] : createFactoryTasks(opportunity, jobsToConsiderId);
    let patch = {
      jobs_to_consider_id: jobsToConsiderId,
      needs_research: true,
      needs_application_pack: Number(opportunity.score || 0) >= PACK_THRESHOLD,
      worker_status: stage === 'queued_pack' ? 'queued_pack' : 'queued_research',
      automation: {
        ...(opportunity.automation || {}),
        worker_status: stage === 'queued_pack' ? 'queued_pack' : 'queued_research',
        current_stage: stage,
        attempts: Number(opportunity.automation?.attempts || 0) + (dryRun ? 0 : 1),
        last_run_at: dryRun ? opportunity.automation?.last_run_at : new Date().toISOString(),
        last_error: '',
        runner: 'euraxess-factory',
      },
    };
    let manifest = null;

    if (dryRun) {
      results.push({ id: opportunity.id, title: opportunity.title, stage, status: 'dry_run' });
      continue;
    }

    const research = await runResearch(opportunity, { dryRun, pollTimeoutSec });
    if (research.status === 'completed') {
      const resources = {
        ...(opportunity.resources || {}),
        report_md: research.report_md,
        research_report: research.report_md,
      };
      manifest = writeManifest(opportunity, {
        report_md: research.report_md,
        resources,
        validation: { research_report_exists: existsSync(join(CAREER_OPS_DIR, research.report_md)) },
        decision: {
          apply_recommendation: Number(opportunity.score || 0) >= PACK_THRESHOLD ? 'draft_application_pack' : 'research_review',
          rationale: opportunity.fit_rationale,
        },
      });
      patch = {
        ...patch,
        worker_status: Number(opportunity.score || 0) >= PACK_THRESHOLD ? 'needs_worker' : 'research_ready',
        research_report: research.report_md,
        resources: { ...resources, manifest_path: manifest.manifest_path },
        artifacts: {
          ...(opportunity.artifacts || {}),
          research_report: research.report_md,
          manifest_path: manifest.manifest_path,
        },
        automation: {
          ...patch.automation,
          worker_status: Number(opportunity.score || 0) >= PACK_THRESHOLD ? 'needs_worker' : 'research_ready',
          current_stage: Number(opportunity.score || 0) >= PACK_THRESHOLD ? 'runner_unavailable' : 'research_ready',
          last_error: Number(opportunity.score || 0) >= PACK_THRESHOLD ? 'Application-pack runner is not configured/enabled.' : '',
        },
        decision: {
          ...(opportunity.decision || {}),
          apply_recommendation: Number(opportunity.score || 0) >= PACK_THRESHOLD ? 'draft_application_pack' : 'research_review',
          rationale: opportunity.fit_rationale,
        },
      };
      ensureEuraxessConsiderJob({ ...opportunity, ...patch, jobs_to_consider_id: jobsToConsiderId });
      patchConsiderJob(jobsToConsiderId, { resources: patch.resources });
      syncConsiderJobsToDashboard();
    } else if (research.status === 'timeout') {
      patch = {
        ...patch,
        worker_status: 'queued_research',
        automation: {
          ...patch.automation,
          worker_status: 'queued_research',
          current_stage: 'queued_research',
          next_retry_at: new Date(Date.now() + 5 * 60_000).toISOString(),
          last_error: 'Parallel research is still running; retry later.',
        },
      };
    } else {
      patch = {
        ...patch,
        worker_status: research.status === 'runner_unavailable' ? 'runner_unavailable' : 'failed_retryable',
        automation: {
          ...patch.automation,
          worker_status: research.status === 'runner_unavailable' ? 'runner_unavailable' : 'failed_retryable',
          current_stage: research.status === 'runner_unavailable' ? 'runner_unavailable' : 'failed_retryable',
          last_error: research.error || 'Factory research failed.',
          next_retry_at: new Date(Date.now() + 30 * 60_000).toISOString(),
        },
      };
      manifest = writeManifest(opportunity, {
        errors: [patch.automation.last_error],
        decision: { apply_recommendation: 'needs_worker' },
      });
      patch.resources = { ...(opportunity.resources || {}), manifest_path: manifest.manifest_path };
      patch.artifacts = { ...(opportunity.artifacts || {}), manifest_path: manifest.manifest_path };
    }

    const updated = patchEuraxessOpportunity(opportunity.id, patch).opportunity;
    results.push({
      id: opportunity.id,
      title: opportunity.title,
      stage,
      status: updated.worker_status,
      tasks_created: tasks.length,
      report_md: updated.research_report,
      manifest_path: manifest?.manifest_path || updated.artifacts?.manifest_path || '',
      error: updated.automation?.last_error || '',
    });
  }

  if (!dryRun) syncEuraxessOpportunitiesToDashboard();
  return {
    generated_at: new Date().toISOString(),
    processed: results.length,
    dry_run: dryRun,
    results,
  };
}

export async function euraxessFactoryStatus() {
  const store = readEuraxessOpportunities();
  const health = await euraxessFactoryRunnerHealth();
  const opportunities = store.opportunities || [];
  const byWorker = {};
  const byStage = {};
  for (const item of opportunities) {
    const worker = item.worker_status || 'unknown';
    const stage = item.automation?.current_stage || 'unknown';
    byWorker[worker] = (byWorker[worker] || 0) + 1;
    byStage[stage] = (byStage[stage] || 0) + 1;
  }
  return {
    generated_at: new Date().toISOString(),
    total: opportunities.length,
    eligible_research: opportunities.filter(item => eligibleForFactory(item)).length,
    eligible_pack: opportunities.filter(item => Number(item.score || 0) >= PACK_THRESHOLD && ['open', 'open_unverified', 'needs_deadline_verification'].includes(item.status)).length,
    by_worker_status: byWorker,
    by_stage: byStage,
    latest_artifacts: opportunities
      .filter(item => item.research_report || Object.keys(item.resources || {}).length)
      .sort((a, b) => new Date(b.last_updated || 0) - new Date(a.last_updated || 0))
      .slice(0, 10)
      .map(item => ({
        id: item.id,
        title: item.title,
        score: item.score,
        research_report: item.research_report,
        resources: item.resources,
        worker_status: item.worker_status,
      })),
    runner_health: health,
    scan_summary: store.scan_summary,
  };
}

