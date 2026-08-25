/**
 * Compact card-list projections for dashboard feed tabs.
 * Full records stay on disk and on GET /api/.../:id.
 */

const FIT_CHARS = 280;
const SUMMARY_CHARS = 400;
const ANGLE_CHARS = 220;
const WORK_CHARS = 220;

function clip(value, max) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  if (text.length <= max) return text;
  return `${text.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

function pickPathMap(value = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === 'string' && entry.trim()) out[key] = entry.trim();
  }
  return out;
}

function compactScoreBreakdown(breakdown = {}) {
  if (!breakdown || typeof breakdown !== 'object' || Array.isArray(breakdown)) return {};
  const keys = [
    'strong_matches',
    'adjacent_matches',
    'physical_hardware_anchors',
    'title_core_matches',
    'title_strong_matches',
    'description_core_matches',
    'description_strong_matches',
    'space_aero_matches',
    'nuclear_plasma_matches',
    'protected_domain_matches',
  ];
  const out = {};
  for (const key of keys) {
    if (Array.isArray(breakdown[key]) && breakdown[key].length) out[key] = breakdown[key];
  }
  return out;
}

function requestView(req) {
  try {
    const fromQuery = req?.query?.view;
    if (fromQuery != null && fromQuery !== '') return String(fromQuery);
    const url = new URL(req?.url || '/', 'http://127.0.0.1');
    return url.searchParams.get('view') || '';
  } catch {
    return '';
  }
}

export function requestWantsFullView(req) {
  return String(requestView(req)).toLowerCase() === 'full';
}

export function requestWantsListView(req) {
  const view = String(requestView(req)).toLowerCase();
  if (view === 'full') return false;
  if (view === 'list') return true;
  return true;
}

export function requestPage(req) {
  try {
    const url = new URL(req?.url || '/', 'http://127.0.0.1');
    const queryLimit = req?.query?.limit ?? url.searchParams.get('limit');
    const queryOffset = req?.query?.offset ?? url.searchParams.get('offset');
    const limit = queryLimit == null || queryLimit === '' ? null : Math.max(0, Number(queryLimit));
    const offset = queryOffset == null || queryOffset === '' ? 0 : Math.max(0, Number(queryOffset));
    return {
      limit: Number.isFinite(limit) ? limit : null,
      offset: Number.isFinite(offset) ? offset : 0,
    };
  } catch {
    return { limit: null, offset: 0 };
  }
}

export function pageCollection(items = [], { limit = null, offset = 0 } = {}) {
  const list = Array.isArray(items) ? items : [];
  if (limit == null) {
    return { items: list, total: list.length, limit: null, offset: 0 };
  }
  const sliced = list.slice(offset, offset + limit);
  return { items: sliced, total: list.length, limit, offset };
}

export function maybeProjectFeed(req, store, projectFn) {
  const projected = requestWantsFullView(req) ? store : projectFn(store);
  const page = requestPage(req);
  if (page.limit == null) return projected;
  const key = Array.isArray(projected?.opportunities)
    ? 'opportunities'
    : Array.isArray(projected?.prospects)
      ? 'prospects'
      : Array.isArray(projected?.jobs)
        ? 'jobs'
        : '';
  if (!key) return projected;
  const paged = pageCollection(projected[key], page);
  return {
    ...projected,
    [key]: paged.items,
    view: projected.view || 'list',
    page: {
      limit: paged.limit,
      offset: paged.offset,
      total: paged.total,
    },
  };
}

export function projectEuraxessListItem(item = {}) {
  const artifacts = pickPathMap(item.artifacts);
  const resources = pickPathMap(item.resources);
  return {
    id: item.id || '',
    source: item.source || 'euraxess',
    url: item.url || '',
    title: item.title || '',
    institution: item.institution || '',
    country: item.country || '',
    summary: clip(item.summary, SUMMARY_CHARS),
    posted_at: item.posted_at || '',
    deadline_text: item.deadline_text || '',
    deadline_utc: item.deadline_utc || '',
    status: item.status || '',
    liveness: item.liveness || '',
    liveness_reason: item.liveness_reason || '',
    score: Number(item.score || 0),
    score_band: item.score_band || '',
    visible: Boolean(item.visible),
    archived: Boolean(item.archived),
    fit_rationale: clip(item.fit_rationale, FIT_CHARS),
    risk_flags: Array.isArray(item.risk_flags) ? item.risk_flags : [],
    score_breakdown: compactScoreBreakdown(item.score_breakdown),
    research_fields: Array.isArray(item.research_fields) ? item.research_fields : [],
    academic_level: item.academic_level || '',
    researcher_profile: item.researcher_profile || '',
    worker_status: item.worker_status || '',
    research_report: item.research_report || artifacts.research_report || resources.research_report || '',
    resources,
    artifacts,
    automation: {
      worker_status: item.automation?.worker_status || item.worker_status || '',
      current_stage: item.automation?.current_stage || '',
      last_error: item.automation?.last_error || item.last_error || '',
    },
    execution: {
      stage: item.execution?.stage || null,
      ready_checked: Boolean(item.execution?.ready_checked),
      application_num: item.execution?.application_num ?? null,
      applied_at: item.execution?.applied_at || '',
    },
    decision: {
      archive_reason: item.decision?.archive_reason || item.archive_reason || '',
    },
    jobs_to_consider_id: item.jobs_to_consider_id || '',
    needs_research: Boolean(item.needs_research),
    needs_application_pack: Boolean(item.needs_application_pack),
  };
}

export function projectEuraxessListStore(store = {}) {
  return {
    version: store.version || 1,
    generated_at: store.generated_at || '',
    scope: store.scope || '',
    scan_summary: store.scan_summary || {},
    view: 'list',
    opportunities: Array.isArray(store.opportunities)
      ? store.opportunities.map(projectEuraxessListItem)
      : [],
  };
}

export function projectUmichListItem(item = {}) {
  return {
    id: item.id || '',
    source: item.source || 'umich_careers',
    job_id: item.job_id || '',
    url: item.url || '',
    apply_url: item.apply_url || '',
    title: item.title || '',
    working_title: item.working_title || '',
    job_title: item.job_title || '',
    department: item.department || '',
    organizational_group: item.organizational_group || '',
    career_interest: item.career_interest || '',
    work_location: item.work_location || '',
    city_location: item.city_location || '',
    modes_of_work: item.modes_of_work || '',
    employment_type: item.employment_type || '',
    regular_temporary: item.regular_temporary || '',
    salary_text: item.salary_text || '',
    date_posted: item.date_posted || '',
    posting_end_date: item.posting_end_date || '',
    posting_begin_end_text: item.posting_begin_end_text || '',
    description: '',
    status: item.status || '',
    closed_reason: item.closed_reason || '',
    archived: Boolean(item.archived),
    archive_reason: item.archive_reason || '',
    score: Number(item.score || 0),
    segment: item.segment || '',
    visible: Boolean(item.visible),
    fit_rationale: clip(item.fit_rationale, FIT_CHARS),
    risk_flags: Array.isArray(item.risk_flags) ? item.risk_flags : [],
    score_breakdown: compactScoreBreakdown(item.score_breakdown),
    jobs_to_consider_id: item.jobs_to_consider_id || '',
    applied: Boolean(item.applied),
    applied_at: item.applied_at || '',
    application_num: item.application_num ?? null,
  };
}

export function projectUmichListStore(store = {}) {
  return {
    version: store.version || 1,
    generated_at: store.generated_at || '',
    scope: store.scope || '',
    scan_health: store.scan_health || {},
    view: 'list',
    opportunities: Array.isArray(store.opportunities)
      ? store.opportunities.map(projectUmichListItem)
      : [],
  };
}

export function projectPhdscannerListItem(item = {}) {
  const artifacts = pickPathMap(item.artifacts);
  const resources = pickPathMap(item.resources);
  const sources = Array.isArray(item.sources)
    ? item.sources.map(source => ({
      source: source?.source || '',
      url: source?.url || '',
      external_id: source?.external_id || '',
      provider: source?.provider || '',
    })).filter(source => source.url || source.external_id)
    : [];
  return {
    id: item.id || '',
    source: item.source || 'phdscanner',
    sources,
    alt_urls: Array.isArray(item.alt_urls) ? item.alt_urls : [],
    url: item.url || '',
    title: item.title || '',
    institution: item.institution || '',
    university: item.university || '',
    discipline: item.discipline || '',
    department: item.department || '',
    supervisor: item.supervisor || '',
    fully_funded: Boolean(item.fully_funded),
    minimal_financial_barriers: Boolean(item.minimal_financial_barriers),
    funding_label: item.funding_label || '',
    published_at: item.published_at || '',
    country: item.country || '',
    summary: clip(item.summary, SUMMARY_CHARS),
    posted_at: item.posted_at || '',
    deadline_text: item.deadline_text || '',
    deadline_utc: item.deadline_utc || '',
    status: item.status || '',
    liveness: item.liveness || '',
    score: Number(item.score || 0),
    score_band: item.score_band || '',
    visible: Boolean(item.visible),
    archived: Boolean(item.archived),
    fit_rationale: clip(item.fit_rationale, FIT_CHARS),
    risk_flags: Array.isArray(item.risk_flags) ? item.risk_flags : [],
    score_breakdown: compactScoreBreakdown(item.score_breakdown),
    research_fields: Array.isArray(item.research_fields) ? item.research_fields : [],
    academic_level: item.academic_level || '',
    researcher_profile: item.researcher_profile || '',
    worker_status: item.worker_status || '',
    research_report: item.research_report || artifacts.research_report || resources.research_report || '',
    resources,
    artifacts,
    automation: {
      worker_status: item.automation?.worker_status || item.worker_status || '',
      current_stage: item.automation?.current_stage || '',
      last_error: item.automation?.last_error || item.last_error || '',
    },
    execution: {
      stage: item.execution?.stage || null,
      ready_checked: Boolean(item.execution?.ready_checked),
      application_num: item.execution?.application_num ?? null,
      applied_at: item.execution?.applied_at || '',
    },
    decision: {
      archive_reason: item.decision?.archive_reason || item.archive_reason || '',
    },
    jobs_to_consider_id: item.jobs_to_consider_id || '',
  };
}

export function projectPhdscannerListStore(store = {}) {
  return {
    version: store.version || 1,
    generated_at: store.generated_at || '',
    scope: store.scope || '',
    scan_summary: store.scan_summary || {},
    view: 'list',
    opportunities: Array.isArray(store.opportunities)
      ? store.opportunities.map(projectPhdscannerListItem)
      : [],
  };
}

export function projectResearchListItem(item = {}) {
  const outreach = item.outreach && typeof item.outreach === 'object' && !Array.isArray(item.outreach)
    ? {
      stage: item.outreach.stage || '',
      last_touch_at: item.outreach.last_touch_at || '',
      next_step: clip(item.outreach.next_step, ANGLE_CHARS),
    }
    : item.outreach || null;
  return {
    id: item.id || '',
    source: item.source || '',
    name: item.name || '',
    title: item.title || '',
    unit: item.unit || '',
    department: item.department || '',
    departments: Array.isArray(item.departments) ? item.departments : [],
    lab: item.lab || '',
    institution: item.institution || '',
    application_route: item.application_route || '',
    application_url: item.application_url || '',
    role_type: item.role_type || '',
    campus: item.campus || '',
    profile_url: item.profile_url || '',
    lab_url: item.lab_url || '',
    contact_email: item.contact_email || '',
    research_keywords: Array.isArray(item.research_keywords) ? item.research_keywords : [],
    methods: Array.isArray(item.methods) ? item.methods : [],
    transfer_vectors: Array.isArray(item.transfer_vectors) ? item.transfer_vectors : [],
    hiring_signals: Array.isArray(item.hiring_signals) ? item.hiring_signals.slice(0, 2) : [],
    score: Number(item.score || 0),
    tier: item.tier || '',
    fit_rationale: clip(item.fit_rationale, FIT_CHARS),
    outreach_angle: clip(item.outreach_angle, ANGLE_CHARS),
    likely_route: item.likely_route || '',
    current_focus: clip(item.current_focus, WORK_CHARS),
    research_interests_summary: clip(item.research_interests_summary, WORK_CHARS),
    recent_publication: clip(item.recent_publication, WORK_CHARS),
    status: item.status || '',
    last_contacted: item.last_contacted || '',
    last_followed_up: item.last_followed_up || '',
    follow_up_date: item.follow_up_date || '',
    notes: clip(item.notes, FIT_CHARS),
    outreach,
    research_fields: Array.isArray(item.research_fields) ? item.research_fields : [],
    plasma_context: item.plasma_context || '',
    daily_work_type: item.daily_work_type || '',
    verified_overlap: Array.isArray(item.verified_overlap) ? item.verified_overlap : [],
    cap_reasons: Array.isArray(item.cap_reasons) ? item.cap_reasons : [],
    missing_evidence: Array.isArray(item.missing_evidence) ? item.missing_evidence : [],
    score_breakdown: compactScoreBreakdown(item.score_breakdown),
  };
}

export function projectResearchListStore(store = {}) {
  return {
    version: store.version || 1,
    generated_at: store.generated_at || '',
    scope: store.scope || '',
    view: 'list',
    prospects: Array.isArray(store.prospects)
      ? store.prospects.map(projectResearchListItem)
      : [],
  };
}

export function projectJobsListItem(item = {}) {
  const resources = pickPathMap(item.resources);
  return {
    id: item.id || '',
    url: item.url || '',
    company: item.company || '',
    title: item.title || '',
    location: item.location || '',
    country: item.country || '',
    region: item.region || '',
    status: item.status || '',
    applied: Boolean(item.applied),
    applied_at: item.applied_at || '',
    application_num: item.application_num || null,
    score: item.score || item.scoring?.score || '',
    notes: clip(item.notes, FIT_CHARS),
    resources,
    eligibility: item.eligibility || item.scoring?.eligibility || null,
    scoring: item.scoring?.canonical ? {
      canonical: true,
      score: item.scoring.score,
      eligibility: item.scoring.eligibility,
      confidence: item.scoring.confidence,
      urgency: item.scoring.urgency,
    } : item.scoring || null,
    urgency: item.urgency || item.scoring?.urgency || null,
    confidence: item.confidence || item.scoring?.confidence || '',
    visa: item.visa || null,
    export_control: item.export_control || '',
    eligibility_band: item.eligibility_band || '',
    networking_org_id: item.networking_org_id || '',
    networking_person_ids: Array.isArray(item.networking_person_ids) ? item.networking_person_ids : [],
    networking_research_order_id: item.networking_research_order_id || '',
  };
}

export function projectJobsListStore(store = {}) {
  return {
    version: store.version || 1,
    generated_at: store.generated_at || '',
    view: 'list',
    total: Array.isArray(store.jobs) ? store.jobs.length : 0,
    count: Array.isArray(store.jobs) ? store.jobs.length : 0,
    jobs: Array.isArray(store.jobs) ? store.jobs.map(projectJobsListItem) : [],
  };
}

export function jsonByteLength(value) {
  return Buffer.byteLength(JSON.stringify(value), 'utf-8');
}
