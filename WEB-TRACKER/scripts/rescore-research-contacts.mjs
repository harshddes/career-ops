/**
 * Research-contact-only shadow / apply rescoring.
 * Uses scoreResearchProspect so results match stored cards.
 */
import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { scoreResearchProspect } from '../lib/research-fit-scoring.mjs';
import {
  readResearchProspects,
  researchProspectConfig,
  syncResearchProspectsToDashboard,
  writeResearchProspects,
} from '../lib/research-prospect-store.mjs';
import { parseLegacyScore } from '../lib/opportunity-scoring/migration.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS_DIR = join(SCRIPT_DIR, '..', '..');
const apply = process.argv.includes('--apply');
const outputArg = process.argv.find(argument => argument.startsWith('--output='));
const outputPath = outputArg
  ? join(CAREER_OPS_DIR, outputArg.slice('--output='.length))
  : join(CAREER_OPS_DIR, 'data', 'research-contact-scoring-shadow-report.json');

const RESEARCH_SOURCES = ['umich', 'kth', 'ipp', 'private-co', 'professor-list'];

function buildRow(lane, item) {
  const legacyScore = item.legacy_score || item.score || '';
  const numericLegacy = parseLegacyScore(legacyScore);
  const scoring = scoreResearchProspect(item);
  return {
    lane,
    id: item.id,
    name: item.name || '',
    title: item.title || '',
    legacy_score: legacyScore,
    legacy_tier: item.tier || '',
    canonical_score: scoring.score,
    canonical_tier: scoring.tier,
    delta: numericLegacy === null ? null : Number((scoring.score - numericLegacy).toFixed(2)),
    policy_version: scoring.policy_version,
    confidence: scoring.confidence,
    review_required: scoring.review_required,
    relationship_signal: scoring.relationship_signal?.status || '',
    funding_opening_signal: scoring.funding_opening_signal?.status || '',
    verified_overlap: scoring.verified_overlap,
    scoring,
  };
}

const laneInputs = [];
for (const source of RESEARCH_SOURCES) {
  const config = researchProspectConfig(source);
  if (!existsSync(config.canonicalFile)) continue;
  laneInputs.push({
    lane: `research-${source}`,
    source,
    file: config.canonicalFile,
    records: readResearchProspects({ source }).prospects,
  });
}

const changes = laneInputs.flatMap(lane => lane.records.map(item => buildRow(lane.lane, item)));
const report = {
  mode: apply ? 'apply' : 'shadow',
  generated_at: new Date().toISOString(),
  policy_version: changes[0]?.policy_version || '',
  totals: {
    records: changes.length,
    review_required: changes.filter(item => item.review_required).length,
    tier_upgrades: changes.filter(item => item.legacy_tier && item.canonical_tier < item.legacy_tier === false
      && 'ABCD'.indexOf(item.canonical_tier) < 'ABCD'.indexOf(item.legacy_tier)).length,
    changed_numeric_score: changes.filter(item => item.delta !== null && item.delta !== 0).length,
    exemplars: changes.filter(item => /ivo classen|martin rubin|hans meister/i.test(item.name)),
  },
  by_lane: Object.fromEntries(laneInputs.map(lane => [
    lane.lane,
    {
      records: changes.filter(item => item.lane === lane.lane).length,
      review_required: changes.filter(item => item.lane === lane.lane && item.review_required).length,
      avg_canonical_score: Number((
        changes.filter(item => item.lane === lane.lane)
          .reduce((sum, item) => sum + Number(item.canonical_score || 0), 0)
        / Math.max(1, changes.filter(item => item.lane === lane.lane).length)
      ).toFixed(2)),
    },
  ])),
  changes,
};

if (apply) {
  for (const lane of laneInputs) {
    const store = readResearchProspects({ source: lane.source });
    writeResearchProspects(store, { source: lane.source });
    syncResearchProspectsToDashboard({ source: lane.source });
  }
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
console.log(JSON.stringify({
  ...report.totals,
  mode: report.mode,
  output: outputPath,
  exemplars: report.totals.exemplars.map(item => ({
    name: item.name,
    legacy: `${item.legacy_tier} ${item.legacy_score}`,
    canonical: `${item.canonical_tier} ${item.canonical_score}`,
  })),
}));
