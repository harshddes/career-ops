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
      'For a resume, follow modes/pdf.md and save output/cv-{candidate}-{company-role}-{YYYY-MM-DD}.html plus .pdf.',
      'For a cover letter, follow modes/application-artifacts.md and match the Pranos cover letter format/style.',
      'For an application email, follow modes/application-artifacts.md and save output/application-email-{company-role}-{YYYY-MM-DD}.md.',
      'Render PDFs with generate-pdf.mjs. Keep all generated files under output/.',
      '',
      'After the files exist, attach them to this job with PATCH /api/jobs-to-consider/{Jobs to Consider ID}:',
      JSON.stringify({ resources: Object.fromEntries(expectedResources.map(key => [key, `output/...`])) }, null, 2),
      'Never submit the application or send email automatically.',
    ].filter(line => line !== null);
    return lines.join('\n');
  }
}
