#!/usr/bin/env node
/**
 * Clear first exhibitor operate-chunk: Pulsar, Orbion, Redwire, Pale Blue.
 */
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import {
  markExhibitorTaskInProgress,
  markExhibitorTaskCompleted,
} from '../../WEB-TRACKER/lib/exhibitor/factory.mjs';
import {
  patchExhibitorCompany,
  syncExhibitorCompaniesToDashboard,
  slugify as companySlug,
} from '../../WEB-TRACKER/lib/exhibitor/company-store.mjs';
import {
  upsertConsiderJob,
  syncConsiderJobsToDashboard,
  slugify,
} from '../../WEB-TRACKER/lib/jobs-to-consider-store.mjs';

const TODAY = new Date().toISOString().slice(0, 10);

function writeReport(slug, body) {
  const path = `reports/exhibitor-${slug}-${TODAY}.md`;
  writeFileSync(path, body.endsWith('\n') ? body : `${body}\n`);
  return path;
}

function upsertRoles(company, roles) {
  const jobsFound = [];
  for (const role of roles) {
    const id = slugify(`${company}-${role.title}-${role.location || 'na'}-${role.id || role.url}`);
    upsertConsiderJob({
      id,
      company,
      title: role.title,
      url: role.url,
      location: role.location || '',
      source: 'exhibitor-smallsat-2026',
      score: role.score,
      fit_summary: role.fit_summary,
      notes: role.notes || 'From Target Companies exhibitor clear-queue.',
      status: 'to_consider',
      recommendation: role.recommendation || 'Review JD + work-auth before apply',
    });
    jobsFound.push({ id, title: role.title, url: role.url, score: role.score });
  }
  return jobsFound;
}

function finishCompany({
  companyId,
  companyName,
  website,
  careersUrl,
  status,
  roles,
  scanned,
  fitSummary,
  whyFit,
  whySkip,
  reportBody,
  slug,
}) {
  markExhibitorTaskInProgress(companyId);
  mkdirSync(`batch/exhibitors/${slug}`, { recursive: true });
  const jobsFound = upsertRoles(companyName, roles);
  syncConsiderJobsToDashboard();
  const reportPath = writeReport(slug, reportBody);
  writeFileSync(`batch/exhibitors/${slug}/inventory.json`, `${JSON.stringify({
    scanned,
    added: jobsFound.length,
    roles,
    careers_url: careersUrl,
  }, null, 2)}\n`);
  patchExhibitorCompany(companyId, {
    worker_status: status,
    website,
    careers_url: careersUrl,
    research_report: reportPath,
    resources: { report_md: reportPath },
    jobs_found: jobsFound,
    postings_scanned: scanned,
    postings_added: jobsFound.length,
    last_researched_at: new Date().toISOString(),
    fit_summary: fitSummary,
    why_fit: whyFit,
    why_skip: whySkip,
  });
  syncExhibitorCompaniesToDashboard();
  markExhibitorTaskCompleted(companyId);
  return { companyName, reportPath, added: jobsFound.length, scanned, status };
}

const results = [];

// ── Pulsar Fusion ────────────────────────────────────────────────────
results.push(finishCompany({
  companyId: 'exhibitor-smallsat-2026-pulsar-fusion-ltd',
  companyName: 'PULSAR FUSION Ltd',
  website: 'https://pulsarfusion.com/',
  careersUrl: 'https://pulsarfusion.com/join-our-think-tank/',
  status: 'no_open_roles',
  roles: [],
  scanned: 0,
  slug: 'pulsar-fusion',
  fitSummary: 'UK fusion/electric-propulsion company. No formal open job board — only short academic “think tank” project commissions.',
  whyFit: 'Topic overlap (Hall thruster plumes, fusion–EP overlap) is interesting for networking/outreach, not a standard apply-now role.',
  whySkip: 'No enumerated full-time postings on careers page at research time.',
  reportBody: `# Exhibitor careers research: PULSAR FUSION Ltd

**Booth:** 109
**Event:** smallsat-2026
**Website:** https://pulsarfusion.com/
**Careers / outreach:** https://pulsarfusion.com/join-our-think-tank/
**Generated:** ${new Date().toISOString()}

## Inventory

- Formal ATS / open full-time postings: **0**
- Page offers short funded academic projects (PhD/postdoc, ~1–3 months): Hall thruster plume numerics, nuclear propulsion literature, fusion–EP overlap.
- No Greenhouse/Lever/Workday board found.

## Decision

\`no_open_roles\` for Jobs to Consider. Keep card for outreach / think-tank contact only.
`,
}));

