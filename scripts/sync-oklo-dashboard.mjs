#!/usr/bin/env node
import { upsertConsiderJob, patchConsiderJob, syncConsiderJobsToDashboard } from '../WEB-TRACKER/lib/jobs-to-consider-store.mjs';

const DATE = '2026-07-01';
const portfolioReport = 'reports/030-oklo-portfolio-master-2026-07-01.md';

const roles = [
  {
    id: 'oklo-open-call-for-engineers',
    company: 'Oklo',
    title: 'Open Call for Engineers',
    url: 'https://job-boards.greenhouse.io/oklo/jobs/4714198004',
    location: 'Any',
    score: 3.9,
    status: 'to_consider',
    notes: 'Primary entry router; verify ITAR/Part 810 + H-1B before deep investment',
    report_md: 'reports/034-oklo-open-call-for-engineers-2026-07-01.md',
    slug: 'open-call-for-engineers',
  },
  {
    id: 'oklo-hardware-test-engineer',
    company: 'Oklo',
    title: 'Hardware Test Engineer',
    url: 'https://job-boards.greenhouse.io/oklo/jobs/5544852004',
    location: 'Idaho Falls, ID',
    score: 4.3,
    status: 'to_consider',
    notes: 'Best technical fit — thermo-hydraulic test; 4+ yr ask; onsite Idaho Falls',
    report_md: 'reports/031-oklo-hardware-test-engineer-2026-07-01.md',
    slug: 'hardware-test-engineer',
  },
  {
    id: 'oklo-systems-engineer-requirements-integration',
    company: 'Oklo',
    title: 'Systems Engineer, Requirements and Integration',
    url: 'https://job-boards.greenhouse.io/oklo/jobs/5649054004',
    location: 'Santa Clara, CA or Remote',
    score: 3.7,
    status: 'to_consider',
    notes: 'TestBedz + UOP RTM fit; remote possible',
    report_md: 'reports/036-oklo-systems-engineer-requirements-and-integration-2026-07-01.md',
    slug: 'systems-engineer-requirements-and-integration',
  },
  {
    id: 'oklo-mechatronics-engineer',
    company: 'Oklo',
    title: 'Mechatronics Engineer',
    url: 'https://job-boards.greenhouse.io/oklo/jobs/5677684004',
    location: 'Santa Clara, CA or Remote',
    score: 4.0,
    status: 'to_consider',
    notes: 'Fuel recycling automation; hot-cell stretch; confirm export scope',
    report_md: 'reports/033-oklo-mechatronics-engineer-2026-07-01.md',
    slug: 'mechatronics-engineer',
  },
  {
    id: 'oklo-thermal-hydraulic-test-engineer',
    company: 'Oklo',
    title: 'Thermal Hydraulic Test Engineer',
    url: 'https://job-boards.greenhouse.io/oklo/jobs/5710536004',
    location: 'Idaho Falls, ID',
    score: 4.2,
    status: 'to_consider',
    notes: 'Strong fluids+test fit; 5+ yr ask — stretch on tenure',
    report_md: 'reports/032-oklo-thermal-hydraulic-test-engineer-2026-07-01.md',
    slug: null,
  },
  {
    id: 'oklo-reactor-core-thermal-fluids-engineer',
    company: 'Oklo',
    title: 'Reactor Core Thermal Fluids Engineer',
    url: 'https://job-boards.greenhouse.io/oklo/jobs/6015809004',
    location: 'Santa Clara, CA or remote',
    score: 3.8,
    status: 'to_consider',
    notes: 'CFD/HPC overlap; secondary to test roles',
    report_md: 'reports/035-oklo-reactor-core-thermal-fluids-engineer-2026-07-01.md',
    slug: null,
  },
];

for (const r of roles) {
  const resources = {
    report_md: r.report_md,
    portfolio_report_md: portfolioReport,
    outreach_playbook: `output/oklo/outreach-playbook-${DATE}.md`,
  };
  if (r.slug) {
    Object.assign(resources, {
      resume_tex: `output/oklo/cv-harsh-desai-oklo-${r.slug}-${DATE}.tex`,
      resume_pdf: `output/oklo/cv-harsh-desai-oklo-${r.slug}-${DATE}.pdf`,
      cover_letter_pdf: `output/oklo/cover-letter-harsh-desai-oklo-${r.slug}-${DATE}.pdf`,
      email_draft: `output/oklo/application-email-oklo-${r.slug}-${DATE}.md`,
    });
  }
  upsertConsiderJob({
    id: r.id,
    company: r.company,
    title: r.title,
    url: r.url,
    location: r.location,
    status: r.status,
    score: typeof r.score === 'number' ? `${r.score.toFixed(1)}/5` : `${r.score}/5`,
    notes: r.notes,
    tags: ['oklo', 'nuclear', 'fission', 'export-control-risk'],
    resources,
    evaluated_at: DATE,
  });
}

// Portfolio umbrella entry
upsertConsiderJob({
  id: 'oklo-portfolio-2026-07-01',
  company: 'Oklo',
  title: 'Full Portfolio Scan (60 roles)',
  url: 'https://job-boards.greenhouse.io/oklo',
  location: 'Multiple',
  status: 'evaluated',
  score: null,
  notes: '60-role Oklo Greenhouse scan; 4 artifact packs generated; ITAR/Part 810 risk flagged',
  tags: ['oklo', 'portfolio-scan'],
  resources: {
    report_md: portfolioReport,
    research_md: 'batch/oklo-company-research-2026-07-01.json',
    outreach_playbook: `output/oklo/outreach-playbook-${DATE}.md`,
  },
  evaluated_at: DATE,
});

syncConsiderJobsToDashboard();
console.log('Synced', roles.length + 1, 'Oklo jobs to dashboard');
