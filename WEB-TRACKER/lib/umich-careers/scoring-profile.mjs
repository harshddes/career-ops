/**
 * U-M Careers fit scoring.
 *
 * System-layer engine only — every domain term, weight, threshold, role rule,
 * and exclusion lives in the user-owned `research_targeting.umich_careers`
 * section of config/profile.yml. A safe built-in default keeps the tracker
 * working if that section is missing.
 *
 * Segmentation contract:
 *   apply_now      — direct requested-domain match + plausible role fit
 *   high_relevance — direct domain match but role/eligibility needs review
 *   adjacent       — related engineering/science signal
 *   other          — searchable, never deleted
 *   closed         — posting removed or past its end date
 *
 * Requested-domain matches get a hard visibility floor: soft penalties can
 * never push them into `other`.
 */

import { existsSync, readFileSync, statSync } from 'fs';
import { createRequire } from 'module';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const LIB_DIR = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS_DIR = join(LIB_DIR, '..', '..', '..');
const PROFILE_PATH = join(CAREER_OPS_DIR, 'config', 'profile.yml');

// js-yaml lives in the career-ops root node_modules; resolution walks up from here.
let yaml = null;
try {
  yaml = require('js-yaml');
} catch {
  yaml = null;
}

export const UMICH_SEGMENTS = ['apply_now', 'high_relevance', 'adjacent', 'other', 'closed'];

const DEFAULT_POLICY = {
  policy_version: 'builtin-default',
  thresholds: { apply_now: 4.0, high_relevance: 3.2, adjacent: 2.2 },
  weights: {
    title_core_first: 1.6,
    title_core_extra: 0.4,
    title_core_cap: 2.4,
    title_strong_first: 1.0,
    title_strong_extra: 0.3,
    title_strong_cap: 1.6,
    description_core_each: 0.5,
    description_core_cap: 1.0,
    description_strong_each: 0.25,
    description_strong_cap: 0.75,
    space_aero_bonus_title: 0.4,
    space_aero_bonus_description: 0.2,
    nuclear_plasma_bonus: 0.3,
    role_fit_bonus: 0.4,
    technical_bridge_bonus: 2.4,
    negative_each: 0.6,
    negative_cap: 1.8,
    base: 1.0,
  },
  domains: {
    core: ['nuclear', 'fusion', 'plasma', 'aerospace', 'space science', 'planetary science', 'climate science'],
    strong: ['mechanical engineering', 'electrical engineering', 'electronics', 'mems', 'materials science', 'manufacturing', 'instrumentation'],
    space_aero: ['aerospace', 'space science', 'spacecraft', 'planetary science', 'heliophysics'],
    nuclear_plasma: ['nuclear', 'fusion', 'plasma'],
    adjacent: ['laboratory', 'engineering', 'research', 'technician', 'calibration', 'fabrication'],
    technical_bridge: ['technology transfer', 'tech transfer', 'commercialization', 'patent', 'licensing', 'project manager', 'program manager', 'project management', 'program management'],
  },
  role_fit: {
    positive: ['engineer', 'technician', 'research scientist', 'research associate', 'laboratory', 'specialist', 'fellow', 'project manager', 'program manager'],
    review: ['professor', 'faculty', 'lecturer', 'postdoctoral', 'physician', 'nurse', 'clinical', 'director'],
  },
  exclusions: {
    false_friends: ['blood plasma', 'office space', 'organizational climate', 'nuclear medicine'],
    negative_topics: ['custodian', 'food service', 'nursing', 'marketing'],
    technical_bridge_safe_negatives: ['marketing'],
  },
};