// ── Orbion ───────────────────────────────────────────────────────────
const orbionRoles = [
  {
    id: '4316938',
    title: 'Electrical Test Engineer',
    url: 'https://recruiting.paylocity.com/Recruiting/Jobs/Details/4316938',
    location: 'Houghton, MI (HQ)',
    score: '4.4/5',
    fit_summary: 'Electrical test for electric propulsion hardware — direct instrumentation/test-rig adjacency.',
  },
  {
    id: '3994031',
    title: 'Electrical Engineer',
    url: 'https://recruiting.paylocity.com/Recruiting/Jobs/Details/3994031',
    location: 'Houghton, MI (HQ)',
    score: '4.2/5',
    fit_summary: 'Electrical engineering on EP systems — hardware path.',
  },
  {
    id: '3994443',
    title: 'Electric Propulsion Engineer',
    url: 'https://recruiting.paylocity.com/Recruiting/Jobs/Details/3994443',
    location: 'Houghton, MI (HQ)',
    score: '4.5/5',
    fit_summary: 'Core EP role — plasma/propulsion hardware daily work.',
  },
  {
    id: '3873751',
    title: 'Chief Engineer - Propulsion Systems',
    url: 'https://recruiting.paylocity.com/Recruiting/Jobs/Details/3873751',
    location: 'Houghton, MI (HQ)',
    score: '3.8/5',
    fit_summary: 'Senior EP leadership — stretch level but strong domain.',
    recommendation: 'Stretch / senior — review bar before apply',
  },
  {
    id: '4281531',
    title: 'Aerospace Engineer',
    url: 'https://recruiting.paylocity.com/Recruiting/Jobs/Details/4281531',
    location: 'Houghton, MI (HQ)',
    score: '4.0/5',
    fit_summary: 'Aerospace engineering at EP company — verify hands-on vs analysis mix.',
  },
  {
    id: '4276053',
    title: 'Mechanical Engineer',
    url: 'https://recruiting.paylocity.com/Recruiting/Jobs/Details/4276053',
    location: 'Houghton, MI (HQ)',
    score: '3.9/5',
    fit_summary: 'Mechanical support for thruster hardware — manufacturing/test adjacency.',
  },
  {
    id: '4020842',
    title: 'Manufacturing Engineer',
    url: 'https://recruiting.paylocity.com/Recruiting/Jobs/Details/4020842',
    location: 'Houghton, MI (HQ)',
    score: '3.8/5',
    fit_summary: 'Manufacturing for space propulsion hardware.',
  },
  {
    id: '4020847',
    title: 'Associate Manufacturing Engineer',
    url: 'https://recruiting.paylocity.com/Recruiting/Jobs/Details/4020847',
    location: 'Houghton, MI (HQ)',
    score: '3.7/5',
    fit_summary: 'Junior manufacturing for EP hardware — learning path.',
  },
].map(r => ({
  ...r,
  notes: 'Orbion Paylocity board. Houghton MI electric propulsion OEM. Verify work-auth on JD.',
}));

results.push(finishCompany({
  companyId: 'exhibitor-smallsat-2026-orbion-space-technology',
  companyName: 'Orbion Space Technology',
  website: 'https://orbionspace.com/',
  careersUrl: 'https://orbionspace.com/careers/',
  status: 'research_ready',
  roles: orbionRoles,
  scanned: 12,
  slug: 'orbion-space-technology',
  fitSummary: 'Electric propulsion OEM (Houghton, MI). 12 Paylocity openings; added strong electrical/EP/test/manufacturing roles.',
  whyFit: 'Electric propulsion + electrical test maps directly to plasma/instrumentation hardware path.',
  whySkip: 'Skipped Director of Engineering, Manufacturing Manager, Senior Data Engineer, Quality Engineer, Manufacturing Technician as weaker daily-work fit or management-heavy.',
  reportBody: `# Exhibitor careers research: Orbion Space Technology

**Booth:** 1233
**Event:** smallsat-2026
**Website:** https://orbionspace.com/
**Careers:** https://orbionspace.com/careers/
**ATS:** https://recruiting.paylocity.com/recruiting/jobs/All/bfdde1c9-2b02-46d9-95a3-801a816131e8/Orbion-Space-Technology-Inc
**Generated:** ${new Date().toISOString()}

## Inventory

- Postings on Paylocity board: **12**
- Added to Jobs to Consider: **${orbionRoles.length}**

## Keep / add

| Score | Title | URL |
|------:|-------|-----|
${orbionRoles.map(r => `| ${r.score} | ${r.title} | ${r.url} |`).join('\n')}

## Skipped (report only)

Director of Engineering, Manufacturing Manager, Quality Engineer, Manufacturing Technician, Senior Data Engineer — management, QA-only, tech, or software-data daily work.

## Work-auth

US HQ (Houghton, MI). Confirm sponsorship / ITAR language on each JD before apply.
`,
}));

