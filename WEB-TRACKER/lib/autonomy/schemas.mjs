const FORBIDDEN_ACTIONS = new Set([
  'submit_application',
  'send_email',
  'send_linkedin',
  'click_apply',
  'delete_file',
  'delete_tracker_row',
]);

const KNOWN_ACTIONS = new Set([
  'report_draft',
  'tracker_addition',
  'jobs_to_consider_patch',
  'dashboard_metadata',
  'mark_duplicate_alert',
  ...FORBIDDEN_ACTIONS,
]);

export const AUTONOMY_RESULT_JSON_SCHEMA = {
  type: 'object',
  properties: {
    verdict: { type: 'string' },
    score: { type: ['number', 'null'] },
    summary: { type: 'string' },
    rationale: { type: 'string' },
    evidence: {
      type: 'array',
      items: { type: 'string' },
    },
    proposed_writes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          action: { type: 'string' },
          summary: { type: 'string' },
          risk: { type: 'string' },
          relative_path: { type: 'string' },
          content: { type: 'string' },
          fields: { type: 'object' },
        },
        required: ['action', 'summary'],
      },
    },
    questions: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: ['verdict', 'summary', 'proposed_writes'],
};

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function isObject(value) {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

export function parseJsonObject(value) {
  if (isObject(value)) return value;
  const text = String(value || '').trim();
  if (!text) throw new Error('empty model output');

  try {
    const parsed = JSON.parse(text);
    if (!isObject(parsed)) throw new Error('model output must be a JSON object');
    return parsed;
  } catch (err) {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) throw err;
    const parsed = JSON.parse(match[0]);
    if (!isObject(parsed)) throw new Error('model output must be a JSON object');
    return parsed;
  }
}

export function validateProposedWrites(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item, index) => {
    if (!isObject(item)) throw new Error(`proposed_writes[${index}] must be an object`);
    const action = cleanText(item.action || item.type);
    if (!KNOWN_ACTIONS.has(action)) throw new Error(`unsupported action: ${action || '(blank)'}`);
    return {
      ...item,
      action,
      summary: cleanText(item.summary),
      risk: cleanText(item.risk || 'medium') || 'medium',
    };
  });
}

export function validateAutonomyResult(value) {
  const result = parseJsonObject(value);
  const proposedWrites = validateProposedWrites(result.proposed_writes);

  return {
    verdict: cleanText(result.verdict || 'needs_review'),
    score: result.score === undefined || result.score === null ? null : Number(result.score),
    summary: cleanText(result.summary),
    rationale: cleanText(result.rationale),
    evidence: Array.isArray(result.evidence) ? result.evidence.map(cleanText).filter(Boolean) : [],
    proposed_writes: proposedWrites,
    questions: Array.isArray(result.questions) ? result.questions.map(cleanText).filter(Boolean) : [],
  };
}

export function isForbiddenAction(action) {
  return FORBIDDEN_ACTIONS.has(cleanText(action));
}

export function safeRelativePath(value, allowedRoots = ['reports', 'output', 'batch/tracker-additions']) {
  const clean = cleanText(value).replace(/\\/g, '/').replace(/^\/+/, '');
  if (!clean || clean.includes('..')) return null;
  return allowedRoots.some(root => clean === root || clean.startsWith(`${root}/`)) ? clean : null;
}