let cachedPolicy = null;
let cachedPolicyMtime = 0;

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function lower(value) {
  return cleanText(value).toLowerCase();
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function unique(items = []) {
  return [...new Set(items.map(cleanText).filter(Boolean))];
}

function asStringList(value) {
  if (!Array.isArray(value)) return null;
  const list = value.map(lower).filter(Boolean);
  return list.length ? list : null;
}

function mergePolicy(userPolicy = {}) {
  const merged = {
    policy_version: cleanText(userPolicy.policy_version) || DEFAULT_POLICY.policy_version,
    thresholds: { ...DEFAULT_POLICY.thresholds },
    weights: { ...DEFAULT_POLICY.weights },
    domains: { ...DEFAULT_POLICY.domains },
    role_fit: { ...DEFAULT_POLICY.role_fit },
    exclusions: { ...DEFAULT_POLICY.exclusions },
  };
  for (const key of Object.keys(merged.thresholds)) {
    const value = Number(userPolicy.thresholds?.[key]);
    if (Number.isFinite(value)) merged.thresholds[key] = value;
  }
  for (const key of Object.keys(merged.weights)) {
    const value = Number(userPolicy.weights?.[key]);
    if (Number.isFinite(value)) merged.weights[key] = value;
  }
  for (const key of Object.keys(merged.domains)) {
    const list = asStringList(userPolicy.domains?.[key]);
    if (list) merged.domains[key] = list;
  }
  for (const key of Object.keys(merged.role_fit)) {
    const list = asStringList(userPolicy.role_fit?.[key]);
    if (list) merged.role_fit[key] = list;
  }
  for (const key of Object.keys(merged.exclusions)) {
    const list = asStringList(userPolicy.exclusions?.[key]);
    if (list) merged.exclusions[key] = list;
  }
  return merged;
}

export function loadUmichScoringPolicy({ profilePath = PROFILE_PATH, forceReload = false } = {}) {
  let mtime = 0;
  try {
    mtime = existsSync(profilePath) ? statSync(profilePath).mtimeMs : 0;
  } catch {
    mtime = 0;
  }
  if (!forceReload && cachedPolicy && cachedPolicyMtime === mtime) return cachedPolicy;

  let userPolicy = {};
  if (yaml && existsSync(profilePath)) {
    try {
      const parsed = yaml.load(readFileSync(profilePath, 'utf-8')) || {};
      userPolicy = parsed.research_targeting?.umich_careers || {};
    } catch (err) {
      console.warn(`[umich-scoring] failed to load ${profilePath}: ${err.message} — using built-in defaults`);
    }
  }
  cachedPolicy = mergePolicy(userPolicy);
  cachedPolicyMtime = mtime;
  return cachedPolicy;
}

/**
 * Token-boundary matching. Multi-word phrases match as phrases; single short
 * or ambiguous words require word boundaries so "MEMS" never matches
 * "remembers" and "space" never matches "spaces" mid-word contexts loosely.
 */
function termMatches(haystack, term) {
  const needle = lower(term);
  if (!needle) return false;
  return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:[^a-z0-9]|$)`, 'i').test(haystack);
}

function matchTerms(text, terms = []) {
  const haystack = lower(text);
  return unique(terms.filter(term => termMatches(haystack, term)));
}

/**
 * Discard a matched head term when every occurrence sits inside a known
 * false-friend phrase (blood plasma, office space, organizational climate…).
 */
function filterFalseFriends(matches = [], text = '', falseFriends = []) {
  const haystack = lower(text);
  return matches.filter(term => {
    const needle = lower(term);
    const guards = falseFriends.filter(phrase => lower(phrase).includes(needle));
    if (!guards.length) return true;
    const pattern = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:[^a-z0-9]|$)`, 'gi');
    let occurrences = 0;
    let guardedOccurrences = 0;
    let match;
    while ((match = pattern.exec(haystack)) !== null) {
      occurrences += 1;
      const start = Math.max(0, match.index - 40);
      const context = haystack.slice(start, match.index + needle.length + 40);
      if (guards.some(phrase => context.includes(lower(phrase)))) guardedOccurrences += 1;
      pattern.lastIndex = match.index + 1;
    }
    return occurrences === 0 ? false : guardedOccurrences < occurrences;
  });
}

function capped(count, first, extra, cap) {
  if (count <= 0) return 0;
  return Math.min(cap, first + (count - 1) * extra);
}

/**
 * Score one U-M posting from its full description.
 *
 * @param {object} posting - { title, job_title, department, career_interest,
 *   description, posting_end_date, status }
 * @param {Date} now
 */
