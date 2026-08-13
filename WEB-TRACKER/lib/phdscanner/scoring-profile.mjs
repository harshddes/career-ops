/**
 * PhDScanner fit scoring — same lexicon/thresholds as EURAXESS.
 * Funding flags (fully_funded, minimal_financial_barriers) are NEVER inputs to score.
 * Protected domains (nuclear / detectors / physics / manufacturing / aerospace / …)
 * get a hard visibility floor via lib/protected-domain.mjs.
 */
import {
  applyProtectedDomainFloor,
  matchProtectedDomain,
  postingProtectedDomainText,
} from '../protected-domain.mjs';
import { scoreOpportunity } from '../opportunity-scoring/index.mjs';

export const VISIBLE_THRESHOLD = 2.4;
export const STRONG_THRESHOLD = 3.2;
export const RESEARCH_THRESHOLD = 3.5;
export const PACK_THRESHOLD = 4.0;
export const ARCHIVE_THRESHOLD = 2.4;

const STRONG_POSITIVE = [
  'plasma', 'fusion', 'fission', 'nuclear', 'nuclear security', 'nuclear engineering',
  'diagnostic', 'diagnostics', 'instrumentation', 'detector', 'detectors',
  'detector technology', 'scintillator', 'scintillators', 'scintillation',
  'radiation', 'gamma', 'neutron', 'readout', 'ion optics', 'high voltage', 'daq', 'data acquisition', 'fpga',
  'space plasma', 'spacecraft instrumentation', 'spacecraft', 'space science', 'space',
  'heliophysics', 'astrophysics', 'payload', 'cubesat', 'magnetosphere',
  'calibration', 'particle', 'charged particle', 'mass spectrometry', 'mass spectrometer',
  'magnetic spectrometer', 'spectrometer', 'tof', 'qms', 'icp-ms', 'vacuum',
  'tokamak', 'stellarator', 'neutral beam', 'cern', 'laser-induced plasma', 'lip', 'laser', 'lasers',
  'beamline', 'langmuir', 'accelerator', 'collider',
  'cryogenic', 'cryogenics', 'cryostat', 'cryocooler', 'synchrotron', 'helium liquefaction',
  'micromachining', 'electrolyte jet', 'electrochemical', 'precision engineering',
  'additive manufacturing', 'laser machining', 'surface structuring', 'process monitoring',
  'aerospace', 'aerospace engineering', 'mechanical engineering', 'manufacturing',
];

const ADJACENT_POSITIVE = [
  'electrical engineering', 'electronics', 'control engineering',
  'measurement', 'sensor', 'sensors', 'space systems',
  'physics', 'experimental', 'laboratory', 'optics', 'optical', 'photonics', 'mechatronics',
  'materials engineering', 'industrial engineering',
  'quantum', 'microengineering', 'production engineering',
  'thermal engineering', 'fluid mechanics', 'fluids', 'project engineer',
  'research infrastructure', 'beamline', 'atomic', 'subatomic',
];

const COMPUTATION_DOMINANT = [
  'artificial intelligence', 'machine learning', 'deep learning', 'autonomous laboratory',
  'simulation', 'modeling', 'modelling', 'computational', 'computer science',
  'software development', 'data science', 'digital twin', 'high performance computing',
];

const PHYSICAL_HARDWARE_ANCHORS = new Set([
  'diagnostic', 'diagnostics', 'instrumentation', 'detector', 'detectors', 'detector technology',
  'scintillator', 'scintillators', 'radiation', 'gamma', 'neutron',
  'readout', 'ion optics', 'high voltage', 'daq', 'data acquisition', 'fpga',
  'spacecraft instrumentation', 'payload', 'calibration', 'mass spectrometry',
  'mass spectrometer', 'spectrometer', 'tof', 'qms', 'icp-ms', 'vacuum',
  'tokamak', 'stellarator', 'neutral beam', 'laser-induced plasma', 'laser', 'lasers', 'beamline',
  'langmuir', 'cryogenic', 'cryogenics', 'cryostat', 'cryocooler', 'synchrotron', 'accelerator',
  'micromachining', 'electrolyte jet', 'precision engineering',
  'additive manufacturing', 'laser machining', 'surface structuring', 'process monitoring',
  'nuclear', 'fusion', 'fission', 'aerospace', 'aerospace engineering', 'mechanical engineering', 'manufacturing',
]);

const WEAK_ADJACENT_SINGLES = new Set([
  'data', 'control', 'controls', 'sensor', 'sensors', 'robotics',
  'laboratory', 'experimental', 'measurement', 'simulation', 'modeling', 'modelling',
]);

