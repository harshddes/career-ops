/**
 * Protected research domains — HARD visibility floor across EURAXESS + PhD board.
 *
 * Rule: if a posting matches these fields, it MUST stay visible and at/above
 * VISIBLE_THRESHOLD unless the application deadline has truly passed (or the
 * title is a hard wrong-role class: faculty / postdoc).
 *
 * Missing deadline is NOT grounds to archive a protected posting.
 */

export const PROTECTED_DOMAIN_TERMS = [
  // Nuclear / fission / fusion / plasma
  'nuclear', 'nuclear science', 'nuclear engineering', 'nuclear security',
  'nuclear fission', 'fission', 'nuclear fusion', 'fusion', 'tokamak', 'stellarator',
  'nuclear plasma', 'plasma', 'plasma physics', 'inertial confinement',
  // Radiation / detectors / scintillators / gamma
  'radiation', 'radiation detector', 'radiation detectors', 'detector', 'detectors',
  'scintillator', 'scintillators', 'scintillation', 'gamma', 'gamma-ray', 'gamma ray',
  'x-ray', 'xray', 'radioluminescence', 'dosimetry', 'neutron', 'radioisotope',
  // Lasers / optics / particles / atomic / subatomic / CERN-class
  'laser', 'lasers', 'laser-induced', 'optics', 'optical', 'photonics',
  'particle', 'particles', 'particle physics', 'particle analyzer', 'particle analysis',
  'charged particle', 'subatomic', 'sub-atomic', 'atomic physics', 'atomic',
  'hadron', 'collider', 'cern', 'beamline', 'synchrotron', 'accelerator',
  'mass spectrometry', 'mass spectrometer', 'spectrometer',
  // Manufacturing / mechanical / aerospace / space
  'manufacturing', 'additive manufacturing', 'micromachining', 'precision engineering',
  'mechanical engineering', 'mechanical', 'mechatronics',
  'aerospace', 'aerospace engineering', 'space engineering', 'spacecraft',
  'space science', 'space systems', 'heliophysics', 'astrophysics', 'cubesat',
  // Broad physics (user-mandated)
  'physics', 'experimental physics', 'applied physics',
  // Cryogenics / instrumentation anchors often co-travel with the above
  'cryogenic', 'cryogenics', 'instrumentation', 'vacuum',
];