export function scoreUmichPosting(posting = {}, now = new Date(), { policy = null } = {}) {
  const activePolicy = policy || loadUmichScoringPolicy();
  const { thresholds, weights, domains, role_fit: roleFit, exclusions } = activePolicy;

  const titleText = [posting.title, posting.working_title, posting.job_title].map(cleanText).filter(Boolean).join(' | ');
  const metaText = [posting.department, posting.career_interest, posting.organizational_group].map(cleanText).filter(Boolean).join(' | ');
  const bodyText = cleanText(posting.description || posting.description_text || posting.summary);
  const titleMeta = `${titleText} | ${metaText}`;
  const fullText = `${titleMeta} | ${bodyText}`;

  const ff = exclusions.false_friends;
  const titleCore = filterFalseFriends(matchTerms(titleMeta, domains.core), titleMeta, ff);
  const titleStrong = filterFalseFriends(matchTerms(titleMeta, domains.strong), titleMeta, ff)
    .filter(term => !titleCore.includes(term));
  const bodyCore = filterFalseFriends(matchTerms(bodyText, domains.core), bodyText, ff)
    .filter(term => !titleCore.includes(term));
  const bodyStrong = filterFalseFriends(matchTerms(bodyText, domains.strong), bodyText, ff)
    .filter(term => !titleStrong.includes(term) && !bodyCore.includes(term));
  const adjacentMatches = filterFalseFriends(matchTerms(fullText, domains.adjacent), fullText, ff);

  const spaceAeroTitle = filterFalseFriends(matchTerms(titleMeta, domains.space_aero), titleMeta, ff);
  const spaceAeroBody = filterFalseFriends(matchTerms(bodyText, domains.space_aero), bodyText, ff);
  const nuclearPlasma = filterFalseFriends(matchTerms(fullText, domains.nuclear_plasma), fullText, ff);
  const technicalBridgeMatches = matchTerms(fullText, domains.technical_bridge);

  const rolePositive = matchTerms(titleText, roleFit.positive);
  const roleReview = matchTerms(titleText, roleFit.review);
  const negativeMatches = matchTerms(fullText, exclusions.negative_topics);

  const requestedDomainMatches = unique([...titleCore, ...titleStrong, ...bodyCore, ...bodyStrong]);
  const technicalBridge = technicalBridgeMatches.length > 0 && requestedDomainMatches.length > 0;
  const effectiveNegativeMatches = negativeMatches.filter(term => (
    !technicalBridge || !exclusions.technical_bridge_safe_negatives.includes(lower(term))
  ));
  const directDomain = titleCore.length > 0 || titleStrong.length > 0
    || bodyCore.length >= 2 || (bodyCore.length >= 1 && bodyStrong.length >= 1)
    || technicalBridge;

  let score = weights.base;
  score += capped(titleCore.length, weights.title_core_first, weights.title_core_extra, weights.title_core_cap);
  score += capped(titleStrong.length, weights.title_strong_first, weights.title_strong_extra, weights.title_strong_cap);
  score += Math.min(weights.description_core_cap, bodyCore.length * weights.description_core_each);
  score += Math.min(weights.description_strong_cap, bodyStrong.length * weights.description_strong_each);
  if (spaceAeroTitle.length) score += weights.space_aero_bonus_title;
  else if (spaceAeroBody.length >= 2) score += weights.space_aero_bonus_description;
  if (nuclearPlasma.length && (titleCore.length || bodyCore.length >= 1)) score += weights.nuclear_plasma_bonus;
  if (technicalBridge) score += weights.technical_bridge_bonus;
  if (rolePositive.length && directDomain) score += weights.role_fit_bonus;
  if (!directDomain && adjacentMatches.length) score += Math.min(0.8, adjacentMatches.length * 0.2);

  const riskFlags = [];
  if (effectiveNegativeMatches.length) {
    score -= Math.min(weights.negative_cap, effectiveNegativeMatches.length * weights.negative_each);
    riskFlags.push('negative_topic_match');
  }
  if (roleReview.length) riskFlags.push('role_needs_review');
  if (!rolePositive.length && !roleReview.length) riskFlags.push('role_unclassified');
  if (!bodyText) riskFlags.push('description_missing');

  const endDate = cleanText(posting.posting_end_date) ? new Date(`${posting.posting_end_date}T23:59:59`) : null;
  const endDateValid = endDate && !Number.isNaN(endDate.getTime());
  const closedByDate = endDateValid && endDate.getTime() < now.getTime();
  const closedByStatus = ['closed', 'removed'].includes(lower(posting.status));
  if (endDateValid && !closedByDate) {
    const days = (endDate.getTime() - now.getTime()) / 86_400_000;
    if (days <= 7) riskFlags.push('closing_soon');
  }

  score = Math.max(0, Math.min(5, Number(score.toFixed(2))));

  // Requested-domain visibility floor: soft penalties can never bury these.
  let floorApplied = false;
  if (directDomain && score < thresholds.high_relevance) {
    score = thresholds.high_relevance;
    floorApplied = true;
    riskFlags.push('requested_domain_floor');
  }

  let segment;
  if (closedByDate || closedByStatus) {
    segment = 'closed';
  } else if (directDomain && !roleReview.length && rolePositive.length && score >= thresholds.apply_now) {
    segment = 'apply_now';
  } else if (directDomain || score >= thresholds.high_relevance) {
    segment = 'high_relevance';
  } else if (score >= thresholds.adjacent || adjacentMatches.length >= 2) {
    segment = 'adjacent';
  } else {
    segment = 'other';
  }
  if (segment === 'high_relevance' && !directDomain && score < thresholds.high_relevance) {
    segment = 'adjacent';
  }

  const rationale = [
    titleCore.length ? `Core domain in title: ${titleCore.slice(0, 4).join(', ')}.` : '',
    titleStrong.length ? `Strong domain in title: ${titleStrong.slice(0, 4).join(', ')}.` : '',
    bodyCore.length ? `Core domain in description: ${bodyCore.slice(0, 4).join(', ')}.` : '',
    bodyStrong.length ? `Strong domain in description: ${bodyStrong.slice(0, 4).join(', ')}.` : '',
    spaceAeroTitle.length || spaceAeroBody.length >= 2 ? 'Space/aerospace proximity bonus applied.' : '',
    nuclearPlasma.length ? `Nuclear/plasma signal: ${nuclearPlasma.slice(0, 3).join(', ')}.` : '',
    technicalBridge ? `Technical bridge role: ${technicalBridgeMatches.slice(0, 3).join(', ')}.` : '',
    rolePositive.length ? `Role fit: ${rolePositive.slice(0, 3).join(', ')}.` : '',
    roleReview.length ? `Role needs review: ${roleReview.slice(0, 3).join(', ')} — kept out of Apply Now.` : '',
    effectiveNegativeMatches.length ? `Penalty: ${effectiveNegativeMatches.slice(0, 3).join(', ')}.` : '',
    floorApplied ? 'Requested-domain floor kept this posting visible.' : '',
    !directDomain && adjacentMatches.length ? `Adjacent signal: ${adjacentMatches.slice(0, 4).join(', ')}.` : '',
  ].filter(Boolean).join(' ');

  return {
    score,
    segment,
    visible: segment !== 'other' && segment !== 'closed',
    direct_domain: directDomain,
    risk_flags: unique(riskFlags),
    policy_version: activePolicy.policy_version,
    fit_rationale: rationale || 'No requested-domain evidence found.',
    score_breakdown: {
      title_core_matches: titleCore,
      title_strong_matches: titleStrong,
      description_core_matches: bodyCore,
      description_strong_matches: bodyStrong,
      adjacent_matches: adjacentMatches,
      space_aero_matches: unique([...spaceAeroTitle, ...spaceAeroBody]),
      nuclear_plasma_matches: nuclearPlasma,
      technical_bridge_matches: technicalBridgeMatches,
      technical_bridge_applied: technicalBridge,
      role_positive_matches: rolePositive,
      role_review_matches: roleReview,
      negative_matches: effectiveNegativeMatches,
      requested_domain_matches: requestedDomainMatches,
      requested_domain_floor_applied: floorApplied,
      posting_end_date: cleanText(posting.posting_end_date),
    },
  };
}
