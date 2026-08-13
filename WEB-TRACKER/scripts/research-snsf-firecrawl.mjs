#!/usr/bin/env node
/**
 * Scrape SNSF grant search pages via Firecrawl for unchecked Swiss prospects,
 * then write a results file consumable by refresh-professor-grants.mjs --results.
 */
import { execSync } from 'child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  CAREER_OPS_DIR,
  readResearchProspects,
} from '../lib/research-prospect-store.mjs';
import { parseSnsfGrantHtml } from '../lib/professor-grants/adapters.mjs';
import { buildGrantResearchPlan, normalizeProfessorCountry } from '../lib/professor-grants/router.mjs';

const OUT_DIR = join(CAREER_OPS_DIR, '.firecrawl', 'professor-grants', 'snsf');
const RESULTS_PATH = join(
  CAREER_OPS_DIR,
  'WEB-TRACKER',
  'runtime',
  'professor-grants',
  'batch-ch-snsf-results.json'
);

mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(join(CAREER_OPS_DIR, 'WEB-TRACKER', 'runtime', 'professor-grants'), { recursive: true });

const store = readResearchProspects({ source: 'professor-list' });
const limit = Math.max(0, Number(process.argv.find((_, i, arr) => arr[i - 1] === '--limit') || 0) || 0);
const targets = store.prospects
  .filter(prospect => !prospect.grants_checked_at)
  .filter(prospect => normalizeProfessorCountry(prospect) === 'CH')
  .slice(0, limit || undefined);

function quote(value = '') {
  return `"${String(value).replace(/"/g, '\\"')}"`;
}

const results = [];
for (const prospect of targets) {
  const plan = buildGrantResearchPlan(prospect);
  const snsf = plan.requests.find(request => request.portal === 'snsf');
  if (!snsf?.url) {
    results.push({
      prospect_id: prospect.id,
      checked_at: new Date().toISOString(),
      grants: [],
      attempts: [{ portal: 'snsf', status: 'error', error: 'missing search url' }],
    });
    continue;
  }
  const slug = String(prospect.id).replace(/[^a-z0-9-]+/gi, '-').toLowerCase();
  const outFile = join(OUT_DIR, `${slug}.md`);
  try {
    if (!existsSync(outFile)) {
      const command = [
        'firecrawl scrape',
        quote(snsf.url),
        '--wait-for 5000',
        `-o ${quote(outFile)}`,
      ].join(' ');
      execSync(command, {
        stdio: 'inherit',
        cwd: CAREER_OPS_DIR,
        shell: true,
        windowsHide: true,
      });
      // Soft rate-limit for free-tier firecrawl.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 7000);
    }
    const markdown = readFileSync(outFile, 'utf-8');
    const grants = parseSnsfGrantHtml(markdown, prospect);
    results.push({
      prospect_id: prospect.id,
      checked_at: new Date().toISOString(),
      grants,
      attempts: [{ portal: 'snsf', status: 'ok', found: grants.length, url: snsf.url, tool: 'firecrawl' }],
    });
    console.log(JSON.stringify({ id: prospect.id, name: prospect.name, found: grants.length }));
  } catch (error) {
    results.push({
      prospect_id: prospect.id,
      checked_at: new Date().toISOString(),
      grants: [],
      attempts: [{ portal: 'snsf', status: 'error', error: error.message, url: snsf.url }],
    });
    console.error(JSON.stringify({ id: prospect.id, error: error.message }));
  }
}

writeFileSync(RESULTS_PATH, `${JSON.stringify({ results }, null, 2)}\n`, 'utf-8');
console.log(JSON.stringify({
  targets: targets.length,
  with_grants: results.filter(row => (row.grants || []).length).length,
  results_path: RESULTS_PATH,
}, null, 2));