// ── Pale Blue ────────────────────────────────────────────────────────
const paleRoles = [
  {
    id: 'rd-engineer',
    title: 'Open Position (R&D Engineer)',
    url: 'https://open.talentio.com/r/1/c/pale-blue/homes/2329',
    location: 'Japan (Pale Blue)',
    score: '4.2/5',
    fit_summary: 'R&D engineer at water-propulsion startup — EP/hardware R&D.',
  },
  {
    id: 'electrical',
    title: 'Electrical Engineer',
    url: 'https://open.talentio.com/r/1/c/pale-blue/homes/2329',
    location: 'Japan (Pale Blue)',
    score: '4.3/5',
    fit_summary: 'Electrical engineer for water ion / Hall thruster systems.',
  },
  {
    id: 'mechanical',
    title: 'Mechanical Engineer',
    url: 'https://open.talentio.com/r/1/c/pale-blue/homes/2329',
    location: 'Japan (Pale Blue)',
    score: '3.9/5',
    fit_summary: 'Mechanical for propulsion hardware.',
  },
  {
    id: 'ep',
    title: 'Electric Propulsion Engineer',
    url: 'https://open.talentio.com/r/1/c/pale-blue/homes/2329',
    location: 'Japan (Pale Blue)',
    score: '4.6/5',
    fit_summary: 'Core EP role — strongest domain match.',
  },
  {
    id: 'sat-systems',
    title: 'Lead Satellite Systems Engineer',
    url: 'https://open.talentio.com/r/1/c/pale-blue/homes/2329',
    location: 'Japan (Pale Blue)',
    score: '4.0/5',
    fit_summary: 'Satellite systems leadership — stretch but space-systems relevant.',
    recommendation: 'Stretch / lead level — review bar',
  },
  {
    id: 'assembly-test',
    title: 'Assembly & Test Engineer',
    url: 'https://open.talentio.com/r/1/c/pale-blue/homes/2329',
    location: 'Japan (Pale Blue)',
    score: '4.3/5',
    fit_summary: 'Hands-on assembly/test — instrumentation/test-rig style work.',
  },
  {
    id: 'mfg',
    title: 'Manufacturing Engineer',
    url: 'https://open.talentio.com/r/1/c/pale-blue/homes/2329',
    location: 'Japan (Pale Blue)',
    score: '3.8/5',
    fit_summary: 'Manufacturing for propulsion hardware.',
  },
].map(r => ({
  ...r,
  notes: 'Pale Blue Talentio board (Japan). Water propulsion. Confirm Japan work authorization / language requirements.',
}));

results.push(finishCompany({
  companyId: 'exhibitor-smallsat-2026-pale-blue',
  companyName: 'Pale Blue',
  website: 'https://pale-blue.co.jp/',
  careersUrl: 'https://pale-blue.co.jp/career/',
  status: 'research_ready',
  roles: paleRoles,
  scanned: 14,
  slug: 'pale-blue',
  fitSummary: 'Japan water-propulsion startup. Talentio board open; added EP/electrical/test/R&D roles. Japan work-auth is a real constraint.',
  whyFit: 'Electric propulsion + electrical + assembly/test match desired daily work.',
  whySkip: 'Skipped BD, recruiter, procurement, QC-only, ground-segment backend, informal interview buckets.',
  reportBody: `# Exhibitor careers research: Pale Blue

**Booth:** 1832
**Event:** smallsat-2026
**Website:** https://pale-blue.co.jp/
**Careers:** https://pale-blue.co.jp/career/
**Openings board:** https://open.talentio.com/r/1/c/pale-blue/homes/2329
**Generated:** ${new Date().toISOString()}

## Inventory

- Talentio categories enumerated (BD, R&D, Production, Others, Corporate).
- Strong-fit engineering openings added: **${paleRoles.length}**
- Individual JD deep-links share the Talentio home URL; open specific posting from that board when applying.

## Keep / add

| Score | Title |
|------:|-------|
${paleRoles.map(r => `| ${r.score} | ${r.title} |`).join('\n')}

## Work-auth

Japan-based. Treat as high geo/visa friction unless relocating; still tracked because EP fit is excellent.
`,
}));

