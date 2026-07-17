#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import {
  deleteConsiderJob,
  upsertConsiderJob,
  syncConsiderJobsToDashboard,
  slugify,
} from '../WEB-TRACKER/lib/jobs-to-consider-store.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const DATE = '2026-07-05';
const COMPANY = 'Apple';
const SEARCH_URL = 'https://jobs.apple.com/en-us/search?location=united-states-USA&team=internships-STDNT-INTRN+apple-support-college-program-STDNT-ACCP+acoustic-technologies-HRDWR-ACT+health-technology-HRDWR-HT+silicon-technologies-HRDWR-SILT+mechanical-engineering-HRDWR-ME+analog-and-digital-design-HRDWR-ADD+process-engineering-HRDWR-PE+sensor-technologies-HRDWR-SENT+system-design-and-test-engineering-HRDWR-SDE+display-technologies-HRDWR-DISP+battery-engineering-HRDWR-BE+camera-technologies-HRDWR-CAM';
const BATCH_DIR = join(ROOT, 'batch', 'apple');
const REPORTS_DIR = join(ROOT, 'reports');
const TRACKER_DIR = join(ROOT, 'batch', 'tracker-additions');
const MAX_PAGES = 80;
const DETAIL_CONCURRENCY = 8;
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';

mkdirSync(BATCH_DIR, { recursive: true });
mkdirSync(REPORTS_DIR, { recursive: true });
mkdirSync(TRACKER_DIR, { recursive: true });

const cv = read('cv.md');
const profile = read('config/profile.yml');
const profileMode = read('modes/_profile.md');
const digest = existsSync(join(ROOT, 'article-digest.md')) ? read('article-digest.md') : '';
const applications = existsSync(join(ROOT, 'data', 'applications.md')) ? read('data/applications.md') : '';

const appleVisaSources = [
  'Apple careers footer: https://jobs.apple.com/en-us/search?location=united-states-USA',
  'Apple LCA posting notices: https://lcaposting.fragomen.net/ClientLCAPostings.aspx?C=24&P=frTi40CwnSoh%7C1RmF%7C%2FWEA%3D%3D',
  'H1B Grader Apple Inc profile: https://h1bgrader.com/h1b-sponsors/apple-inc-6g06vq412q',
  'Ellis Apple Inc visa profile: https://www.ellis.com/visa-sponsors/apple-inc',
];

function read(path) {
  return readFileSync(join(ROOT, path), 'utf-8');
}

function cleanText(value = '') {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/[^\S\r\n]+/g, ' ')
    .replace(/\r\n/g, '\n')
    .trim();
}

function oneLine(value = '') {
  return cleanText(value).replace(/\s+/g, ' ').trim();
}

