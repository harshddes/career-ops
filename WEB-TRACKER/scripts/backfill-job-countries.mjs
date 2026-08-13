#!/usr/bin/env node
/**
 * Backfill country_code / countries / country / region on jobs-to-consider.
 * Usage: node WEB-TRACKER/scripts/backfill-job-countries.mjs
 */
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import {
  readConsiderJobs,
  writeConsiderJobs,
  syncConsiderJobsToDashboard,
  CAREER_DATA_DIR,
} from '../lib/jobs-to-consider-store.mjs';
import { locationToCountry } from '../lib/geo/location-to-country.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

function main() {
  const store = readConsiderJobs();
  const distinct = new Map();
  const leftovers = [];
  let filled = 0;

  store.jobs = store.jobs.map((job) => {
    const parsed = locationToCountry(job.location);
    const key = job.location || '(empty)';
    if (!distinct.has(key)) distinct.set(key, parsed);

    const next = {
      ...job,
      country_code: job.country_code || parsed.country_code || '',
      countries: (job.countries && job.countries.length)
        ? job.countries
        : parsed.countries,
      country: job.country || parsed.country || '',
      region: job.region || parsed.region || '',
    };

    if (parsed.country_code || next.country_code) filled += 1;
    else leftovers.push({ id: job.id, location: job.location || '' });

    return next;
  });

  writeConsiderJobs(store);
  const synced = syncConsiderJobsToDashboard();

  const report = {
    generated_at: new Date().toISOString(),
    total_jobs: store.jobs.length,
    with_country: filled,
    unknown_count: leftovers.length,
    unknown_jobs: leftovers,
    distinct_locations: [...distinct.entries()].map(([location, parsed]) => ({
      location,
      country_code: parsed.country_code,
      countries: parsed.countries,
      region: parsed.region,
      is_unknown: parsed.is_unknown,
    })),
  };

  const reportPath = join(CAREER_DATA_DIR, 'job-country-backfill-report.json');
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  const resolvedDistinct = report.distinct_locations.filter(x => x.country_code).length;
  const distinctTotal = report.distinct_locations.length;
  const pct = distinctTotal ? ((resolvedDistinct / distinctTotal) * 100).toFixed(1) : '0';

  console.log(JSON.stringify({
    total_jobs: report.total_jobs,
    with_country: report.with_country,
    unknown_count: report.unknown_count,
    distinct_resolved: `${resolvedDistinct}/${distinctTotal} (${pct}%)`,
    synced_total: synced.total,
    report: reportPath,
    leftovers: leftovers.map(x => x.location || x.id),
  }, null, 2));
}

main();
