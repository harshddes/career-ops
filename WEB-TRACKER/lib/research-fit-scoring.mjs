/**
 * Candidate-specific research fit scoring.
 *
 * Research contacts use the dedicated research-contact scorer.
 * Job/PhD opportunity scoring remains isolated in opportunity-scoring/engine.mjs.
 * Generated rationale, outreach copy, and transfer vectors are outputs only.
 */
import {
  RESEARCH_CONTACT_POLICY_VERSION,
  scoreResearchContact,
} from './opportunity-scoring/research-contact.mjs';

export function scoreResearchProspect(prospect = {}) {
  return scoreResearchContact(prospect);
}

export function applyResearchFitScoring(prospect = {}) {
  return {
    ...prospect,
    ...scoreResearchProspect(prospect),
  };
}

export const RESEARCH_FIT_POLICY_VERSION = RESEARCH_CONTACT_POLICY_VERSION;