const ROLE_POSITIVE = [
  'phd', 'doctoral', 'doctorate', 'first stage researcher', 'r1',
  'research support', 'research engineer', 'research associate',
  'project engineer', 'engineer', 'doctoral fellow', 'doctoral student',
];

const ROLE_ARCHIVE = [
  'assistant professor', 'associate professor', 'full professor',
  'tenure-track', 'lecturer', 'faculty position',
  'postdoctoral', 'post-doctoral', 'postdoc',
  'recognised researcher (r2)', 'recognized researcher (r2)',
];

const NEGATIVE = [
  'sales', 'marketing', 'recruitment', 'human resources', 'hr',
  'agriculture', 'nursing', 'sociology',
  'law', 'legal', 'economics', 'literature', 'history',
  'dentistry', 'dental', 'orthodont', 'periodont',
  'cancer', 'oncology', 'microbiology', 'mycology', 'biochemistry',
  'taste receptor', 'plastid', 'mitochondrial inheritance',
  'clinical nursing', 'clinical trial coordinator',
];

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
  if (needle.length <= 4 || WEAK_ADJACENT_SINGLES.has(needle) || ['lip', 'tof', 'qms', 'daq', 'fpga', 'cern', 'r1', 'r2', 'space'].includes(needle)) {
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:[^a-z0-9]|$)`, 'i').test(haystack);
  }
  return haystack.includes(needle);
}

function includesAny(text, terms) {
  const haystack = lower(text);
  return terms.filter(term => termMatches(haystack, term));
}

function unique(items = []) {
  return [...new Set(items.map(cleanText).filter(Boolean))];
}

export function scoreBand(score, { negativeMatches = [], roleArchiveMatches = [] } = {}) {
  if (roleArchiveMatches.length) return 'archive';
  if (negativeMatches.length && score < STRONG_THRESHOLD) return 'archive';
  if (score >= PACK_THRESHOLD) return 'top_priority';
  if (score >= STRONG_THRESHOLD) return 'strong_review';
  if (score >= VISIBLE_THRESHOLD) return 'adjacent_review';
  return 'archive';
}

function filterWeakAdjacent(adjacentMatches = [], { strongMatches = [] } = {}) {
  const hasDomainAnchor = strongMatches.length > 0
    || adjacentMatches.some(term => !WEAK_ADJACENT_SINGLES.has(term));
  return adjacentMatches.filter(term => {
    if (!WEAK_ADJACENT_SINGLES.has(term)) return true;
    return hasDomainAnchor;
  });
}

function roleArchiveMatchesFor(posting = {}, text = '') {
  const title = lower(posting.title);
  const titleHits = unique(includesAny(title, ROLE_ARCHIVE));
  if (titleHits.length) return titleHits;
  return unique(includesAny(text, [
    'assistant professor', 'associate professor', 'full professor', 'tenure-track', 'faculty position',
    'postdoctoral position', 'postdoctoral researcher', 'postdoctoral fellowship', 'post-doctoral fellowship',
    'postdoc:', 'postdoc ',
  ]));
}

/**
 * Score a PhDScanner posting. Funding fields on `posting` are ignored intentionally.
 */
export function scorePhdscannerPosting(posting = {}, now = new Date()) {
  const canonical = scoreOpportunity(posting, { type: 'phd', now });
  return {
    ...canonical,
    score_breakdown: {
      ...canonical.score_breakdown,
      funding_ignored: false,
    },
  };
  /* Legacy implementation retained below as migration reference. */
  const text = [
    posting.title,
    posting.summary,
    posting.description,
    posting.institution,
    posting.university,
    posting.country,
    posting.discipline,
    posting.research_fields,
    posting.academic_level,
    posting.department,
    posting.supervisor,
  ].flat().join(' ');

  const strongMatches = unique(includesAny(text, STRONG_POSITIVE));
  const roleMatches = unique(includesAny(text, ROLE_POSITIVE));
  const roleArchiveMatches = roleArchiveMatchesFor(posting, text);
  const negativeMatches = unique(includesAny(text, NEGATIVE));
  const computationMatches = unique(includesAny(text, COMPUTATION_DOMINANT));
  const adjacentRaw = unique([
    ...includesAny(text, ADJACENT_POSITIVE),
    ...includesAny(text, [...WEAK_ADJACENT_SINGLES]),
  ]);
  const adjacentMatches = filterWeakAdjacent(adjacentRaw, { strongMatches });
  const riskFlags = [];

  let score = 1.8;
  score += Math.min(1.8, strongMatches.length * 0.38);
  score += Math.min(1.0, adjacentMatches.length * 0.2);
  score += Math.min(0.7, roleMatches.length * 0.24);

  if (strongMatches.length && roleMatches.length) score += 0.2;
  if (strongMatches.some(term => ['space', 'space science', 'space plasma', 'spacecraft', 'cern', 'cryogenic', 'cryogenics', 'synchrotron', 'nuclear', 'fusion', 'scintillator', 'radiation'].includes(term))) {
    score += 0.15;
  }
  if (adjacentMatches.some(term => /engineering|manufacturing|nuclear|quantum|cryogenic|synchrotron|project engineer|physics/.test(term))) {
    score += 0.15;
  }

  const deadline = posting.deadline_utc ? new Date(posting.deadline_utc) : null;
  const deadlineValid = deadline && !Number.isNaN(deadline.getTime());
  if (deadlineValid) {
    const days = (deadline.getTime() - now.getTime()) / 86_400_000;
    if (days < 0) {
      score -= 2.2;
      riskFlags.push('deadline_passed');
    } else if (days <= 7) {
      score += 0.25;
      riskFlags.push('deadline_soon');
    } else if (days <= 30) {
      score += 0.15;
    }
  } else {
    score -= 0.1;
    riskFlags.push('missing_deadline');
  }

  if (negativeMatches.length) {
    score -= Math.min(1.8, negativeMatches.length * 0.55);
    riskFlags.push('negative_topic_match');
  }
  if (roleArchiveMatches.length) {
    score = Math.min(score, 1.5);
    riskFlags.push('role_not_targeted');
  }

  const physicalHardwareAnchors = strongMatches.filter(term => PHYSICAL_HARDWARE_ANCHORS.has(term));
  const computationDominant = computationMatches.length >= 2 && physicalHardwareAnchors.length < 2;
  if (computationDominant) {
    score = Math.min(score, 2.9);
    riskFlags.push('computation_dominant_no_hardware_anchor');
  }

  if (!strongMatches.length && !adjacentMatches.length) score -= 0.8;
  score = Math.max(0, Math.min(5, Number(score.toFixed(2))));

  const band = scoreBand(score, { negativeMatches, roleArchiveMatches });
  const visible = band !== 'archive' && !riskFlags.includes('deadline_passed');
  const archived = band === 'archive'
    || riskFlags.includes('deadline_passed')
    || Boolean(roleArchiveMatches.length)
    || Boolean(negativeMatches.length && score < STRONG_THRESHOLD);

  const protectedMatches = matchProtectedDomain(postingProtectedDomainText(posting));
  const base = {
    score,
    score_band: band,
    visible,
    archived,
    needs_deep_research: score >= RESEARCH_THRESHOLD && !riskFlags.includes('deadline_passed') && !roleArchiveMatches.length,
    needs_application_pack: score >= PACK_THRESHOLD && !riskFlags.includes('deadline_passed') && !roleArchiveMatches.length,
    risk_flags: unique(riskFlags),
    score_breakdown: {
      strong_matches: strongMatches,
      adjacent_matches: adjacentMatches,
      role_matches: roleMatches,
      role_archive_matches: roleArchiveMatches,
      negative_matches: negativeMatches,
      computation_matches: computationMatches,
      physical_hardware_anchors: physicalHardwareAnchors,
      tier_cap: computationDominant ? 'C' : '',
      deadline: posting.deadline_utc || '',
      funding_ignored: true,
      protected_domain_matches: protectedMatches,
    },
    fit_rationale: [
      strongMatches.length ? `Strong match: ${strongMatches.slice(0, 5).join(', ')}.` : '',
      adjacentMatches.length ? `Adjacent match: ${adjacentMatches.slice(0, 4).join(', ')}.` : '',
      roleMatches.length ? `Role fit: ${roleMatches.slice(0, 3).join(', ')}.` : '',
      roleArchiveMatches.length ? `Archived role class: ${roleArchiveMatches.slice(0, 3).join(', ')}.` : '',
      negativeMatches.length ? `Penalty: ${negativeMatches.slice(0, 3).join(', ')}.` : '',
      computationDominant ? `Tier C cap: computation/AI dominates without substantial physical hardware (${computationMatches.slice(0, 3).join(', ')}).` : '',
    ].filter(Boolean).join(' '),
  };

  const guarded = applyProtectedDomainFloor(base, {
    protectedMatches,
    roleArchiveMatches,
    visibleThreshold: VISIBLE_THRESHOLD,
    scoreBandFn: scoreBand,
  });
  return {
    ...guarded,
    needs_deep_research: guarded.score >= RESEARCH_THRESHOLD
      && !guarded.risk_flags.includes('deadline_passed')
      && !roleArchiveMatches.length,
    needs_application_pack: guarded.score >= PACK_THRESHOLD
      && !guarded.risk_flags.includes('deadline_passed')
      && !roleArchiveMatches.length,
  };
}
