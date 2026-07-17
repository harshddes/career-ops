#!/usr/bin/env node
/**
 * Build scored NAME faculty prospect records with rich lab/context summaries.
 * Sources: _name-faculty-raw.json + _name-faculty-profiles.json (+ optional deep research).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyResearchFitScoring } from '../lib/research-fit-scoring.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESEARCH_DIR = join(__dirname, '..', 'research');
const RESEARCH_DATE = '2026-07-09';
const SOURCE_REPORT = 'WEB-TRACKER/research/umich-name-faculty-prospects-2026.json';
const DIRECTORY_URL = 'https://name.engin.umich.edu/role/faculty';
const DEPARTMENT = 'Naval Architecture and Marine Engineering';

const SCORE_RULES = [
  {
    band: 'A',
    min: 4.0,
    max: 5.0,
    patterns: [
      /cavitation/i, /flow diagnos/i, /optical (flow|diagnos|measurement)/i, /experimental (fluid|hydro)/i,
      /multiphase/i, /data acquisition|\bDAQ\b/i,
      /towing tank/i, /marine hydrodynamics lab|\bMHL\b/i, /propulsor/i,
    ],
    vectors: ['optical diagnostics', 'experimental systems', 'DAQ', 'plasma diagnostics'],
  },
  {
    band: 'B',
    min: 3.0,
    max: 3.9,
    patterns: [
      /control/i, /autonomy|robot/i, /sensing|sensor|perception/i, /mechatronic/i,
      /marine renewable|energy harvest/i, /real-time control/i, /experimental/i,
      /power electronics|electric machine/i, /hydrodynamic/i, /wave energy|tidal/i,
      /hardware/i, /propulsion/i,
    ],
    vectors: ['controls', 'automation', 'DAQ', 'experimental systems'],
  },
  {
    band: 'C',
    min: 2.0,
    max: 2.9,
    patterns: [
      /ship design|set-based design/i, /structure/i, /CFD|computational/i,
      /optimization|MDO/i, /acoustics/i, /decarbonization|sustainability/i,
      /weld/i, /digital twin/i, /wave turbulence|ocean science/i,
    ],
    vectors: ['scientific computing', 'experimental systems', 'test engineering'],
  },
];

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function source(label, url, note = '') {
  return { type: 'source', label, url, date: RESEARCH_DATE, note };
}

function scoreProspect(text) {
  const hay = cleanText(text);
  for (const rule of SCORE_RULES) {
    const hits = rule.patterns.filter(re => re.test(hay));
    if (!hits.length) continue;
    const span = rule.max - rule.min;
    const intensity = Math.min(1, hits.length / 4);
    const score = Number((rule.min + span * (0.35 + 0.65 * intensity)).toFixed(1));
    return {
      score: Math.min(rule.max, Math.max(rule.min, score)),
      tier: rule.band,
      vectors: rule.vectors,
      band: rule.band,
    };
  }
  return { score: 1.7, tier: 'D', vectors: ['experimental systems'], band: 'D' };
}

function focusSlug(keywords) {
  return cleanText(keywords[0] || 'research')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28) || 'research';
}

function fitRationale(profile, scoreInfo) {
  const topic = (profile.keywords || []).slice(0, 3).join(', ') || 'marine engineering';
  if (scoreInfo.band === 'A') {
    return `Strong experimental/diagnostics overlap with NAME work on ${topic}. Maps to optical/flow diagnostics, cavitation/multiphase experiments, MHL instrumentation, vacuum/DAQ discipline, and test-rig operations from a plasma instrumentation background.`;
  }
  if (scoreInfo.band === 'B') {
    return `Open-minded transfer fit via ${topic}. Controls, sensing, real-time DAQ, mechatronics, or experimental marine energy systems can use instrumentation and automation skills even without identical marine-domain history.`;
  }
  if (scoreInfo.band === 'C') {
    return `Plausible stretch into ${topic}. Bridge through test engineering, data systems, modeling support, or experimental hardware rather than claiming naval-architecture mastery.`;
  }
  return `Research-active NAME contact (${topic}), but transfer from plasma/diagnostics is weak. Keep as low-priority network node after reading a recent paper.`;
}

function outreachAngle(profile, scoreInfo) {
  const lab = profile.lab || 'their group';
  const topic = (profile.keywords || [])[0] || 'marine experimental systems';
  if (scoreInfo.band === 'A') {
    return `Lead with experimental diagnostics, synchronized DAQ, and test-facility operations applied to ${lab} work on ${topic}.`;
  }
  if (scoreInfo.band === 'B') {
    return `Frame around instrumentation, controls/automation, and hardware-in-the-loop data acquisition supporting ${lab} on ${topic}.`;
  }
  if (scoreInfo.band === 'C') {
    return `Ask about experimental or data bottlenecks in ${lab}; offer instrumentation/DAQ/test-engineering support without overclaiming domain expertise.`;
  }
  return `Only outreach after reading a recent paper; ask one specific question about ${topic}.`;
}

function likelyRoute(scoreInfo) {
  if (scoreInfo.band === 'A' || scoreInfo.band === 'B') {
    return 'Research staff, research area specialist, lab engineer, or RA supporting experimental marine systems / MHL-adjacent work.';
  }
  if (scoreInfo.band === 'C') {
    return 'Exploratory RA / research support conversation; confirm funding and role family first.';
  }
  return 'Low-priority informational contact only.';
}

function buildProspect(person, profile, mhl) {
  const keywords = (profile.keywords || []).slice(0, 8);
  const methods = (profile.methods || []).slice(0, 6);
  const summary = cleanText(profile.summary);
  const lab = cleanText(profile.lab) || keywords.slice(0, 2).join(' / ') || 'NAME research group';
  const labUrl = cleanText(profile.lab_url);
  const scoreInfo = scoreProspect([summary, lab, keywords.join(' '), methods.join(' '), person.title].join(' '));
  const id = `umich-name-${person.slug}-${focusSlug(keywords)}`;
  const email = cleanText(profile.contact_email);
  const facilities = [];
  if (/mhl|marine hydrodynamics/i.test(`${lab} ${summary}`)) {
    facilities.push(...(mhl.facilities || []));
  }
  if (lab && !facilities.includes(lab)) facilities.unshift(lab);

  const evidence = [
    source('NAME faculty profile', person.profile_url),
    source('NAME faculty directory', DIRECTORY_URL),
  ];
  if (labUrl) evidence.push(source(lab, labUrl));
  if (/mhl|marine hydrodynamics/i.test(`${lab} ${summary}`)) {
    evidence.push(source(mhl.name, mhl.url, mhl.summary));
  }

  const uncertainty = [];
  if (!email) uncertainty.push('Email missing or Cloudflare-protected on profile; verify before outreach.');
  if (profile.email_uncertain) uncertainty.push('Email inferred/uncertain; verify on official profile before outreach.');
  uncertainty.push('Confirm current hiring appetite and a recent paper before outreach.');

  return applyResearchFitScoring({
    id,
    name: person.name,
    title: cleanText(person.title).slice(0, 200),
    unit: 'Michigan Engineering',
    department: DEPARTMENT,
    lab,
    role_type: 'faculty_or_research_staff',
    campus: 'Ann Arbor',
    profile_url: person.profile_url,
    lab_url: labUrl,
    contact_email: email,
    contact_page: person.profile_url,
    phone: cleanText(profile.phone),
    research_keywords: keywords.length ? keywords : ['naval architecture', 'marine engineering'],
    methods: methods.length ? methods : ['marine engineering research'],
    facilities: [...new Set(facilities)].slice(0, 6),
    transfer_vectors: scoreInfo.vectors,
    hiring_signals: [],
    evidence,
    score: scoreInfo.score,
    tier: scoreInfo.tier,
    priority: scoreInfo.tier,
    fit_rationale: fitRationale(profile, scoreInfo),
    outreach_angle: outreachAngle(profile, scoreInfo),
    likely_route: likelyRoute(scoreInfo),
    opt_h1b_notes: 'University research roles can be cap-exempt H-1B candidates, but timeline must be raised early.',
    uncertainty_notes: uncertainty.join(' '),
    research_interests_summary: summary || `${person.name} is listed as ${person.title} in NAME. Verify research details on ${person.profile_url} before outreach.`,
    recent_publication: '',
    status: 'not_contacted',
    source_report: SOURCE_REPORT,
    first_seen: `${RESEARCH_DATE}T00:00:00.000Z`,
  });
}

function main() {
  const raw = JSON.parse(readFileSync(join(RESEARCH_DIR, '_name-faculty-raw.json'), 'utf8'));
  const profilesDoc = JSON.parse(readFileSync(join(RESEARCH_DIR, '_name-faculty-profiles.json'), 'utf8'));
  const mhl = profilesDoc.mhl || {};
  const profiles = profilesDoc.profiles || {};
  const active = (raw.active || []).filter(p => !p.emeritus && !p.lecturer_only && !p.adjunct);

  const missing = active.filter(p => !profiles[p.slug]);
  if (missing.length) {
    console.error('Missing profile enrichment for:', missing.map(p => p.slug).join(', '));
    process.exitCode = 1;
    return;
  }

  // Prefer known emails from existing U-M store when NAME profile email is empty.
  // Match by normalized last-token + first-token to catch Steve/Steven Ceccio style variants.
  function nameKey(name) {
    const parts = cleanText(name).toLowerCase().replace(/[^a-z\s]/g, ' ').split(/\s+/).filter(Boolean);
    if (parts.length < 2) return parts.join(' ');
    return `${parts[parts.length - 1]}|${parts[0]}`;
  }
  const meByName = new Map();
  const umichPath = join(RESEARCH_DIR, '..', '..', 'data', 'umich-research-prospects.json');
  if (existsSync(umichPath)) {
    const store = JSON.parse(readFileSync(umichPath, 'utf8'));
    for (const p of store.prospects || []) {
      if (!p.contact_email) continue;
      meByName.set(String(p.name).toLowerCase(), p.contact_email);
      meByName.set(nameKey(p.name), p.contact_email);
    }
  }

  const prospects = active.map(person => {
    const profile = { ...profiles[person.slug] };
    if (!profile.contact_email) {
      profile.contact_email = meByName.get(person.name.toLowerCase())
        || meByName.get(nameKey(person.name))
        || '';
    }
    return buildProspect(person, profile, mhl);
  });

  prospects.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
  const byTier = prospects.reduce((acc, p) => {
    acc[p.tier] = (acc[p.tier] || 0) + 1;
    return acc;
  }, {});

  const out = {
    scope: 'University of Michigan Naval Architecture and Marine Engineering active faculty prospects',
    research_date: RESEARCH_DATE,
    source_report: SOURCE_REPORT,
    directory_url: DIRECTORY_URL,
    mhl,
    inclusion: 'Professor / Associate / Assistant / research faculty-scientist ranks + research-active Engineering Practice; exclude emeritus, LEO lecturers, adjuncts',
    counts: {
      total: prospects.length,
      with_email: prospects.filter(p => p.contact_email).length,
      with_lab_url: prospects.filter(p => p.lab_url).length,
      with_rich_summary: prospects.filter(p => (p.research_interests_summary || '').length >= 80).length,
      by_tier: byTier,
    },
    prospects,
  };

  const outPath = join(RESEARCH_DIR, 'umich-name-faculty-prospects-2026.json');
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${prospects.length} NAME prospects -> ${outPath}`);
  console.log(`Tier summary: ${JSON.stringify(byTier)}`);
  console.log(`Emails: ${out.counts.with_email}; lab URLs: ${out.counts.with_lab_url}; rich summaries: ${out.counts.with_rich_summary}`);
  for (const p of prospects.slice(0, 8)) {
    console.log(`${p.score}/${p.tier} ${p.name} | ${p.lab}`);
  }
}

main();
