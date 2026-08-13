import { existsSync, mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  CANONICAL_EURAXESS_FILE,
  readEuraxessOpportunities,
  rescoreEuraxessOpportunities,
  syncEuraxessOpportunitiesToDashboard,
} from '../lib/euraxess/opportunity-store.mjs';
import {
  CANONICAL_PHD_BOARD_FILE,
  CANONICAL_PHDSCANNER_FILE,
  readPhdscannerOpportunities,
  rescorePhdscannerOpportunities,
  syncPhdscannerOpportunitiesToDashboard,
} from '../lib/phdscanner/opportunity-store.mjs';
import {
  CANONICAL_UMICH_FILE,
  readUmichOpportunities,
  rescoreUmichOpportunities,
  syncUmichOpportunitiesToDashboard,
} from '../lib/umich-careers/opportunity-store.mjs';
import {
  CANONICAL_JOBS_FILE,
  readConsiderJobs,
  syncConsiderJobsToDashboard,
  writeConsiderJobs,
} from '../lib/jobs-to-consider-store.mjs';
import {
  readResearchProspects,
  researchProspectConfig,
  syncResearchProspectsToDashboard,
  writeResearchProspects,
} from '../lib/research-prospect-store.mjs';
import { buildMigrationRow } from '../lib/opportunity-scoring/index.mjs';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS_DIR = join(SCRIPT_DIR, '..', '..');
const apply = process.argv.includes('--apply');
const outputArg = process.argv.find(argument => argument.startsWith('--output='));
const outputPath = outputArg
  ? join(CAREER_OPS_DIR, outputArg.slice('--output='.length))
  : join(CAREER_OPS_DIR, 'data', 'opportunity-scoring-shadow-report.json');
const now = new Date();

function row(lane, item, type) {
  return buildMigrationRow(lane, item, type, { now });
}

const laneInputs = [
  { lane: 'euraxess', type: 'phd', file: CANONICAL_EURAXESS_FILE, records: readEuraxessOpportunities(CANONICAL_EURAXESS_FILE).opportunities },
  { lane: 'phdscanner', type: 'phd', file: CANONICAL_PHDSCANNER_FILE, records: readPhdscannerOpportunities(CANONICAL_PHDSCANNER_FILE).opportunities },
  { lane: 'phd-board', type: 'phd', file: CANONICAL_PHD_BOARD_FILE, records: readPhdscannerOpportunities(CANONICAL_PHD_BOARD_FILE).opportunities },
  { lane: 'umich-careers', type: 'job', file: CANONICAL_UMICH_FILE, records: readUmichOpportunities(CANONICAL_UMICH_FILE).opportunities },
  { lane: 'jobs-to-consider', type: 'job', file: CANONICAL_JOBS_FILE, records: readConsiderJobs(CANONICAL_JOBS_FILE).jobs },
];

for (const source of ['umich', 'kth', 'ipp', 'private-co', 'professor-list']) {
  const config = researchProspectConfig(source);
  if (!existsSync(config.canonicalFile)) continue;
  laneInputs.push({
    lane: `research-${source}`,
    type: 'research',
    file: config.canonicalFile,
    records: readResearchProspects({ source }).prospects,
  });
}

const changes = laneInputs.flatMap(lane => lane.records.map(item => row(lane.lane, item, lane.type)));
const report = {
  mode: apply ? 'apply' : 'shadow',
  generated_at: now.toISOString(),
  policy_version: changes[0]?.policy_version || '',
  totals: {
    records: changes.length,
    review_required: changes.filter(item => item.review_required).length,
    blocked: changes.filter(item => item.eligibility === 'blocked').length,
    changed_numeric_score: changes.filter(item => item.delta !== null && item.delta !== 0).length,
  },
  by_lane: Object.fromEntries(laneInputs.map(lane => [
    lane.lane,
    {
      records: changes.filter(item => item.lane === lane.lane).length,
      review_required: changes.filter(item => item.lane === lane.lane && item.review_required).length,
    },
  ])),
  changes,
};

if (apply) {
  rescoreEuraxessOpportunities({ filePath: CANONICAL_EURAXESS_FILE, now });
  rescorePhdscannerOpportunities({ filePath: CANONICAL_PHDSCANNER_FILE, now });
  if (existsSync(CANONICAL_PHD_BOARD_FILE)) {
    rescorePhdscannerOpportunities({ filePath: CANONICAL_PHD_BOARD_FILE, now });
  }
  rescoreUmichOpportunities({ filePath: CANONICAL_UMICH_FILE, now });
  writeConsiderJobs(readConsiderJobs(CANONICAL_JOBS_FILE), CANONICAL_JOBS_FILE);
  for (const source of ['umich', 'kth', 'ipp', 'private-co', 'professor-list']) {
    const config = researchProspectConfig(source);
    if (!existsSync(config.canonicalFile)) continue;
    writeResearchProspects(readResearchProspects({ source }), { source });
    syncResearchProspectsToDashboard({ source });
  }
  syncEuraxessOpportunitiesToDashboard();
  syncPhdscannerOpportunitiesToDashboard();
  syncUmichOpportunitiesToDashboard();
  syncConsiderJobsToDashboard();
}

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf-8');
console.log(JSON.stringify({ ...report.totals, mode: report.mode, output: outputPath }));
