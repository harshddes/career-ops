import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname } from 'path';

const VALID_TYPES = new Set(['evaluation', 'pdf', 'application_artifact', 'deep_research', 'contact_draft', 'followup', 'custom']);
const VALID_STATUS = new Set(['queued', 'in_progress', 'needs_user', 'completed', 'failed', 'cancelled']);
const VALID_ARTIFACT_KINDS = new Set(['resume', 'cover_letter', 'application_email', 'application_pack']);

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function normalizeArtifactKind(value) {
  const kind = cleanText(value);
  return VALID_ARTIFACT_KINDS.has(kind) ? kind : null;
}

function normalizeExpectedResources(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))];
}

function readTasks(filePath) {
  if (!existsSync(filePath)) return [];
  return readFileSync(filePath, 'utf-8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map(line => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);
}

function writeTasks(filePath, tasks) {
  const body = tasks.map(task => JSON.stringify(task)).join('\n');
  writeFileSync(filePath, body ? `${body}\n` : '');
}

export class AgentTaskQueue {
  constructor(filePath) {
    this.filePath = filePath;
    mkdirSync(dirname(filePath), { recursive: true });
  }

  list() {
    return readTasks(this.filePath).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  }

  create(input = {}) {
    const type = VALID_TYPES.has(input.type) ? input.type : 'custom';
    const artifactKind = normalizeArtifactKind(input.artifact_kind);
    const expectedResources = normalizeExpectedResources(input.expected_resources);
    const now = new Date().toISOString();
    const task = {
      id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      type,
      status: 'queued',
      created_at: now,
      updated_at: now,
      company: input.company || null,
      title: input.title || null,
      url: input.url || null,
      source_id: input.source_id || null,
      artifact_kind: artifactKind,
      expected_resources: expectedResources,
      mode: input.mode || this.defaultModeForType(type),
      work_auth: input.work_auth || null,
      provider: input.provider || null,
      attempts: Number(input.attempts || 0),
      research_run_id: input.research_run_id || null,
      research_result_url: input.research_result_url || null,
      research_output_base: input.research_output_base || null,
      autonomy_audit_id: input.autonomy_audit_id || null,
      result_path: input.result_path || null,
      proposed_writes: Array.isArray(input.proposed_writes) ? input.proposed_writes : [],
      approval_required: Boolean(input.approval_required),
      next_poll_at: input.next_poll_at || null,
      autonomy_result: input.autonomy_result || null,
      prompt: input.prompt || this.buildPrompt({
        ...input,
        type,
        artifact_kind: artifactKind,
        expected_resources: expectedResources,
      }),
      notes: input.notes || null,
    };
    appendFileSync(this.filePath, `${JSON.stringify(task)}\n`);
    return task;
  }

  update(id, patch = {}) {
    const tasks = readTasks(this.filePath);
    const idx = tasks.findIndex(task => task.id === id);
    if (idx === -1) return null;
    const status = patch.status && VALID_STATUS.has(patch.status) ? patch.status : tasks[idx].status;
    tasks[idx] = {
      ...tasks[idx],
      ...patch,
      status,
      updated_at: new Date().toISOString(),
    };
    writeTasks(this.filePath, tasks);
    return tasks[idx];
  }

  defaultModeForType(type) {
    return {
      evaluation: 'auto-pipeline',
      pdf: 'pdf',
      application_artifact: 'application-artifacts',
      deep_research: 'deep',
      contact_draft: 'contacto',
      followup: 'followup',
    }[type] || 'custom';
  }

  buildPrompt(input) {
    if (input.type === 'application_artifact') {
      return this.buildArtifactPrompt(input);
    }
    const lines = [
      `Run career-ops mode: ${this.defaultModeForType(input.type)}`,
      input.company ? `Company: ${input.company}` : null,
      input.title ? `Role/Target: ${input.title}` : null,
      input.url ? `URL: ${input.url}` : null,
      input.work_auth ? `Work authorization context: ${JSON.stringify(input.work_auth)}` : null,
      'Use the existing career-ops rules. Do not submit applications or send messages automatically.',
    ].filter(Boolean);
    return lines.join('\n');
  }

  buildArtifactPrompt(input) {
    const expectedResources = normalizeExpectedResources(input.expected_resources);
    const artifactKind = normalizeArtifactKind(input.artifact_kind) || 'application_pack';
    const labels = {
      resume: 'tailored resume PDF',
      cover_letter: 'cover letter PDF',
      application_email: 'application email draft',
      application_pack: 'full application pack: tailored resume PDF, cover letter PDF, and application email draft',
    };
    const lines = [
      `Run career-ops mode: application-artifacts`,
      `Requested artifact: ${labels[artifactKind] || artifactKind}`,
      input.company ? `Company: ${input.company}` : null,
      input.title ? `Role/Target: ${input.title}` : null,
      input.url ? `URL: ${input.url}` : null,
      input.source_id ? `Jobs to Consider ID: ${input.source_id}` : null,
      expectedResources.length ? `Expected job.resources keys: ${expectedResources.join(', ')}` : null,
      input.work_auth ? `Work authorization context: ${JSON.stringify(input.work_auth)}` : null,
      '',
      'Use cv.md, config/profile.yml, modes/_profile.md, article-digest.md when relevant, and the job posting/report context. Do not invent experience or metrics.',
      'For a resume, follow modes/pdf.md and save output/{company-slug}/cv-{candidate}-{company-role}-{YYYY-MM-DD}.tex plus .pdf using generate-latex.mjs.',
      'For a cover letter, follow modes/application-artifacts.md and match the Pranos cover letter format/style.',
      'For an application email, follow modes/application-artifacts.md and save output/{company-slug}/application-email-{company-role}-{YYYY-MM-DD}.md.',
      'Render resume PDFs with generate-latex.mjs. Render cover letter PDFs with generate-pdf.mjs. Keep all generated files under output/, always inside the kebab-case company subfolder (create it if missing; reuse it for every future role at that company).',
      '',
      'MANDATORY — same turn, before you finish: attach every generated file to the Jobs to Consider tracker.',
      'Use upsertConsiderJob() / patchConsiderJob() from WEB-TRACKER/lib/jobs-to-consider-store.mjs, then syncConsiderJobsToDashboard().',
      'If no job exists yet, create it from company, title, and URL. Artifact generation is incomplete until job.resources is updated.',
      'Resource paths to link:',
      JSON.stringify({ resources: Object.fromEntries(expectedResources.map(key => [key, `output/...`])) }, null, 2),
      'Alternative when the WEB-TRACKER server is running: PATCH /api/jobs-to-consider/{Jobs to Consider ID} with the same resources object.',
      'Never submit the application or send email automatically.',
    ].filter(line => line !== null);
    return lines.join('\n');
  }
}
