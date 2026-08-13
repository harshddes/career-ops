import { existsSync, mkdirSync, readFileSync, renameSync, statSync, unlinkSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { slugify } from './jobs-to-consider-store.mjs';
import { getDefenseSheetEnrichment } from './defense-sheet-enrichment.mjs';
import {
  RESEARCH_USER_STATE_FILE,
  applyUserStateToProspect,
  applyUserStateToStore,
  applyOutreachSemantics,
  normalizeOutreach,
  patchResearchUserState,
  sourceIdFromCanonicalPath,
} from './research-user-state.mjs';
import { DEFAULT_DIGEST_TIMEZONE, localDateString } from './today-activity.mjs';

const LIB_DIR = dirname(fileURLToPath(import.meta.url));
export const WEB_TRACKER_DIR = join(LIB_DIR, '..');
export const CAREER_OPS_DIR = join(WEB_TRACKER_DIR, '..');
export const CAREER_DATA_DIR = join(CAREER_OPS_DIR, 'data');
export const DASHBOARD_DATA_DIR = join(WEB_TRACKER_DIR, 'data');
export const CANONICAL_RESEARCH_PROSPECTS_FILE = join(CAREER_DATA_DIR, 'umich-research-prospects.json');
export const DASHBOARD_RESEARCH_PROSPECTS_FILE = join(DASHBOARD_DATA_DIR, 'umich-research-prospects.json');
export const CANONICAL_KTH_RESEARCH_PROSPECTS_FILE = join(CAREER_DATA_DIR, 'kth-research-prospects.json');
export const DASHBOARD_KTH_RESEARCH_PROSPECTS_FILE = join(DASHBOARD_DATA_DIR, 'kth-research-prospects.json');
export const CANONICAL_IPP_RESEARCH_PROSPECTS_FILE = join(CAREER_DATA_DIR, 'ipp-research-prospects.json');
export const DASHBOARD_IPP_RESEARCH_PROSPECTS_FILE = join(DASHBOARD_DATA_DIR, 'ipp-research-prospects.json');

const RESEARCH_PROSPECT_CONFIGS = {
  umich: {
    scope: 'University of Michigan Ann Arbor research prospects',
    sourceReport: 'WEB-TRACKER/research/umich-research-prospects-ann-arbor-2026.json',
    canonicalFile: CANONICAL_RESEARCH_PROSPECTS_FILE,
    dashboardFile: DASHBOARD_RESEARCH_PROSPECTS_FILE,
  },
  kth: {
    scope: 'KTH Royal Institute of Technology and FP3 fusion research prospects',
    sourceReport: 'WEB-TRACKER/research/kth-fusion-epp-prospects-2026.json',
    canonicalFile: CANONICAL_KTH_RESEARCH_PROSPECTS_FILE,
    dashboardFile: DASHBOARD_KTH_RESEARCH_PROSPECTS_FILE,
  },
  ipp: {
    scope: 'Max Planck IPP ITER technology and diagnostics research prospects',
    sourceReport: 'WEB-TRACKER/research/ipp-iter-technology-diagnostics-prospects-2026.json',
    canonicalFile: CANONICAL_IPP_RESEARCH_PROSPECTS_FILE,
    dashboardFile: DASHBOARD_IPP_RESEARCH_PROSPECTS_FILE,
  },
  'private-co': {
    scope: 'Private company PhD collaboration paths — university enrollment with industrial co-supervision',
    sourceReport: 'WEB-TRACKER/research/private-company-phd-collaboration-2026.md',
    canonicalFile: join(CAREER_DATA_DIR, 'private-co-phd-paths.json'),
    dashboardFile: join(DASHBOARD_DATA_DIR, 'private-co-phd-paths.json'),
  },
};

const ALLOWED_STATUSES = new Set([
  'not_contacted',
  'draft_ready',
  'contacted',
  'followed_up',
  'responded_positive',
  'responded_negative',
  'archived',
]);
export const SILENCE_NUDGE_DAYS = 7;
const USER_STATE_FIELDS = ['status', 'last_contacted', 'last_followed_up', 'follow_up_date', 'notes', 'outreach'];
const USER_STATE_FIELD_SET = new Set(USER_STATE_FIELDS);
const researchProspectReadCache = new Map();

export function isUserStateOnlyPatch(updates = {}) {
  const keys = Object.keys(updates || {});
  if (!keys.length) return false;
  return keys.every(key => USER_STATE_FIELD_SET.has(key));
}

function fileMtimeMs(filePath) {
  try {
    return existsSync(filePath) ? statSync(filePath).mtimeMs : 0;
  } catch {
    return 0;
  }
}

function cacheKeyForProspects(filePath) {
  return String(filePath || '');
}

function overlayUserStateFile(filePath, filePathOrOptions) {
  if (typeof filePathOrOptions === 'object' && filePathOrOptions?.userStateFile) {
    return filePathOrOptions.userStateFile;
  }
  return usesPersistentUserState(filePath) ? RESEARCH_USER_STATE_FILE : '';
}

function rememberResearchProspects(filePath, store, overlayFile = '') {
  researchProspectReadCache.set(cacheKeyForProspects(filePath), {
    mtime: fileMtimeMs(filePath),
    userMtime: overlayFile ? fileMtimeMs(overlayFile) : 0,
    overlayFile,
    store,
  });
}

export function invalidateResearchProspectReadCache(filePath = '') {
  if (!filePath) {
    researchProspectReadCache.clear();
    return;
  }
  researchProspectReadCache.delete(cacheKeyForProspects(filePath));
}

export const DEFENSE_SHEET_QUESTIONS = [
  { id: 'professor_work', question: 'What this professor works on' },
  { id: 'research_interests', question: 'What did you research? What does this person work on? What are their research interests?' },
  { id: 'recent_publication', question: 'What is their current research from a recent publication?' },
  { id: 'hook_plain_english', question: 'What the hook means in plain English' },
  { id: 'honest_meeting_answer', question: 'What you can honestly say if asked in a meeting' },
  { id: 'risky_sentence', question: 'Which sentence is risky and should be softened' },
];

function cleanSourceId(value = 'umich') {
  const source = cleanText(value || 'umich').toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');
  return source || 'umich';
}

function sourceIdFromOptions(value = {}) {
  if (typeof value === 'string') return '';
  return cleanSourceId(value.source || value.institution || 'umich');
}

export function researchProspectConfig(source = 'umich') {
  const sourceId = cleanSourceId(source);
  return RESEARCH_PROSPECT_CONFIGS[sourceId] || {
    scope: `${sourceId.toUpperCase()} research prospects`,
    sourceReport: `WEB-TRACKER/research/${sourceId}-research-prospects.json`,
    canonicalFile: join(CAREER_DATA_DIR, `${sourceId}-research-prospects.json`),
    dashboardFile: join(DASHBOARD_DATA_DIR, `${sourceId}-research-prospects.json`),
  };
}

function filePathFromOptions(filePathOrOptions, kind = 'canonical') {
  if (typeof filePathOrOptions === 'string') return filePathOrOptions;
  if (kind === 'dashboard' && filePathOrOptions?.dashboardFile) return filePathOrOptions.dashboardFile;
  if (kind === 'canonical' && filePathOrOptions?.canonicalFile) return filePathOrOptions.canonicalFile;
  const config = researchProspectConfig(sourceIdFromOptions(filePathOrOptions));
  return kind === 'dashboard' ? config.dashboardFile : config.canonicalFile;
}

function defaultScope(filePathOrOptions) {
  if (typeof filePathOrOptions === 'object') return researchProspectConfig(sourceIdFromOptions(filePathOrOptions)).scope;
  return RESEARCH_PROSPECT_CONFIGS.umich.scope;
}

function defaultSourceReport(raw = {}) {
  return researchProspectConfig(raw.source || raw.institution).sourceReport;
}

function shouldPreserveUserState(filePathOrOptions) {
  return typeof filePathOrOptions === 'object' && Boolean(filePathOrOptions?.preserveUserState);
}

function emptyStore(scope = RESEARCH_PROSPECT_CONFIGS.umich.scope) {
  return {
    version: 1,
    generated_at: new Date().toISOString(),
    scope,
    prospects: [],
  };
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

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function easternToday() {
  return localDateString(new Date(), DEFAULT_DIGEST_TIMEZONE);
}

/** Add calendar days to a YYYY-MM-DD string (UTC date arithmetic). */
export function addDaysYmd(ymd = '', days = 0) {
  const raw = cleanText(ymd);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return '';
  const [year, month, day] = raw.split('-').map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return dt.toISOString().slice(0, 10);
}

/** True when Contacted silence window has elapsed (default 7 days). */
export function isSilenceNudgeDue(prospect = {}, today = easternToday()) {
  const status = cleanText(prospect?.status || '').toLowerCase();
  const normalized = status === 'follow_up' || status === 'contacted' ? 'contacted' : status;
  if (normalized !== 'contacted') return false;
  const due = cleanText(prospect?.follow_up_date)
    || addDaysYmd(cleanText(prospect?.last_contacted), SILENCE_NUDGE_DAYS);
  if (!due || !today) return false;
  return due <= today;
}

function cleanMultilineText(value) {
  return String(value ?? '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map(line => line.replace(/\s+/g, ' ').trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function formatEvidenceList(items = []) {
  return cleanEvidence(items)
    .slice(0, 5)
    .map(item => {
      const label = item.label || item.url || item.type;
      return item.url ? `- ${label}: ${item.url}` : `- ${label}${item.note ? `: ${item.note}` : ''}`;
    })
    .join('\n');
}

function buildResearchedDefenseAnswers(raw = {}) {
  const keywords = cleanArray(raw.research_keywords).slice(0, 6);
  const methods = cleanArray(raw.methods).slice(0, 5);
  const vectors = cleanArray(raw.transfer_vectors).slice(0, 4);
  const facilities = cleanArray(raw.facilities).slice(0, 4);
  const outreach = cleanMultilineText(raw.outreach_angle);
  const uncertainty = cleanMultilineText(raw.uncertainty_notes);
  const enrichment = getDefenseSheetEnrichment(raw.id);
  const evidenceList = formatEvidenceList(raw.evidence);
  const hiringNotes = cleanEvidence(raw.hiring_signals)
    .slice(0, 3)
    .map(item => item.note || item.label)
    .filter(Boolean)
    .join('; ');

  const professorWork = [
    raw.lab ? `${cleanText(raw.name || 'This contact')} works in ${cleanText(raw.lab)}${raw.department ? ` (${cleanText(raw.department)})` : ''}.` : '',
    cleanMultilineText(raw.current_focus) ? `Current work: ${cleanMultilineText(raw.current_focus)}` : '',
    keywords.length ? `Research focus: ${keywords.join(', ')}.` : '',
    methods.length ? `Methods and tools: ${methods.join(', ')}.` : '',
    cleanMultilineText(raw.fit_rationale),
  ].filter(Boolean).join('\n\n');

  const researchInterests = cleanMultilineText(raw.research_interests_summary)
    || enrichment?.research_interests
    || [
      'What we researched (career-ops deep research):',
      raw.source_report ? `Report: ${cleanText(raw.source_report)}` : '',
      evidenceList ? `Primary sources checked:\n${evidenceList}` : '',
      '',
      'What this person works on:',
      raw.name && raw.title ? `${cleanText(raw.name)}, ${cleanText(raw.title)}` : cleanText(raw.name),
      raw.lab ? `Lab/group: ${cleanText(raw.lab)}` : '',
      keywords.length ? `Research interests: ${keywords.join(', ')}.` : '',
      methods.length ? `Methods/approach: ${methods.join(', ')}.` : '',
      '',
      cleanMultilineText(raw.fit_rationale),
    ].filter(Boolean).join('\n');

  const recentRaw = cleanMultilineText(raw.recent_publication);
  const recentLooksReal = recentRaw
    && !/^no specific recent publication/i.test(recentRaw)
    && !/^verify one recent paper/i.test(recentRaw)
    && (/\b20(2[3-9]|3[0-9])\b/.test(recentRaw) || /https?:\/\//i.test(recentRaw) || / — /.test(recentRaw));
  const currentFocus = cleanMultilineText(raw.current_focus);
  const recentPublication = recentLooksReal
    ? recentRaw
    : (enrichment?.recent_publication || [
      currentFocus ? `Current focus (profile/lab): ${currentFocus}` : '',
      'No specific recent publication title was extracted for this contact. Current research lines from lab-page / report research, to verify against one recent paper before emailing:',
      methods.length ? methods.map(method => `- ${method}`).join('\n') : '',
      hiringNotes ? `Active programme notes: ${hiringNotes}` : '',
      facilities.length ? `Facilities/machines: ${facilities.join(', ')}.` : '',
      raw.profile_url ? `\nAction: Open ${cleanText(raw.profile_url)} or Google Scholar -> pick one paper from 2023-2026 -> write title + one-sentence takeaway in column 3.` : '\nAction: Find one recent paper on their profile -> write title + one-sentence takeaway in column 3.',
    ].filter(Boolean).join('\n'));

  const hookPlain = outreach
    ? [
      `Your outreach hook: "${outreach}"`,
      '',
      'In plain English: you are connecting your real diagnostics, vacuum, DAQ, or test-engineering experience to a problem their lab actually works on. You are not claiming you already solved their exact research question.',
      vectors.length ? `Bridge skills to mention honestly: ${vectors.join(', ')}.` : '',
    ].filter(Boolean).join('\n')
    : '';

  const honestMeeting = [
    'If asked what you bring, stay concrete and verifiable:',
    '- LVACCS 1300V hollow-cathode plasma-source workflow, Python/PyVISA ignition control, and DAQ synchronization.',
    '- High-voltage operations, detector calibration, FPGA readout, and ESA/CEM-style charged-particle measurement work.',
    vectors.length ? `- Closest overlap with their lab: ${vectors.join(', ')}.` : '',
    facilities.length ? `- Their facilities (${facilities.join(', ')}) need reliable experimental execution; that is the part you can defend.` : '',
    'Say you want to learn their bottleneck, not that you already mastered their subfield.',
  ].filter(Boolean).join('\n');

  const riskySentence = [
    uncertainty ? `Uncertainty to verify first: ${uncertainty}` : '',
    outreach
      ? [
        'Review this line before sending:',
        `"${outreach}"`,
        '',
        'Safer pattern: "I came across your work on [topic]. From my diagnostics and test-engineering background, I would like to understand how [one bottleneck] is handled in your lab."',
        'Avoid: "I have studied your work extensively" unless you actually read multiple primary sources.',
      ].join('\n')
      : '',
  ].filter(Boolean).join('\n\n');

  return {
    professor_work: professorWork,
    research_interests: researchInterests,
    recent_publication: recentPublication,
    hook_plain_english: hookPlain,
    honest_meeting_answer: honestMeeting,
    risky_sentence: riskySentence,
  };
}

function normalizeDefenseSheet(raw = {}, prospect = {}) {
  const merged = { ...prospect, ...raw };
  const researchedDefaults = buildResearchedDefenseAnswers(merged);
  const incomingRows = Array.isArray(raw.defense_sheet) ? raw.defense_sheet : [];
  const incomingById = new Map(
    incomingRows
      .map(row => [cleanText(row?.id || row?.question), row])
      .filter(([id]) => id)
  );
  return DEFENSE_SHEET_QUESTIONS.map(({ id, question }) => {
    const existing = incomingById.get(id) || incomingRows.find(row => cleanText(row?.question) === question) || {};
    return {
      id,
      question,
      // Researched answers are derived data. Always rebuild them from the current
      // prospect; only the user's typed response is durable state.
      researched_answer: cleanMultilineText(researchedDefaults[id] || ''),
      user_response: cleanMultilineText(existing.user_response || ''),
    };
  });
}

function cleanArray(value = []) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(cleanText).filter(Boolean))];
}

function cleanEvidence(value = []) {
  if (!Array.isArray(value)) return [];
  return value.map(item => ({
    type: cleanText(item?.type || 'source'),
    label: cleanText(item?.label),
    url: cleanText(item?.url),
    date: cleanText(item?.date),
    note: cleanText(item?.note),
  })).filter(item => item.url || item.note || item.label);
}

function cleanObject(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function prospectIdentityKeys(prospect = {}) {
  return [
    cleanText(prospect.id),
    cleanText(prospect.contact_email),
    cleanText(prospect.profile_url),
  ].filter(Boolean);
}

function defenseSheetWithUserResponses(incoming = [], existing = []) {
  const existingById = new Map(
    existing
      .map(row => [cleanText(row?.id || row?.question), row])
      .filter(([id]) => id)
  );
  return incoming.map(row => {
    const existingRow = existingById.get(cleanText(row.id || row.question));
    if (!existingRow?.user_response) return row;
    return {
      ...row,
      user_response: existingRow.user_response,
    };
  });
}

function scoreTier(score) {
  const numeric = Number(score);
  if (Number.isNaN(numeric)) return 'D';
  if (numeric >= 4.0) return 'A';
  if (numeric >= 3.0) return 'B';
  if (numeric >= 2.0) return 'C';
  return 'D';
}

function normalizeStatus(value, { strict = false } = {}) {
  let status = cleanText(value || 'not_contacted').toLowerCase();
  // Legacy single "responded" → positive (kanban entry path).
  if (status === 'responded') status = 'responded_positive';
  // Legacy manual "follow_up" → Contacted; new explicit status is followed_up.
  if (status === 'follow_up') status = 'contacted';
  if (ALLOWED_STATUSES.has(status)) return status;
  if (strict && status) {
    throw new Error(`invalid research prospect status: ${value}`);
  }
  return 'not_contacted';
}

export function normalizeResearchProspect(raw = {}) {
  const name = cleanText(raw.name);
  const department = cleanText(raw.department || raw.unit);
  const lab = cleanText(raw.lab || raw.group);
  const title = cleanText(raw.title);
  const id = cleanText(raw.id) || slugify(`${name}-${department || lab || title}`);
  const score = Number(raw.score);
  const now = new Date().toISOString();

  return {
    id,
    source: cleanText(raw.source || raw.institution),
    name,
    title,
    unit: cleanText(raw.unit || department),
    department,
    departments: cleanArray(raw.departments?.length ? raw.departments : [department]),
    lab,
    institution: cleanText(raw.institution),
    application_route: cleanText(raw.application_route),
    application_url: cleanText(raw.application_url),
    role_type: cleanText(raw.role_type || 'faculty_or_research_staff'),
    campus: cleanText(raw.campus || 'Ann Arbor'),
    profile_url: cleanText(raw.profile_url),
    lab_url: cleanText(raw.lab_url),
    linkedin_url: cleanText(raw.linkedin_url),
    contact_email: cleanText(raw.contact_email),
    contact_page: cleanText(raw.contact_page || raw.profile_url || raw.lab_url),
    phone: cleanText(raw.phone),
    research_keywords: cleanArray(raw.research_keywords),
    methods: cleanArray(raw.methods),
    facilities: cleanArray(raw.facilities),
    transfer_vectors: cleanArray(raw.transfer_vectors),
    hiring_signals: cleanEvidence(raw.hiring_signals),
    evidence: cleanEvidence(raw.evidence),
    score: Number.isNaN(score) ? 0 : Math.max(0, Math.min(5, score)),
    tier: cleanText(raw.tier || scoreTier(score)),
    fit_rationale: cleanText(raw.fit_rationale),
    outreach_angle: cleanText(raw.outreach_angle),
    likely_route: cleanText(raw.likely_route),
    opt_h1b_notes: cleanText(raw.opt_h1b_notes),
    uncertainty_notes: cleanText(raw.uncertainty_notes),
    research_interests_summary: cleanMultilineText(raw.research_interests_summary),
    recent_publication: cleanMultilineText(raw.recent_publication),
    priority: cleanText(raw.priority || raw.tier || scoreTier(score)),
    status: normalizeStatus(raw.status),
    last_contacted: cleanText(raw.last_contacted),
    last_followed_up: cleanText(raw.last_followed_up),
    follow_up_date: cleanText(raw.follow_up_date),
    notes: cleanText(raw.notes),
    outreach: normalizeOutreach(raw.outreach),
    source_report: cleanText(raw.source_report || defaultSourceReport(raw)),
    first_seen: cleanText(raw.first_seen || raw.created_at || now),
    last_updated: cleanText(raw.last_updated || now),
    defense_sheet: normalizeDefenseSheet(raw, raw),
    provider: cleanText(raw.provider),
    external_id: cleanText(raw.external_id),
    opportunity_status: cleanText(raw.opportunity_status),
    liveness: cleanText(raw.liveness),
    liveness_reason: cleanText(raw.liveness_reason),
    deadline_text: cleanText(raw.deadline_text),
    deadline_utc: cleanText(raw.deadline_utc),
    country: cleanText(raw.country),
    research_fields: cleanArray(raw.research_fields),
    outreach_tier: cleanText(raw.outreach_tier),
    design_heavy: Boolean(raw.design_heavy),
    role_note: cleanText(raw.role_note),
    plasma_context: cleanText(raw.plasma_context),
    plasma_context_note: cleanText(raw.plasma_context_note),
    current_focus: cleanMultilineText(raw.current_focus),
    manufacturing_fit_primary: cleanText(raw.manufacturing_fit_primary),
    manufacturing_fit_secondary: cleanText(raw.manufacturing_fit_secondary),
    laser_or_optical_flag: Boolean(raw.laser_or_optical_flag),
    lpbf_am_flag: Boolean(raw.lpbf_am_flag),
    process_sensing_flag: Boolean(raw.process_sensing_flag),
    sheet_metal_or_forming_flag: Boolean(raw.sheet_metal_or_forming_flag),
    academic_level: cleanText(raw.academic_level),
    researcher_profile: cleanText(raw.researcher_profile),
    sector: cleanText(raw.sector),
    funding_programme: cleanText(raw.funding_programme),
    language: cleanText(raw.language),
    translated_title: cleanText(raw.translated_title),
    translated_summary: cleanText(raw.translated_summary),
    translation_cache_key: cleanText(raw.translation_cache_key),
    score_band: cleanText(raw.score_band),
    score_breakdown: cleanObject(raw.score_breakdown),
    score_audit: cleanObject(raw.score_audit),
    tier_cap: cleanText(raw.tier_cap),
    cap_reasons: cleanArray(raw.cap_reasons),
    daily_work_type: cleanText(raw.daily_work_type),
    verified_overlap: cleanArray(raw.verified_overlap),
    missing_evidence: cleanArray(raw.missing_evidence),
    area_assessments: cleanObject(raw.area_assessments),
    risk_flags: cleanArray(raw.risk_flags),
    needs_deep_research: Boolean(raw.needs_deep_research),
  };
}

function resolveSourceId(filePathOrOptions, filePath) {
  if (typeof filePathOrOptions === 'object') {
    return sourceIdFromOptions(filePathOrOptions) || 'umich';
  }
  return sourceIdFromCanonicalPath(filePath);
}

/** Temp/test files must not read or write the shared research-prospect-user-state.json. */
function usesPersistentUserState(filePath = '') {
  const normalized = String(filePath || '').replace(/\\/g, '/').toLowerCase();
  const careerData = CAREER_DATA_DIR.replace(/\\/g, '/').toLowerCase();
  const dashboardData = DASHBOARD_DATA_DIR.replace(/\\/g, '/').toLowerCase();
  return normalized.startsWith(`${careerData}/`) || normalized.startsWith(`${dashboardData}/`);
}

export function readResearchProspects(filePathOrOptions = CANONICAL_RESEARCH_PROSPECTS_FILE) {
  const filePath = filePathFromOptions(filePathOrOptions);
  const sourceId = resolveSourceId(filePathOrOptions, filePath);
  const overlayFile = overlayUserStateFile(filePath, filePathOrOptions);
  const empty = emptyStore(defaultScope(filePathOrOptions));
  const applyState = (store) => (
    overlayFile ? applyUserStateToStore(store, sourceId, overlayFile) : store
  );
  const mtime = fileMtimeMs(filePath);
  const userMtime = overlayFile ? fileMtimeMs(overlayFile) : 0;
  const cached = researchProspectReadCache.get(cacheKeyForProspects(filePath));
  if (cached && cached.mtime === mtime && cached.userMtime === userMtime && cached.overlayFile === overlayFile) {
    return cached.store;
  }
  if (!existsSync(filePath)) {
    const applied = applyState(empty);
    rememberResearchProspects(filePath, applied, overlayFile);
    return applied;
  }
  const parsed = JSON.parse(readFileSync(filePath, 'utf-8'));
  const prospects = Array.isArray(parsed.prospects)
    ? parsed.prospects.map(normalizeResearchProspect)
    : [];
  const applied = applyState({
    ...empty,
    ...parsed,
    version: 1,
    prospects,
  });
  rememberResearchProspects(filePath, applied, overlayFile);
  return applied;
}

export function writeResearchProspects(
  store,
  filePathOrOptions = CANONICAL_RESEARCH_PROSPECTS_FILE,
  writeOptions = {},
) {
  const filePath = filePathFromOptions(filePathOrOptions);
  const sourceId = resolveSourceId(filePathOrOptions, filePath);
  const existingStateByKey = new Map();
  if (shouldPreserveUserState(filePathOrOptions) && existsSync(filePath)) {
    const existingStore = writeOptions.existingStore && Array.isArray(writeOptions.existingStore.prospects)
      ? writeOptions.existingStore
      : readResearchProspects(filePathOrOptions);
    for (const prospect of existingStore.prospects || []) {
      for (const key of prospectIdentityKeys(prospect)) {
        existingStateByKey.set(key, prospect);
      }
    }
  }
  const overlayFile = overlayUserStateFile(filePath, filePathOrOptions);
  const persistUserState = Boolean(overlayFile);
  const prospects = Array.isArray(store?.prospects)
    ? store.prospects.map(prospect => {
      const existing = prospectIdentityKeys(prospect)
        .map(key => existingStateByKey.get(key))
        .find(Boolean);
      if (!persistUserState) {
        return existing
          ? {
            ...prospect,
            status: existing.status,
            ...Object.fromEntries(
              USER_STATE_FIELDS
                .filter(field => field !== 'status' && existing[field])
                .map(field => [field, existing[field]]),
            ),
            defense_sheet: Array.isArray(prospect.defense_sheet)
              ? defenseSheetWithUserResponses(prospect.defense_sheet, existing.defense_sheet)
              : prospect.defense_sheet,
          }
          : prospect;
      }
      if (!existing) return applyUserStateToProspect(prospect, sourceId, overlayFile);
      const preserved = { status: existing.status };
      for (const field of USER_STATE_FIELDS) {
        if (field === 'status') continue;
        if (field === 'outreach') {
          if (existing.outreach && typeof existing.outreach === 'object') preserved.outreach = existing.outreach;
          continue;
        }
        if (existing[field]) preserved[field] = existing[field];
      }
      return applyUserStateToProspect({
        ...prospect,
        ...preserved,
        defense_sheet: Array.isArray(prospect.defense_sheet)
          ? defenseSheetWithUserResponses(prospect.defense_sheet, existing.defense_sheet)
          : prospect.defense_sheet,
      }, sourceId, overlayFile);
    })
    : [];
  const next = {
    ...emptyStore(defaultScope(filePathOrOptions)),
    ...store,
    version: 1,
    generated_at: new Date().toISOString(),
    prospects: prospects.map(prospect => normalizeResearchProspect(prospect)),
  };
  atomicWrite(filePath, `${JSON.stringify(next, null, 2)}\n`);
  rememberResearchProspects(filePath, next, overlayFile);
  return next;
}

export function findResearchProspect(id, storeOrOptions = readResearchProspects()) {
  const store = Array.isArray(storeOrOptions?.prospects) ? storeOrOptions : readResearchProspects(storeOrOptions);
  return store.prospects.find(prospect =>
    prospect.id === id ||
    (prospect.contact_email && prospect.contact_email === id) ||
    (prospect.profile_url && prospect.profile_url === id)
  ) || null;
}

export function upsertResearchProspect(raw, filePathOrOptions = CANONICAL_RESEARCH_PROSPECTS_FILE) {
  const store = readResearchProspects(filePathOrOptions);
  const incoming = normalizeResearchProspect(raw);
  if (!incoming.name || !incoming.department) {
    throw new Error('name and department are required');
  }

  const index = store.prospects.findIndex(prospect =>
    prospect.id === incoming.id ||
    (incoming.contact_email && prospect.contact_email === incoming.contact_email) ||
    (incoming.profile_url && prospect.profile_url === incoming.profile_url)
  );

  if (index >= 0) {
    store.prospects[index] = normalizeResearchProspect({
      ...store.prospects[index],
      ...incoming,
      evidence: [...(store.prospects[index].evidence || []), ...(incoming.evidence || [])],
      hiring_signals: [...(store.prospects[index].hiring_signals || []), ...(incoming.hiring_signals || [])],
      first_seen: store.prospects[index].first_seen || incoming.first_seen,
      last_updated: new Date().toISOString(),
    });
  } else {
    store.prospects.push(incoming);
  }

  store.prospects.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  return writeResearchProspects(store, filePathOrOptions);
}

export function patchResearchProspect(id, updates = {}, filePathOrOptions = CANONICAL_RESEARCH_PROSPECTS_FILE) {
  const store = readResearchProspects(filePathOrOptions);
  const index = store.prospects.findIndex(prospect => prospect.id === id || prospect.profile_url === id);
  if (index < 0) throw new Error(`research prospect not found: ${id}`);

  const current = store.prospects[index];
  const semanticUpdates = { ...updates };
  const nextStatus = updates.status === undefined
    ? normalizeStatus(current.status)
    : normalizeStatus(updates.status, { strict: true });
  if (updates.status !== undefined) semanticUpdates.status = nextStatus;
  if (nextStatus === 'contacted') {
    const contactDay = updates.last_contacted !== undefined
      ? cleanText(updates.last_contacted) || easternToday()
      : (current.last_contacted || easternToday());
    if (updates.last_contacted === undefined) {
      semanticUpdates.last_contacted = contactDay;
    }
    // Start / refresh the silence timer (7 days) when entering Contacted.
    if (updates.follow_up_date === undefined) {
      const priorStatus = normalizeStatus(current.status);
      if (priorStatus !== 'contacted' || !current.follow_up_date) {
        semanticUpdates.follow_up_date = addDaysYmd(contactDay, SILENCE_NUDGE_DAYS);
      }
    }
  }
  if (nextStatus === 'followed_up') {
    if (updates.last_followed_up === undefined) {
      semanticUpdates.last_followed_up = easternToday();
    }
    // Follow-up mail sent — leave the silence-nudge timer.
    if (updates.follow_up_date === undefined) {
      semanticUpdates.follow_up_date = '';
    }
  }
  if (['not_contacted', 'draft_ready', 'archived', 'responded_negative'].includes(nextStatus)) {
    if (updates.last_contacted === undefined && ['not_contacted', 'draft_ready', 'archived'].includes(nextStatus)) {
      semanticUpdates.last_contacted = '';
    }
    if (updates.last_followed_up === undefined && ['not_contacted', 'draft_ready', 'archived'].includes(nextStatus)) {
      semanticUpdates.last_followed_up = '';
    }
    if (updates.follow_up_date === undefined && ['not_contacted', 'draft_ready', 'archived'].includes(nextStatus)) {
      semanticUpdates.follow_up_date = '';
    }
  }

  const outreachPatch = applyOutreachSemantics({
    status: nextStatus,
    previousStatus: current.status,
    currentOutreach: current.outreach,
    currentFollowUpDate: current.follow_up_date,
    outreachUpdate: updates.outreach,
    followUpDateUpdate: updates.follow_up_date,
    today: easternToday(),
  });
  semanticUpdates.outreach = outreachPatch.outreach;
  if (updates.follow_up_date !== undefined) {
    semanticUpdates.follow_up_date = outreachPatch.follow_up_date;
  }

  const nextRaw = {
    ...current,
    ...semanticUpdates,
    evidence: semanticUpdates.evidence === undefined
      ? current.evidence
      : [...(current.evidence || []), ...(semanticUpdates.evidence || [])],
    hiring_signals: semanticUpdates.hiring_signals === undefined
      ? current.hiring_signals
      : [...(current.hiring_signals || []), ...(semanticUpdates.hiring_signals || [])],
    last_updated: new Date().toISOString(),
  };

  for (const [key, value] of Object.entries(semanticUpdates)) {
    if (value === null && key !== 'outreach') delete nextRaw[key];
  }

  store.prospects[index] = normalizeResearchProspect(nextRaw);
  const filePath = filePathFromOptions(filePathOrOptions);
  const sourceId = resolveSourceId(filePathOrOptions, filePath);
  const prospect = store.prospects[index];
  const overlayFile = overlayUserStateFile(filePath, filePathOrOptions);
  if (overlayFile) {
    patchResearchUserState(sourceId, prospect.id, {
      status: prospect.status,
      last_contacted: prospect.last_contacted,
      last_followed_up: prospect.last_followed_up,
      follow_up_date: prospect.follow_up_date,
      notes: prospect.notes,
      outreach: prospect.outreach,
    }, overlayFile);
    if (isUserStateOnlyPatch(updates)) {
      rememberResearchProspects(filePath, store, overlayFile);
      return { store, prospect, wrote_canonical: false };
    }
  }
  const nextStore = writeResearchProspects(store, filePathOrOptions, { existingStore: store });
  return {
    store: nextStore,
    prospect: nextStore.prospects[index],
    wrote_canonical: true,
  };
}

export function syncResearchProspectsToDashboard({
  institution = 'umich',
  source = '',
  sourcePath = null,
  outputPath = null,
} = {}) {
  const config = researchProspectConfig(source || institution);
  sourcePath = sourcePath || config.canonicalFile;
  outputPath = outputPath || config.dashboardFile;
  const store = readResearchProspects(sourcePath);
  const tierSummary = store.prospects.reduce((acc, prospect) => {
    acc[prospect.tier] = (acc[prospect.tier] || 0) + 1;
    return acc;
  }, {});
  const methodSummary = store.prospects.reduce((acc, prospect) => {
    for (const method of prospect.transfer_vectors || []) {
      acc[method] = (acc[method] || 0) + 1;
    }
    return acc;
  }, {});

  const output = {
    ...store,
    generated_at: new Date().toISOString(),
    source: sourcePath,
    total: store.prospects.length,
    count: store.prospects.length,
    prospects: store.prospects,
    tier_summary: tierSummary,
    method_summary: methodSummary,
  };
  atomicWrite(outputPath, `${JSON.stringify(output, null, 2)}\n`);
  return output;
}
