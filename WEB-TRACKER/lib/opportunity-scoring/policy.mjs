import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import yaml from 'js-yaml';

const MODULE_DIR = dirname(fileURLToPath(import.meta.url));
export const CAREER_OPS_DIR = join(MODULE_DIR, '..', '..', '..');
export const DEFAULT_PROFILE_PATH = join(CAREER_OPS_DIR, 'config', 'profile.yml');

function assertObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be an object`);
  }
}

export function validateOpportunityScoringPolicy(policy) {
  assertObject(policy, 'opportunity_scoring');
  if (!String(policy.policy_version || '').trim()) {
    throw new Error('opportunity_scoring.policy_version is required');
  }
  assertObject(policy.thresholds, 'opportunity_scoring.thresholds');
  assertObject(policy.dimensions, 'opportunity_scoring.dimensions');
  assertObject(policy.rules, 'opportunity_scoring.rules');
  assertObject(policy.terms, 'opportunity_scoring.terms');

  const thresholdOrder = ['visible', 'consider', 'apply'].map(key => Number(policy.thresholds[key]));
  if (thresholdOrder.some(value => !Number.isFinite(value))) {
    throw new Error('visible, consider, and apply thresholds must be numbers');
  }
  if (!(thresholdOrder[0] < thresholdOrder[1] && thresholdOrder[1] < thresholdOrder[2])) {
    throw new Error('thresholds must satisfy visible < consider < apply');
  }

  const weights = Object.entries(policy.dimensions).map(([id, dimension]) => {
    const weight = Number(dimension?.weight);
    if (!Number.isFinite(weight) || weight <= 0) {
      throw new Error(`dimension ${id} must have a positive numeric weight`);
    }
    return weight;
  });
  const total = weights.reduce((sum, value) => sum + value, 0);
  if (Math.abs(total - 1) > 1e-9) {
    throw new Error(`opportunity scoring weights must sum to 1; received ${total}`);
  }

  for (const [group, terms] of Object.entries(policy.terms)) {
    if (!Array.isArray(terms) || terms.some(term => !String(term || '').trim())) {
      throw new Error(`term group ${group} must contain non-empty strings`);
    }
  }
  if (!Array.isArray(policy.candidate_facts) || !policy.candidate_facts.length) {
    throw new Error('opportunity_scoring.candidate_facts must not be empty');
  }
  const ids = new Set();
  for (const fact of policy.candidate_facts) {
    if (!String(fact?.id || '').trim() || ids.has(fact.id)) {
      throw new Error(`candidate fact IDs must be present and unique: ${fact?.id || '<missing>'}`);
    }
    ids.add(fact.id);
    if (!Array.isArray(fact.terms) || !fact.terms.length) {
      throw new Error(`candidate fact ${fact.id} must define matching terms`);
    }
  }
  return policy;
}

export function loadOpportunityScoringPolicy(profilePath = DEFAULT_PROFILE_PATH) {
  const profile = yaml.load(readFileSync(profilePath, 'utf-8')) || {};
  return validateOpportunityScoringPolicy(profile.opportunity_scoring);
}
