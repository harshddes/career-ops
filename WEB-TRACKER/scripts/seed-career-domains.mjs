#!/usr/bin/env node
/**
 * Seed / refresh career_domains[] on networking organizations.
 * Usage: node WEB-TRACKER/scripts/seed-career-domains.mjs [--dry-run] [--force]
 *
 * --force : re-merge inference + overrides even when career_domains already set
 */
import { readFileSync } from 'fs';
import {
  inferCareerDomainsFromOrg,
  normalizeCareerDomains,
} from '../lib/career-domains.mjs';
import {
  syncNetworkingToDashboard,
  upsertNetworkingOrganization,
  CANONICAL_NETWORKING_FILE,
} from '../lib/networking/store.mjs';

const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const raw = JSON.parse(readFileSync(CANONICAL_NETWORKING_FILE, 'utf8'));
const report = { updated: [], skipped: [], dry_run: dryRun, force };

for (const org of raw.organizations || []) {
  const existing = normalizeCareerDomains(org.career_domains);
  const inferred = inferCareerDomainsFromOrg(org);
  const missing = !Object.prototype.hasOwnProperty.call(org, 'career_domains');
  let domains;
  if (force || missing) {
    domains = [...new Set([...existing.filter(d => d !== 'unassigned'), ...inferred])];
    if (domains.length > 1) domains = domains.filter(d => d !== 'unassigned');
    if (!domains.length) domains = ['unassigned'];
  } else if (!existing.length) {
    domains = inferred;
  } else {
    domains = existing;
  }
  const same = domains.length === existing.length && domains.every((id, i) => id === existing[i]);
  if (same && !missing) {
    report.skipped.push({ name: org.name, career_domains: existing });
    continue;
  }
  report.updated.push({ name: org.name, from: existing, to: domains });
  if (!dryRun) {
    upsertNetworkingOrganization({
      id: org.id,
      name: org.name,
      career_domains: domains,
    }, CANONICAL_NETWORKING_FILE);
  }
}

if (!dryRun && report.updated.length) {
  syncNetworkingToDashboard();
}

console.log(JSON.stringify(report, null, 2));