/** Short/ambiguous terms that need token boundaries. */
const PROTECTED_BOUNDARY_TERMS = new Set([
  'cern', 'laser', 'lasers', 'gamma', 'x-ray', 'xray', 'optics', 'atomic',
  'plasma', 'fusion', 'fission', 'neutron', 'physics', 'space', 'particle',
  'particles', 'detector', 'detectors', 'nuclear', 'vacuum', 'tof',
]);

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function lower(value) {
  return cleanText(value).toLowerCase();
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function termMatches(haystack, term) {
  const needle = lower(term);
  if (!needle) return false;
  if (needle.length <= 5 || PROTECTED_BOUNDARY_TERMS.has(needle)) {
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:[^a-z0-9]|$)`, 'i').test(haystack);
  }
  return haystack.includes(needle);
}

export function matchProtectedDomain(text = '') {
  const haystack = lower(text);
  const hits = [];
  for (const term of PROTECTED_DOMAIN_TERMS) {
    if (termMatches(haystack, term)) hits.push(term);
  }
  return [...new Set(hits)];
}

export function postingProtectedDomainText(posting = {}) {
  return [
    posting.title,
    posting.working_title,
    posting.job_title,
    posting.summary,
    posting.description,
    posting.institution,
    posting.university,
    posting.country,
    posting.discipline,
    posting.department,
    posting.career_interest,
    posting.organizational_group,
    posting.research_fields,
    posting.academic_level,
    posting.researcher_profile,
    posting.sector,
    posting.funding_programme,
    posting.supervisor,
  ].flat().join(' ');
}

/**
 * Apply hard floor after base scoring.
 * @param {object} scoring - mutable scoring result
 * @param {object} opts
 * @param {string[]} opts.protectedMatches
 * @param {string[]} opts.roleArchiveMatches
 * @param {number} opts.visibleThreshold
 * @param {function} opts.scoreBandFn - (score, meta) => band
 */
export function applyProtectedDomainFloor(scoring = {}, {
  protectedMatches = [],
  roleArchiveMatches = [],
  visibleThreshold = 2.4,
  scoreBandFn = null,
} = {}) {
  if (!protectedMatches.length) return scoring;

  const riskFlags = [...(scoring.risk_flags || [])];
  const deadlinePassed = riskFlags.includes('deadline_passed');

  // Faculty / postdoc titles remain archived even in protected domains.
  if (roleArchiveMatches.length) {
    if (!riskFlags.includes('protected_domain_wrong_role')) {
      riskFlags.push('protected_domain_wrong_role');
    }
    return {
      ...scoring,
      risk_flags: [...new Set(riskFlags)],
      score_breakdown: {
        ...(scoring.score_breakdown || {}),
        protected_domain_matches: protectedMatches,
        protected_domain_floor_applied: false,
      },
    };
  }

  // Past deadline → archive is allowed (and expected).
  if (deadlinePassed) {
    if (!riskFlags.includes('protected_domain_deadline_passed')) {
      riskFlags.push('protected_domain_deadline_passed');
    }
    return {
      ...scoring,
      archived: true,
      visible: false,
      score_band: 'archive',
      risk_flags: [...new Set(riskFlags)],
      score_breakdown: {
        ...(scoring.score_breakdown || {}),
        protected_domain_matches: protectedMatches,
        protected_domain_floor_applied: false,
        archive_reason: 'deadline_passed',
      },
      fit_rationale: [
        scoring.fit_rationale,
        `Protected domain (${protectedMatches.slice(0, 4).join(', ')}) but deadline passed — archived.`,
      ].filter(Boolean).join(' '),
    };
  }

  // HARD FLOOR: never bury for weak lexicon / missing deadline / soft negatives.
  const flooredScore = Math.max(Number(scoring.score) || 0, visibleThreshold);
  const band = typeof scoreBandFn === 'function'
    ? scoreBandFn(flooredScore, { negativeMatches: [], roleArchiveMatches: [] })
    : (flooredScore >= 4 ? 'top_priority' : flooredScore >= 3.2 ? 'strong_review' : 'adjacent_review');

  riskFlags.push('protected_domain_floor');
  // Missing deadline is informational only for protected posts.
  const cleanedFlags = [...new Set(riskFlags.filter(flag => flag !== 'negative_topic_match'))];

  return {
    ...scoring,
    score: Number(flooredScore.toFixed(2)),
    score_band: band === 'archive' ? 'adjacent_review' : band,
    visible: true,
    archived: false,
    risk_flags: cleanedFlags,
    score_breakdown: {
      ...(scoring.score_breakdown || {}),
      protected_domain_matches: protectedMatches,
      protected_domain_floor_applied: true,
      score_before_protected_floor: scoring.score,
    },
    fit_rationale: [
      scoring.fit_rationale,
      `Protected domain floor: ${protectedMatches.slice(0, 5).join(', ')} — kept visible (deadline not confirmed passed).`,
    ].filter(Boolean).join(' '),
  };
}

/**
 * Dashboard / API guard: refuse archiving protected-domain cards unless
 * deadline truly passed (or force=true for operator override).
 */
export function assertCanArchiveOpportunity(opportunity = {}, { force = false } = {}) {
  if (force) return { allowed: true, reason: 'force' };
  const hits = matchProtectedDomain(postingProtectedDomainText(opportunity));
  if (!hits.length) return { allowed: true, reason: 'not_protected' };

  const deadlineUtc = cleanText(opportunity.deadline_utc || opportunity.posting_end_date);
  const deadline = deadlineUtc ? new Date(/T/.test(deadlineUtc) ? deadlineUtc : `${deadlineUtc}T23:59:59`) : null;
  const deadlinePassed = Boolean(deadline && !Number.isNaN(deadline.getTime()) && deadline.getTime() < Date.now())
    || (opportunity.risk_flags || []).includes('deadline_passed')
    || opportunity.status === 'closed';

  if (deadlinePassed) return { allowed: true, reason: 'deadline_passed', protected_matches: hits };

  return {
    allowed: false,
    reason: 'protected_domain_requires_passed_deadline',
    protected_matches: hits,
    message: `Cannot archive protected-domain posting (${hits.slice(0, 4).join(', ')}) unless the application deadline has passed.`,
  };
}
