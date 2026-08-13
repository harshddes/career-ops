#!/usr/bin/env node
/**
 * Upsert McKinsey KEEP roles into Jobs to Consider after scan.
 */
import {
  upsertConsiderJob,
  syncConsiderJobsToDashboard,
} from '../lib/jobs-to-consider-store.mjs';

const keep = [
  {
    id: 'mckinsey-product-engineer-cost-engineering-wroclaw',
    company: 'McKinsey & Company',
    title: 'Product Engineer - Cost Engineering',
    url: 'https://www.mckinsey.com/careers/search-jobs/jobs/productengineer-costengineering-108001',
    location: 'Wroclaw, Poland',
    country_code: 'PL',
    countries: ['PL'],
    country: 'Poland',
    region: 'Europe',
    team: 'Product Development and Procurement',
    source: 'mckinsey_careers',
    status: 'to_consider',
    score: '3.4/5',
    fit_summary: 'Engineering-master adjacent PDP/cost-engineering knowledge role with physical product teardown / design-to-value labs (aerospace/high-tech clients). Not fusion/plasma instrumentation, but closest McKinsey KEEP vs BA/Associate/QuantumBlack software.',
    recommendation: 'Review JD for language/visa; network into PDP if applying. Stretch vs core instrumentation lane.',
    notes: 'KEEP from 2026-07-26 McKinsey scan. Report: reports/mckinsey-product-engineer-cost-engineering-2026-07-26.md',
    resources: {
      report_md: 'reports/mckinsey-product-engineer-cost-engineering-2026-07-26.md',
    },
    liveness: 'active',
    liveness_exempt: false,
  },
];

for (const job of keep) {
  upsertConsiderJob(job);
  console.log('upserted', job.id);
}

const synced = syncConsiderJobsToDashboard();
console.log(JSON.stringify({ total: synced.total, keep: keep.length }, null, 2));