// ── Redwire ──────────────────────────────────────────────────────────
const redwireMap = existsSync('.firecrawl/exhibitors/redwire-map.txt')
  ? readFileSync('.firecrawl/exhibitors/redwire-map.txt', 'utf8').split(/\r?\n/).filter(Boolean)
  : [];
const redwireJobUrls = redwireMap.filter(u => u.includes('/jobs/') && !u.includes('/jobs/search'));

function titleFromRedwireUrl(url) {
  const slug = url.split('/jobs/')[1] || '';
  return slug
    .replace(/-united-states.*$/, '')
    .replace(/-belgium.*$/, '')
    .replace(/-luxembourg.*$/, '')
    .replace(/-[0-9a-f]{8}-[0-9a-f]{4}-.*$/, '')
    .split('-')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

const redwireKeepRe = /fpga|hardware|rf.?test|test engineer|avionics|sensor|systems engineer|electrical|optical|payload|propulsion|gnc|mechanical engineer|manufacturing engineer|structural|robotic systems|hardware development|hardware test/i;
const redwireSkipRe = /intern|director|business development|facilities|procurement|knowledge manager|controller|business analyst|quality engineer|technician|software design|software engineering|project manager|continuous improvement/i;

const redwireRoles = [];
for (const url of redwireJobUrls) {
  const title = titleFromRedwireUrl(url);
  if (redwireSkipRe.test(title) || redwireSkipRe.test(url)) continue;
  if (!redwireKeepRe.test(title) && !redwireKeepRe.test(url)) continue;
  let score = '4.0/5';
  if (/fpga|rf.?test|hardware test|sensor|avionics|optical/i.test(title + url)) score = '4.4/5';
  if (/systems modeling|staff systems/i.test(title + url)) score = '3.9/5';
  redwireRoles.push({
    id: slugify(url).slice(-24),
    title,
    url,
    location: /luxembourg/i.test(url) ? 'Luxembourg'
      : /kruibeke|belgium/i.test(url) ? 'Kruibeke, Belgium'
      : /littleton/i.test(url) ? 'Littleton, CO'
      : /longmont/i.test(url) ? 'Longmont, CO'
      : /marlborough/i.test(url) ? 'Marlborough, MA'
      : /goleta/i.test(url) ? 'Goleta, CA'
      : /albuquerque/i.test(url) ? 'Albuquerque, NM'
      : /chantilly/i.test(url) ? 'Chantilly, VA'
      : 'Redwire',
    score,
    fit_summary: 'Redwire space infrastructure / sensors / hardware — from careers.rdw.com map.',
    notes: 'Many US Redwire roles are ITAR/clearance-sensitive — verify before apply. Source: careers.rdw.com map.',
  });
}

// Deduplicate by URL
const seenRw = new Set();
const redwireUnique = redwireRoles.filter(r => {
  if (seenRw.has(r.url)) return false;
  seenRw.add(r.url);
  return true;
});

results.push(finishCompany({
  companyId: 'exhibitor-smallsat-2026-redwire',
  companyName: 'Redwire',
  website: 'https://rdw.com/',
  careersUrl: 'https://careers.rdw.com/',
  status: 'research_ready',
  roles: redwireUnique,
  scanned: redwireJobUrls.length,
  slug: 'redwire',
  fitSummary: `Space infrastructure OEM. Mapped ${redwireJobUrls.length} job URLs on careers.rdw.com; added ${redwireUnique.length} hardware/sensors/test/systems roles.`,
  whyFit: 'Avionics/sensors, FPGA/hardware, RF test, hardware test, mechanical/manufacturing for space hardware.',
  whySkip: 'Skipped interns, BD, facilities, pure software, QA contractor, PM, and admin roles from the map sample.',
  reportBody: `# Exhibitor careers research: Redwire

**Booth:** 1319
**Event:** smallsat-2026
**Website:** https://rdw.com/
**Careers:** https://careers.rdw.com/ (also https://careers.redwirespace.com/)
**Generated:** ${new Date().toISOString()}

## Inventory

- Job URLs discovered via careers site map (engineer search): **${redwireJobUrls.length}**
- Added to Jobs to Consider: **${redwireUnique.length}**
- Raw map: \`.firecrawl/exhibitors/redwire-map.txt\`

## Keep / add

| Score | Title | Location |
|------:|-------|----------|
${redwireUnique.map(r => `| ${r.score} | ${r.title} | ${r.location} |`).join('\n')}

## Work-auth

US national-security adjacent roles often require US person / clearance. EU sites (Belgium/Luxembourg) may be more accessible — verify each JD.
`,
}));

console.log(JSON.stringify({ ok: true, results }, null, 2));