function htmlDecode(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function fetchText(url, { timeoutMs = 25000, retries = 2 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        signal: controller.signal,
        headers: {
          'user-agent': USER_AGENT,
          'accept-language': 'en-US,en;q=0.9',
        },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      lastErr = err;
      await new Promise(resolve => setTimeout(resolve, 600 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}

function pageUrl(pageNum) {
  if (pageNum === 1) return SEARCH_URL;
  return `${SEARCH_URL}&page=${pageNum}`;
}

function extractDetailLinks(html) {
  const links = new Set();
  const patterns = [
    /href="([^"]*\/en-us\/details\/[^"]+)"/g,
    /href=\\"([^"]*\/en-us\/details\/[^"\\]+)\\"/g,
    /(\/en-us\/details\/200[0-9]{6}-[0-9]{4}\/[^"'\\< ]+)/g,
  ];
  for (const pattern of patterns) {
    for (const match of html.matchAll(pattern)) {
      const raw = htmlDecode(match[1]).replace(/\\u0026/g, '&').replace(/\\\//g, '/');
      const absolute = raw.startsWith('http') ? raw : `https://jobs.apple.com${raw}`;
      links.add(absolute.split('#')[0]);
    }
  }
  return [...links].filter(link => /\/en-us\/details\/200[0-9]{6}-[0-9]{4}\//.test(link));
}

function extractDisplayedCount(html) {
  const text = htmlDecode(html.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ');
  const match = text.match(/([0-9,]+\+?)\s+Result\(s\)/i);
  return match ? match[1] : '';
}

function extractHydrationData(html) {
  const match = html.match(/window\.__staticRouterHydrationData\s*=\s*JSON\.parse\("((?:\\.|[^"\\])*)"\)/);
  if (!match) return null;
  const jsonText = JSON.parse(`"${match[1]}"`);
  return JSON.parse(jsonText);
}

function findJobDetails(obj) {
  if (!obj || typeof obj !== 'object') return null;
  if (obj.jobDetails?.jobsData) return obj.jobDetails.jobsData;
  for (const value of Object.values(obj)) {
    const found = findJobDetails(value);
    if (found) return found;
  }
  return null;
}

function extractJobNumberFromUrl(url) {
  return url.match(/\/details\/(200[0-9]{6}-[0-9]{4})\//)?.[1] || '';
}

async function crawlSearch() {
  const allLinks = new Map();
  const pages = [];
  let consecutiveNoNew = 0;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = pageUrl(page);
    const html = await fetchText(url);
    const links = extractDetailLinks(html);
    const displayedCount = extractDisplayedCount(html);
    let newCount = 0;
    for (const link of links) {
      const jobNumber = extractJobNumberFromUrl(link);
      if (!jobNumber) continue;
      if (!allLinks.has(jobNumber)) newCount += 1;
      allLinks.set(jobNumber, link);
    }
    pages.push({
      page,
      url,
      displayed_count: displayedCount,
      links_found: links.length,
      unique_new_links: newCount,
      unique_total: allLinks.size,
      sample: links.slice(0, 3),
    });
    console.log(`[apple] page ${page}: ${links.length} links, ${newCount} new, ${allLinks.size} total`);
    if (links.length === 0 || newCount === 0) consecutiveNoNew += 1;
    else consecutiveNoNew = 0;
    if (consecutiveNoNew >= 2) break;
  }

  return {
    search_url: SEARCH_URL,
    generated_at: new Date().toISOString(),
    pages,
    detail_links: [...allLinks.entries()].map(([job_number, url]) => ({ job_number, url })),
  };
}

async function crawlDetails(detailLinks) {
  const results = [];
  let index = 0;

  async function worker() {
    while (index < detailLinks.length) {
      const current = detailLinks[index++];
      try {
        const html = await fetchText(current.url);
        const hydration = extractHydrationData(html);
        const job = findJobDetails(hydration);
        if (!job) throw new Error('jobDetails.jobsData not found');
        results.push(normalizeJob(job, current.url, html));
      } catch (err) {
        results.push({
          job_number: current.job_number,
          url: current.url,
          crawl_error: err.message,
        });
      }
      if (results.length % 25 === 0) {
        console.log(`[apple] details ${results.length}/${detailLinks.length}`);
      }
    }
  }

  await Promise.all(Array.from({ length: DETAIL_CONCURRENCY }, () => worker()));
  return results.sort((a, b) => (a.job_number || '').localeCompare(b.job_number || ''));
}

function normalizeJob(job, url, html) {
  const local = job.localizations?.en_US?.posting || {};
  const minimumQualifications = cleanText(job.minimumQualifications || local.minimumQualifications || '');
  const preferredQualifications = cleanText(job.preferredQualifications || local.preferredQualifications || '');
  const responsibilities = cleanText(job.responsibilities || local.responsibilities || '');
  const description = cleanText(job.description || local.description || '');
  const summary = cleanText(job.jobSummary || local.jobSummary || '');
  const additionalRequirements = cleanText(job.additionalRequirements || local.additionalRequirements || '');
  const fullText = [
    job.postingTitle,
    summary,
    description,
    responsibilities,
    minimumQualifications,
    preferredQualifications,
    additionalRequirements,
    job.highJobTitle,
    job.lowJobTitle,
  ].filter(Boolean).join('\n\n');

  return {
    job_number: job.jobNumber || extractJobNumberFromUrl(url),
    base_role_number: (job.jobNumber || '').split('-')[0],
    title: cleanText(job.postingTitle || ''),
    transformed_title: cleanText(job.transformedPostingTitle || ''),
    url,
    apply_control_present: /Submit Resume/i.test(html),
    team: Array.isArray(job.teamNames) ? job.teamNames.join(', ') : cleanText(job.teamNames || ''),
    location: (job.locations || []).map(loc => loc.name).filter(Boolean).join('; '),
    locations: (job.locations || []).map(loc => ({
      name: loc.name,
      city: loc.city,
      state: loc.stateProvince,
      country: loc.countryName,
      posting_identifier: loc.postingIdentifier,
    })),
    posted_date: job.postingDateMeta || String(job.postDateInGMT || '').slice(0, 10),
    employment_type: cleanText(job.employmentType || job.jobType || ''),
    high_job_title: cleanText(job.highJobTitle || ''),
    low_job_title: cleanText(job.lowJobTitle || ''),
    summary,
    description,
    responsibilities,
    minimum_qualifications: minimumQualifications,
    preferred_qualifications: preferredQualifications,
    additional_requirements: additionalRequirements,
    posting_footers: cleanText((job.postingFooters || []).join('\n')),
    full_text: cleanText(fullText),
  };
}

function groupRoleVariants(details) {
  const groups = new Map();
  for (const job of details.filter(job => !job.crawl_error)) {
    const key = `${job.base_role_number || job.job_number.split('-')[0]}::${slugify(job.title)}`;
    if (!groups.has(key)) {
      groups.set(key, {
        ...job,
        group_key: key,
        urls: [],
        role_numbers: [],
        location_variants: [],
      });
    }
    const group = groups.get(key);
    group.urls.push(job.url);
    group.role_numbers.push(job.job_number);
    if (job.location) group.location_variants.push(job.location);
    group.apply_control_present = group.apply_control_present || job.apply_control_present;
  }

  return [...groups.values()].map(group => ({
    ...group,
    url: group.urls[0],
    role_numbers: [...new Set(group.role_numbers)],
    urls: [...new Set(group.urls)],
    location_variants: [...new Set(group.location_variants)].sort(),
    location: [...new Set(group.location_variants)].sort().join(' / '),
  }));
}

const positiveTerms = [
  ['validation', 0.55],
  ['validate', 0.45],
  ['test', 0.55],
  ['testing', 0.55],
  ['quality', 0.45],
  ['reliability', 0.45],
  ['failure analysis', 0.5],
  ['root cause', 0.35],
  ['automation', 0.45],
  ['fixture', 0.35],
  ['lab', 0.35],
  ['prototype', 0.35],
  ['prototyping', 0.35],
  ['hardware', 0.45],
  ['sensor', 0.55],
  ['sensing', 0.5],
  ['system integration', 0.5],
  ['systems integration', 0.5],
  ['mechanical', 0.35],
  ['product design', 0.35],
  ['acoustic', 0.45],
  ['camera', 0.35],
  ['battery', 0.35],
  ['display', 0.25],
  ['health', 0.25],
  ['rf', 0.2],
  ['wireless', 0.25],
  ['electromagnetic', 0.25],
  ['firmware', 0.25],
  ['data analysis', 0.25],
  ['statistical', 0.2],
  ['calibration', 0.5],
  ['instrumentation', 0.65],
  ['analog', 0.2],
  ['adc', 0.35],
  ['fpga', 0.4],
  ['signal processing', 0.35],
  ['daq', 0.6],
];

const strongTitleTerms = [
  ['quality engineer', 0.7],
  ['test engineer', 0.8],
  ['validation engineer', 0.8],
  ['reliability engineer', 0.65],
  ['system integration', 0.65],
  ['systems integration', 0.65],
  ['product design engineer', 0.35],
  ['hardware system', 0.55],
  ['wireless systems engineer', 0.25],
  ['sensor', 0.45],
  ['sensing', 0.45],
  ['acoustic', 0.45],
];

const negativeTerms = [
  ['manager', 1.4],
  ['director', 1.7],
  ['senior manager', 1.8],
  ['technician', 1.1],
  ['specialist', 0.8],
  ['staff', 0.8],
  ['principal', 1.0],
  ['lead ', 0.8],
  ['serdes', 1.0],
  ['layout', 0.9],
  ['physical design', 0.9],
  ['asic', 0.75],
  ['soc', 0.5],
  ['gpu', 0.7],
  ['cpu', 0.7],
  ['silicon', 0.45],
  ['machine learning', 0.6],
  ['data scientist', 0.65],
  ['software engineer', 0.75],
  ['program manager', 1.0],
  ['epm', 0.9],
  ['marketing', 1.5],
  ['legal', 1.5],
  ['support college program', 2.0],
  ['retail', 1.4],
];

function occurrences(text, term) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return (text.match(new RegExp(`\\b${escaped}\\b`, 'gi')) || []).length;
}

function scoreRole(job) {
  const title = job.title.toLowerCase();
  const text = `${job.title}\n${job.full_text}`.toLowerCase();
  const minq = job.minimum_qualifications.toLowerCase();
  const evidence = [];
  const flags = [];
  let score = 2.0;
  let technical = 2.0;

  for (const [term, weight] of positiveTerms) {
    const count = occurrences(text, term);
    if (count > 0) {
      const add = Math.min(weight * count, weight * 2);
      score += add;
      technical += add;
      evidence.push(term);
    }
  }
  for (const [term, weight] of strongTitleTerms) {
    if (title.includes(term)) {
      score += weight;
      technical += weight;
      evidence.push(`title:${term}`);
    }
  }
  for (const [term, penalty] of negativeTerms) {
    if (text.includes(term)) {
      score -= penalty;
      flags.push(term);
    }
  }

  const years = [...minq.matchAll(/(\d+)\+?\s+years?/g)].map(match => Number(match[1]));
  const maxYears = years.length ? Math.max(...years) : 0;
  if (maxYears >= 8) {
    score -= 1.0;
    flags.push(`${maxYears}+ years`);
  } else if (maxYears >= 5) {
    score -= 0.55;
    flags.push(`${maxYears}+ years`);
  }

  if (/internship|intern\b/i.test(title) || /currently pursuing|returning to school|enrolled/i.test(text)) {
    score -= 1.1;
    flags.push('internship/student-status risk');
  }

  const visa = assessVisa(job);
  if (visa.verdict === 'SKIP') score = Math.min(score, 2.0);
  else if (visa.verdict === 'Caution') score -= 0.2;

  score = Math.max(1, Math.min(5, score));
  technical = Math.max(1, Math.min(5, technical));

  let recommendation = 'SKIP';
  if (visa.verdict === 'SKIP') recommendation = 'SKIP';
  else if (score >= 4.0) recommendation = 'APPLY';
  else if (score >= 3.5) recommendation = 'CONSIDER';
  else if (score >= 3.0) recommendation = 'STRETCH';

  const fitSummary = buildFitSummary(job, score, recommendation, evidence, flags, visa);
  return {
    ...job,
    score: Number(score.toFixed(1)),
    technical_fit: Number(technical.toFixed(1)),
    recommendation,
    evidence: [...new Set(evidence)].slice(0, 12),
    flags: [...new Set(flags)].slice(0, 10),
    visa,
    legitimacy: job.apply_control_present ? 'High Confidence' : 'Proceed with Caution',
    fit_summary: fitSummary,
  };
}

function assessVisa(job) {
  const text = `${job.title}\n${job.full_text}\n${job.posting_footers}`.toLowerCase();
  const hard = [
    'u.s. citizen',
    'us citizen',
    'u.s. person',
    'us person',
    'security clearance',
    'secret clearance',
    'ts/sci',
    'itar',
  ].filter(term => text.includes(term));
  if (hard.length) {
    return {
      verdict: 'SKIP',
      restriction_level: 'Hard Block',
      reason: `Potential hard work-authorization/export-control language detected: ${hard.join(', ')}`,
      sponsorship: 'Apple is an active H-1B sponsor, but hard restrictions override sponsorship.',
    };
  }
  const soft = ['export control', 'export-controlled', 'ear', 'deemed export'].filter(term => text.includes(term));
  if (soft.length) {
    return {
      verdict: 'Caution',
      restriction_level: 'Soft Block',
      reason: `Export-control language should be clarified early: ${soft.join(', ')}`,
      sponsorship: 'Apple has substantial H-1B filing history; role-specific access still needs confirmation.',
    };
  }
  return {
    verdict: 'Clear',
    restriction_level: 'No Restriction Detected',
    reason: 'No citizenship, clearance, ITAR, or export-control restriction detected in captured JD text.',
    sponsorship: 'Apple appears to be an active H-1B sponsor based on public LCA data; sponsorship remains role/team-specific.',
  };
}

function buildFitSummary(job, score, recommendation, evidence, flags, visa) {
  const positives = evidence.filter(item => !item.startsWith('title:')).slice(0, 4).join(', ') || 'hardware relevance';
  const risks = flags.slice(0, 3).join(', ') || 'none obvious';
  if (recommendation === 'APPLY') {
    return `Strong Apple hardware fit: ${positives}. Main risks: ${risks}. Visa: ${visa.verdict}.`;
  }
  if (recommendation === 'CONSIDER') {
    return `Borderline but useful Apple target: ${positives}. Main risks: ${risks}. Visa: ${visa.verdict}.`;
  }
  if (recommendation === 'STRETCH') {
    return `Stretch fit: some overlap through ${positives}, but risks include ${risks}.`;
  }
  return `Skip for now: mismatch or blocker. Signals: ${risks}.`;
}

function nextReportNumber() {
  const nums = readdirSync(REPORTS_DIR)
    .map(name => Number(name.match(/^(\d{3})-/)?.[1]))
    .filter(Number.isFinite);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function nextApplicationNumber() {
  const nums = [...applications.matchAll(/^\|\s*(\d+)\s*\|/gm)].map(match => Number(match[1])).filter(Number.isFinite);
  return nums.length ? Math.max(...nums) + 1 : 1;
}

function mdEscape(value = '') {
  return oneLine(value).replace(/\|/g, '\\|');
}

function tableRow(cells) {
  return `| ${cells.map(mdEscape).join(' | ')} |`;
}

function scoreFmt(score) {
  return Number.isFinite(score) ? `${score.toFixed(1)}/5` : 'N/A';
}

function recommendationText(role) {
  if (role.recommendation === 'APPLY') return 'Apply after review; this is a high-signal Apple hardware/test target.';
  if (role.recommendation === 'CONSIDER') return 'Keep in Jobs to Consider; apply if the role details still feel attractive after review.';
  if (role.recommendation === 'STRETCH') return 'Do not prioritize unless there is a specific team/contact reason.';
  return 'Do not apply.';
}

function sourceLines() {
  return appleVisaSources.map(src => `- ${src}`).join('\n');
}

function writeMasterReport(scored, crawl, reportNum) {
  const apply = scored.filter(role => role.recommendation === 'APPLY');
  const consider = scored.filter(role => role.recommendation === 'CONSIDER');
  const rankedRows = scored.map((role, i) => tableRow([
    String(i + 1),
    role.title,
    role.location || 'Multiple',
    scoreFmt(role.score),
    role.recommendation,
    role.visa.verdict,
    role.legitimacy,
    role.url,
  ])).join('\n');
  const skipDigest = scored
    .filter(role => ['SKIP', 'STRETCH'].includes(role.recommendation))
    .slice(0, 80)
    .map(role => `- ${role.title} (${scoreFmt(role.score)}): ${role.flags.slice(0, 4).join(', ') || 'low profile match'}`)
    .join('\n');
  const pageCount = crawl.pages.length;
  const displayed = crawl.pages.find(page => page.displayed_count)?.displayed_count || 'not parsed';

  const content = `# Apple - Full Portfolio Evaluation (${scored.length} unique role groups)

**Date:** ${DATE}
**Company:** Apple
**Board:** ${SEARCH_URL}
**Displayed Result Count:** ${displayed}
**Crawled Pages:** ${pageCount}
**Legitimacy:** High Confidence for roles with captured detail page and Submit Resume marker
**Visa:** Apple has substantial public H-1B/LCA history; each role still needs team-specific sponsorship confirmation

---

## Executive Summary

The supplied Apple search is broad and currently resolves to ${scored.length} unique role groups after location variants are merged. Harsh's strongest matches are hardware validation, quality, sensor/input-device testing, systems integration, reliability, and lab automation roles. Pure silicon layout/SerDes, manager, retail/support, and active-student internship roles are poor uses of application effort.

### Apply Shortlist

| Priority | Role | Location | Score | Why |
|---|---|---|---|---|
${apply.slice(0, 20).map((role, i) => tableRow([String(i + 1), role.title, role.location || 'Multiple', scoreFmt(role.score), role.fit_summary])).join('\n') || '| - | No apply-grade roles found | - | - | - |'}

### Consider

| Priority | Role | Location | Score | Why |
|---|---|---|---|---|
${consider.slice(0, 20).map((role, i) => tableRow([String(i + 1), role.title, role.location || 'Multiple', scoreFmt(role.score), role.fit_summary])).join('\n') || '| - | No consider-grade roles found | - | - | - |'}

---

## Visa and Work Authorization

- Candidate status from profile: F-1 Student Visa on OPT; sponsorship needed.
- Apple appears to be an active H-1B sponsor based on public LCA data, including large Apple Inc. LCA filing counts in public sponsor databases.
- Apple careers pages state E-Verify participation in certain locations and link to LCA posting notices.
- Role-specific restrictions still win: if a detail page says U.S. person, citizenship, clearance, ITAR, or export-control access without sponsorship path, treat it as a skip or early HR question.

Sources used:
${sourceLines()}

---

## Full Ranking

| Rank | Role | Location | Score | Recommendation | Visa | Legitimacy | URL |
|---|---|---|---|---|---|---|---|
${rankedRows}

---

## Skip Digest

${skipDigest || 'No skip/stretch roles captured.'}
`;
  const filename = `${String(reportNum).padStart(3, '0')}-apple-portfolio-master-${DATE}.md`;
  writeFileSync(join(REPORTS_DIR, filename), content, 'utf-8');
  return { num: reportNum, filename, path: `reports/${filename}` };
}

function proofPointBullets(role) {
  const lower = role.full_text.toLowerCase();
  const points = [];
  if (/test|validation|quality|reliability|fixture|automation/.test(lower)) {
    points.push('LVACCS: Python/PyVISA high-voltage plasma-source test workflow, DAQ synchronization, FMEA, and repeatable lab execution.');
  }
  if (/sensor|sensing|signal|firmware|adc|fpga|data/.test(lower)) {
    points.push('FPGA SSD readout: ADC/sampling-rate sizing, Zynq/Vivado workflow, MATLAB HDL Coder co-simulation, and detector signal-chain reasoning.');
  }
  if (/calibration|instrument|acoustic|rf|wireless|measurement/.test(lower)) {
    points.push('Space instrumentation calibration: CEM/ESA calibration, SIMION/SRIM analysis, transmission-function extraction, and uncertainty-aware measurement interpretation.');
  }
  if (/system|integration|requirements|cross-functional/.test(lower)) {
    points.push('UOP/TestBedz: requirements traceability, subsystem trade studies, and environmental-test routing workflows.');
  }
  if (points.length === 0) {
    points.push('Relevant baseline: mechanical engineering foundation, space systems M.Eng, test automation, simulation, and hardware measurement experience.');
  }
  return points.slice(0, 4);
}

function reportRequirements(role) {
  const reqs = [];
  const text = role.full_text.toLowerCase();
  if (/test|validation|quality|reliability/.test(text)) reqs.push('Hardware validation, quality, reliability, or test execution');
  if (/automation|fixture|robotic|script|python/.test(text)) reqs.push('Automation, fixtures, scripting, or lab tooling');
  if (/sensor|sensing|signal|firmware|adc|fpga/.test(text)) reqs.push('Sensor/signal-chain, firmware-adjacent, FPGA, or data interpretation');
  if (/mechanical|product design|prototype/.test(text)) reqs.push('Mechanical/product design and prototype-to-production collaboration');
  if (/cross-functional|partner|factory|manufacturing/.test(text)) reqs.push('Cross-functional work with engineering, factory, or manufacturing teams');
  return reqs.length ? reqs : ['General hardware engineering execution'];
}

function writeRoleReport(role, reportNum) {
  const slug = slugify(role.title);
  const filename = `${String(reportNum).padStart(3, '0')}-apple-${slug}-${DATE}.md`;
  const reqs = reportRequirements(role);
  const proof = proofPointBullets(role);
  const content = `# Evaluation: Apple - ${role.title}

**Date:** ${DATE}
**Archetype:** ${detectArchetype(role)}
**Score:** ${scoreFmt(role.score)}
**URL:** ${role.url}
**Legitimacy:** ${role.legitimacy}
**Visa:** ${role.visa.verdict}${role.visa.verdict === 'Clear' ? '' : ` - ${role.visa.reason}`}
**PDF:** SKIP - no application pack requested in this scan

---

## A) Role Summary

| Field | Value |
|---|---|
| Company | Apple |
| Role | ${role.title} |
| Role numbers | ${role.role_numbers.join(', ')} |
| Location | ${role.location || 'Not captured'} |
| Team | ${role.team || 'Hardware'} |
| Posted | ${role.posted_date || 'Not captured'} |
| TL;DR | ${role.fit_summary} |

## B) Match With CV

| JD Requirement | Harsh Evidence |
|---|---|
${reqs.map((req, i) => tableRow([req, proof[i % proof.length]])).join('\n')}

**Gaps and mitigation:** ${role.flags.length ? role.flags.join(', ') : 'No major mismatch flags from lightweight scan.'} Position the application around measurement rigor, lab automation, and hardware validation rather than claiming direct Apple product-domain tenure.

## C) Level and Strategy

- Detected level: ${role.low_job_title || role.high_job_title || 'not explicitly captured'}.
- Natural positioning: early-career instrumentation-first systems/test engineer with hardware validation and DAQ automation evidence.
- Strategy: lead with LVACCS test automation, SSD readout-chain reasoning, and calibration/ion-optics proof points. Avoid overclaiming consumer electronics ownership.

## D) Compensation and Demand

- Apple is a large active hardware employer; current public visa databases show Apple Inc. has substantial H-1B/LCA activity.
- Compensation should be checked on the exact Apple posting/application flow before negotiation because Apple detail pages may vary by location and level.
- Sources: ${appleVisaSources.join('; ')}

## E) Personalization Plan

| Section | Change |
|---|---|
| Summary | Lead with hardware validation, instrumentation, DAQ/test automation, and measurement-chain rigor. |
| Experience | Put LVACCS and FPGA SSD readout above less relevant simulation-only work. |
| Projects | Include calibration/ion-optics only where the role mentions sensing, signal quality, measurement, or validation. |
| Gaps | Explain consumer-product domain as new, but hardware validation discipline as directly transferable. |

## F) Interview Plan

| Topic | Story |
|---|---|
| Lab validation | LVACCS 1300 V hollow-cathode plasma-source test workflow and synchronized logging. |
| Signal-chain reasoning | FPGA SSD readout chain, ADC/sampling-rate sizing, and detector energy-resolution targets. |
| Calibration rigor | CEM/ESA calibration and SIMION/SRIM uncertainty-aware analysis. |
| Systems tradeoffs | UOP communications subsystem and TestBedz requirement-flowdown workflows. |

## G) Posting Legitimacy

**Assessment:** ${role.legitimacy}

| Signal | Finding | Weight |
|---|---|---|
| Detail page | Captured Apple detail-page JSON for ${role.role_numbers.join(', ')} | Positive |
| Apply marker | ${role.apply_control_present ? 'Submit Resume marker detected' : 'Submit marker not captured'} | ${role.apply_control_present ? 'Positive' : 'Neutral'} |
| Freshness | Posted ${role.posted_date || 'date unavailable'} | Neutral |

## H) Visa and Work Authorization

**JD Restriction Level:** ${role.visa.restriction_level}
**Restriction Evidence:** ${role.visa.reason}
**Company Sponsorship History:** Active sponsor signal - public LCA databases show substantial Apple Inc. H-1B/LCA filing activity.
**Verdict:** ${role.visa.verdict}
**Reason:** ${role.visa.sponsorship}

---

## Keywords Extracted

${role.evidence.map(item => `- ${item}`).join('\n') || '- hardware\n- validation\n- test'}
`;
  writeFileSync(join(REPORTS_DIR, filename), content, 'utf-8');
  return { num: reportNum, filename, path: `reports/${filename}` };
}

function detectArchetype(role) {
  const text = `${role.title} ${role.full_text}`.toLowerCase();
  if (/sensor|sensing|calibration|instrumentation|signal|measurement/.test(text)) return 'General instrumentation / test / hardware / DAQ';
  if (/system integration|systems integration|requirements|cross-functional/.test(text)) return 'Space Instrumentation / Payload-adjacent Systems';
  if (/mechanical|product design|prototype/.test(text)) return 'Mechanical / aerospace hardware adjacent';
  if (/software|firmware|automation|tooling/.test(text)) return 'Software-heavy test tooling';
  return 'Hardware evaluation';
}

function selectShortlist(scored) {
  const titleInclude = /(test|validation|quality|system integration|systems integration|calibration|instrumentation|metrology|sensing|sensor|hardware systems|lab operations|tools and automation|mechatronics|optoelectronic test|photonics test|prototyping system|reliability)/i;
  const titleExclude = /(technician|manager|director|lead|architect|internship|intern\b|serdes|analog ic|circuit design|mixed signal|pmu|cpu|gpu|rtl|ddr|nand|soc|software engineer|data scientist|machine learning|program manager|\bepm\b|specialist)/i;
  const candidates = scored
    .filter(role => ['APPLY', 'CONSIDER'].includes(role.recommendation))
    .filter(role => role.score >= 3.5)
    .filter(role => role.visa.verdict !== 'SKIP')
    .filter(role => titleInclude.test(role.title))
    .filter(role => !titleExclude.test(role.title));

  if (candidates.length > 0) return candidates.slice(0, 10);

  return scored
    .filter(role => ['APPLY', 'CONSIDER'].includes(role.recommendation))
    .filter(role => role.visa.verdict !== 'SKIP')
    .slice(0, 10);
}

function writeTrackerTsv(num, role, reportPath, pdf = '❌') {
  const status = role.recommendation === 'SKIP' ? 'SKIP' : 'Evaluated';
  const score = Number.isFinite(role.score) ? scoreFmt(role.score) : 'N/A';
  const reportName = basename(reportPath);
  const reportNum = reportName.match(/^(\d{3})-/)?.[1] || String(num);
  const line = [
    num,
    DATE,
    COMPANY,
    role.title,
    status,
    score,
    pdf,
    `[${Number(reportNum)}](${reportPath})`,
    role.fit_summary || role.notes || '',
  ].join('\t');
  const filename = `${String(num).padStart(3, '0')}-apple-${slugify(role.title)}.tsv`;
  writeFileSync(join(TRACKER_DIR, filename), `${line}\n`, 'utf-8');
}

function updateDashboard(shortlist, masterReport, roleReports) {
  for (const id of ['apple-portfolio-2026-07-05']) {
    deleteConsiderJob({ id }, undefined, { missingOk: true });
  }

  upsertConsiderJob({
    id: `apple-portfolio-${DATE}`,
    company: COMPANY,
    title: `Full Portfolio Scan (${shortlist.length} shortlisted from Apple crawl)`,
    url: SEARCH_URL,
    location: 'United States',
    status: 'to_consider',
    score: '',
    fit_summary: 'Apple hardware portfolio scan; dashboard entries added only for apply/consider targets.',
    recommendation: 'Review shortlisted Apple roles before generating application packs.',
    notes: `${shortlist.length} Apple roles shortlisted; full ranking in master report.`,
    source: 'career_ops_evaluation',
    h1b_status: 'Active sponsor signal from public LCA data',
    h1b_sponsorship: 'Likely possible for technical roles; confirm per role',
    green_card_sponsorship: 'Public PERM history exists; confirm timing with recruiter',
    export_control: 'No company-wide hard block assumed',
    export_control_risk: 'Check role text for U.S. person/export-control language',
    liveness: 'active',
    liveness_reason: 'Apple careers search and detail pages captured during portfolio scan',
    resources: { report_md: masterReport.path },
  });

  for (const role of shortlist) {
    const report = roleReports.get(role.group_key);
    upsertConsiderJob({
      id: `apple-${slugify(role.title)}-${role.base_role_number || role.role_numbers[0]}`,
      company: COMPANY,
      title: role.title,
      url: role.url,
      location: role.location || 'United States',
      team: role.team || 'Hardware',
      status: 'to_consider',
      score: scoreFmt(role.score),
      fit_summary: role.fit_summary,
      recommendation: recommendationText(role),
      notes: `${role.recommendation}; role numbers: ${role.role_numbers.join(', ')}`,
      source: 'career_ops_evaluation',
      h1b_status: 'Active sponsor signal from public LCA data',
      h1b_sponsorship: role.visa.verdict === 'SKIP' ? 'Blocked by role restriction' : 'Likely possible for technical roles; confirm per role',
      green_card_sponsorship: 'Public PERM history exists; confirm timing with recruiter',
      export_control: role.visa.restriction_level,
      export_control_risk: role.visa.reason,
      opt_story_strength: role.recommendation === 'APPLY' ? 'strong' : 'medium',
      adjacent_fields: ['hardware validation', 'instrumentation', 'test automation'].filter(field => role.full_text.toLowerCase().includes(field.split(' ')[0])),
      liveness: role.apply_control_present ? 'active' : 'uncertain',
      liveness_reason: role.apply_control_present ? 'Apple detail page contains Submit Resume marker' : 'Detail JSON captured but submit marker not detected',
      resources: {
        report_md: report?.path || masterReport.path,
        portfolio_report_md: masterReport.path,
      },
    });
  }
  syncConsiderJobsToDashboard();
}

function existingAppleRoles() {
  const rows = [...applications.matchAll(/^\|\s*\d+\s*\|\s*[^|]+\|\s*Apple\s*\|\s*([^|]+)\|/gim)];
  return rows.map(match => oneLine(match[1]));
}

function writeJson(name, data) {
  const path = join(BATCH_DIR, name);
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf-8');
  return path;
}

async function main() {
  console.log(`[apple] existing Apple tracker roles: ${existingAppleRoles().length}`);
  const searchRawPath = join(BATCH_DIR, `apple-search-raw-${DATE}.json`);
  const detailRawPath = join(BATCH_DIR, `apple-detail-raw-${DATE}.json`);
  const crawl = existsSync(searchRawPath)
    ? JSON.parse(readFileSync(searchRawPath, 'utf-8'))
    : await crawlSearch();
  if (!existsSync(searchRawPath)) writeJson(`apple-search-raw-${DATE}.json`, crawl);
  const details = existsSync(detailRawPath)
    ? JSON.parse(readFileSync(detailRawPath, 'utf-8'))
    : await crawlDetails(crawl.detail_links);
  if (!existsSync(detailRawPath)) writeJson(`apple-detail-raw-${DATE}.json`, details);
  console.log(`[apple] using ${crawl.detail_links.length} detail links and ${details.length} detail records`);

  const grouped = groupRoleVariants(details);
  const scored = grouped.map(scoreRole).sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.title.localeCompare(b.title);
  });
  const manifest = {
    date: DATE,
    company: COMPANY,
    source_url: SEARCH_URL,
    crawled_detail_links: crawl.detail_links.length,
    detail_errors: details.filter(job => job.crawl_error).length,
    unique_role_groups: scored.length,
    recommendations: scored.reduce((acc, role) => {
      acc[role.recommendation] = (acc[role.recommendation] || 0) + 1;
      return acc;
    }, {}),
    roles: scored,
  };
  writeJson(`apple-normalized-roles-${DATE}.json`, grouped);
  writeJson(`apple-scoring-manifest-${DATE}.json`, manifest);

  let reportNum = nextReportNumber();
  const masterReport = writeMasterReport(scored, crawl, reportNum++);
  const shortlist = selectShortlist(scored);
  const roleReports = new Map();
  for (const role of shortlist) {
    roleReports.set(role.group_key, writeRoleReport(role, reportNum++));
  }

  let appNum = nextApplicationNumber();
  writeTrackerTsv(appNum++, {
    title: `Full Portfolio Scan (${scored.length} Apple role groups)`,
    recommendation: 'CONSIDER',
    score: NaN,
    fit_summary: `${shortlist.length} shortlisted roles from ${scored.length} Apple role groups; review master report before applying.`,
  }, masterReport.path);
  for (const role of shortlist) {
    const report = roleReports.get(role.group_key);
    writeTrackerTsv(appNum++, role, report.path);
  }

  updateDashboard(shortlist, masterReport, roleReports);

  console.log(`[apple] done`);
  console.log(`[apple] crawled links: ${crawl.detail_links.length}`);
  console.log(`[apple] unique role groups: ${scored.length}`);
  console.log(`[apple] shortlist: ${shortlist.length}`);
  console.log(`[apple] master report: ${masterReport.path}`);
}

main().catch(err => {
  console.error('[apple] fatal:', err);
  process.exit(1);
});
