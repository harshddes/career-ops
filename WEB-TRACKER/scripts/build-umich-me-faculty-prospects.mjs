#!/usr/bin/env node
/**
 * Build scored ME faculty prospect records from:
 * - WEB-TRACKER/research/_me-faculty-raw.json (directory extract)
 * - WEB-TRACKER/research/umich-me-faculty-roster-2026.json (deep research)
 *
 * Honesty: emails/labs/keywords only from those sources. No invented pubs.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyResearchFitScoring } from '../lib/research-fit-scoring.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESEARCH_DIR = join(__dirname, '..', 'research');
const RESEARCH_DATE = '2026-07-09';
const SOURCE_REPORT = 'WEB-TRACKER/research/umich-me-faculty-prospects-2026.json';
const DIRECTORY_URL = 'https://me.engin.umich.edu/people/faculty';

const STABLE_IDS = {
  'daniel-bruder': 'umich-daniel-bruder-controls',
  'volker-sick': 'umich-volker-sick-optical-diagnostics',
  'margaret-wooldridge': 'umich-margaret-wooldridge-combustion',
  'eric-johnsen': 'umich-eric-johnsen-me',
};

/** Ionized-gas / space / fusion plasma — NOT blood plasma. */
const SPACE_PLASMA_PATTERNS = [
  /non[-\s]?thermal plasma/i,
  /low[-\s]?temperature plasma/i,
  /plasma diagnos/i,
  /plasma physic/i,
  /plasma (jet|source|discharge|processing)/i,
  /microplasma|microdischarge/i,
  /pulsed power/i,
  /high.?energy.?density/i,
  /electric propulsion/i,
  /ion thruster/i,
  /laser[-\s]?plasma/i,
  /hollow[-\s]?cathode/i,
];

const SCORE_RULES = [
  {
    band: 'A',
    min: 4.0,
    max: 5.0,
    patterns: [
      ...SPACE_PLASMA_PATTERNS,
      /optical diagnos/i, /laser diagnos/i,
      /laser-based diagnos/i, /optical (flow |measurement|diagnos)/i,
      /\bcombustion\b/i, /spectroscop/i, /optical flow measurement/i,
      /electrical and radiation based tomography/i,
      /vacuum chamber/i,
    ],
    vectors: ['plasma diagnostics', 'optical diagnostics', 'experimental systems', 'DAQ'],
  },
  {
    band: 'B',
    min: 3.0,
    max: 3.9,
    patterns: [
      /optical/i, /laser/i, /diagnos/i, /instrument/i, /sensor/i, /sensing/i, /daq/i,
      /data acquisition/i, /control/i, /automation/i, /mechatronic/i, /experimental fluid/i,
      /multiphase/i, /cavitation/i, /process monitoring/i, /in-situ/i, /in situ/i,
      /manufacturing/i, /additive manufacturing/i, /weld monitoring/i, /metrology/i,
      /computed tomography/i, /tomograph/i, /inspection/i,
      /vacuum/i, /electron microscop/i, /nanomanufactur/i, /photonic/i, /photoacoustic/i,
      /propulsion/i, /turbomachinery/i, /aerospace/i, /deployable/i, /high.?voltage/i,
      /test (rig|platform|bed)/i, /robotic/i, /fpga/i, /real-time control/i,
      /heat transfer/i, /phase-change/i, /energy storage/i, /fuel cell/i, /battery/i,
      /reactive gas/i, /semiconductor manufacturing/i, /precision machining/i,
      /\bmems\b/i, /biomems/i, /detector/i, /microsystem/i,
    ],
    vectors: ['controls', 'automation', 'DAQ', 'experimental systems'],
  },
  {
    band: 'C',
    min: 2.0,
    max: 2.9,
    patterns: [
      /fluid/i, /thermal/i, /heat/i, /solid mechanics/i, /materials/i, /design/i,
      /dynamics/i, /vibration/i, /biomechanic/i, /soft tissue/i, /computational/i,
      /cfd/i, /modeling/i, /simulation/i, /optimization/i, /robot/i, /haptic/i,
      /wearable/i, /smart material/i, /energy harvest/i, /wave energy/i,
      /hydrodynamic/i, /acoust/i, /metamaterial/i, /topology/i,
      /stem cell/i, /mechanobiology/i, /tissue engineer/i,
    ],
    vectors: ['experimental systems', 'scientific computing', 'test engineering'],
  },
];

const BLOOD_BIO_PLASMA_RE = /\b(?:blood\s+plasma|plasma\s+protein|platelet|hemostasis|coagulat|hematolog|blood\b)\b/i;
const BIOMED_DOMAIN_RE = /\b(?:biomedical|bioengineering|biomechanic|mechanobiology|stem\s+cell|tissue\s+engineer|rehab|medical\s+device|drug\s+transport|bacterial\s+biofilm)\b/i;

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48);
}

function source(label, url, note = '') {
  return { type: 'source', label, url, date: RESEARCH_DATE, note };
}

function parseDeepResearchEnrichment(deepPath) {
  const deep = JSON.parse(readFileSync(deepPath, 'utf8'));
  const content = deep?.output?.content || {};
  const blob = Object.values(content).join('\n\n');
  const bySlug = new Map();

  const blocks = blob.split(/\n(?=\d+\.\s+\*\*)/);
  for (const block of blocks) {
    const nameMatch = block.match(/\*\*([^*]+)\*\*/);
    const profileMatch = block.match(/https:\/\/me\.engin\.umich\.edu\/people\/faculty\/([a-z0-9-]+)\//i);
    if (!profileMatch) continue;
    const slug = profileMatch[1];
    const emailMatch = block.match(/([a-zA-Z0-9._%+-]+@(?:umich|med\.umich)\.edu)/);
    const labMatch = block.match(/Lab:\s*([^\n]+)/i);
    const keywordsMatch = block.match(/Keywords:\s*([^\n]+)/i);
    const methodsMatch = block.match(/Methods:\s*([^\n]+)/i);
    let lab = '';
    let labUrl = '';
    if (labMatch) {
      const labLine = labMatch[1].trim();
      if (!/^not listed/i.test(labLine)) {
        const urlInLab = labLine.match(/(https?:\/\/\S+)/);
        labUrl = urlInLab ? urlInLab[1].replace(/[).,;]+$/, '') : '';
        lab = labLine.replace(/https?:\/\/\S+/g, '').replace(/\s*-\s*$/, '').trim();
      }
    }
    bySlug.set(slug, {
      name: nameMatch ? nameMatch[1].trim() : '',
      contact_email: emailMatch && !/not listed|not extracted/i.test(block.slice(Math.max(0, emailMatch.index - 40), emailMatch.index))
        ? emailMatch[1]
        : '',
      lab,
      lab_url: labUrl,
      keywords: keywordsMatch && !/not extracted/i.test(keywordsMatch[1])
        ? keywordsMatch[1].split(/,/).map(s => cleanText(s)).filter(Boolean).slice(0, 10)
        : [],
      methods: methodsMatch && !/not extracted|not specified/i.test(methodsMatch[1])
        ? methodsMatch[1].split(/,/).map(s => cleanText(s)).filter(Boolean).slice(0, 8)
        : [],
    });
  }
  return bySlug;
}

function stripTrailingNames(interests, allNames, selfName) {
  let text = cleanText(interests);
  if (!text) return '';
  const others = allNames
    .filter(n => n && n !== selfName)
    .sort((a, b) => b.length - a.length);
  for (const name of others) {
    const re = new RegExp(`\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\.?\\s*$`, 'i');
    if (re.test(text)) {
      text = text.replace(re, '').trim();
      break;
    }
  }
  // Drop bio lead-ins that are not interests
  text = text.replace(/^.*?research interests include\s+/i, '');
  text = text.replace(/^.*?earned his Ph\.?\s*D\.?.*?(?=[A-Z])/i, '');
  return cleanText(text).slice(0, 700);
}

function isUsableKeyword(value) {
  const text = cleanText(value);
  if (!text || text.length < 3 || text.length > 70) return false;
  if (/per profile|not extracted|not listed|detailed list|see profile|n\/a/i.test(text)) return false;
  return true;
}

function keywordsFromInterests(text, enrichedKeywords = []) {
  const fromEnrichment = (enrichedKeywords || []).map(cleanText).filter(isUsableKeyword).slice(0, 8);
  if (fromEnrichment.length) return fromEnrichment;
  if (!text) return ['mechanical engineering research'];
  const parts = text
    .split(/[;,]|\band\b/i)
    .map(s => cleanText(s).toLowerCase())
    .filter(isUsableKeyword)
    .slice(0, 8);
  return parts.length ? parts : [text.slice(0, 48).toLowerCase()].filter(isUsableKeyword);
}

function methodsFromText(text, enrichedMethods = []) {
  if (enrichedMethods.length) return enrichedMethods.slice(0, 6);
  const hits = [];
  const catalog = [
    [/experiment/i, 'experimental methods'],
    [/optical/i, 'optical measurement'],
    [/laser/i, 'laser diagnostics'],
    [/cfd|computational/i, 'computational modeling'],
    [/control/i, 'controls'],
    [/sensor|sensing|daq/i, 'sensing / DAQ'],
    [/manufactur/i, 'manufacturing process research'],
    [/vacuum|microscop/i, 'vacuum / microscopy instrumentation'],
    [/robot/i, 'robotics platforms'],
    [/simulation|modeling/i, 'modeling and simulation'],
  ];
  for (const [re, label] of catalog) {
    if (re.test(text) && !hits.includes(label)) hits.push(label);
  }
  return hits.slice(0, 6);
}

function scoreProspect(text, title) {
  const hay = `${text} ${title}`;
  const hasSpacePlasma = SPACE_PLASMA_PATTERNS.some(re => re.test(hay));
  const bloodBioPlasma = BLOOD_BIO_PLASMA_RE.test(hay) || (/\bplasmas?\b/i.test(hay) && BIOMED_DOMAIN_RE.test(hay) && !hasSpacePlasma);

  for (const rule of SCORE_RULES) {
    let patterns = rule.patterns;
    // Never let bare biomedical "plasma" ride the Tier-A plasma rule.
    if (rule.band === 'A' && bloodBioPlasma && !hasSpacePlasma) {
      patterns = patterns.filter(re => !SPACE_PLASMA_PATTERNS.includes(re) && !/plasma/i.test(String(re)));
    }
    const hits = patterns.filter(re => re.test(hay));
    if (!hits.length) continue;
    const span = rule.max - rule.min;
    const intensity = Math.min(1, hits.length / 4);
    let score = Number((rule.min + span * (0.35 + 0.65 * intensity)).toFixed(1));
    let band = rule.band;
    let vectors = rule.vectors;
    if (bloodBioPlasma && !hasSpacePlasma && band === 'A') {
      // Fall through should not happen; belt-and-suspenders demote.
      score = Math.min(score, 3.4);
      band = 'B';
      vectors = ['experimental systems', 'DAQ', 'controls'];
    }
    if (bloodBioPlasma && !hasSpacePlasma) {
      score = Math.min(score, 3.4);
      band = band === 'A' ? 'B' : band;
      vectors = ['experimental systems', 'DAQ', 'controls'];
    }
    const clamped = Math.min(
      band === 'A' ? 5.0 : band === 'B' ? 3.9 : band === 'C' ? 2.9 : 1.9,
      Math.max(band === 'A' ? 4.0 : band === 'B' ? 3.0 : band === 'C' ? 2.0 : 1.0, score),
    );
    return {
      score: Number(clamped.toFixed(1)),
      tier: band,
      hitCount: hits.length,
      vectors: hasSpacePlasma
        ? vectors
        : vectors.filter(v => v !== 'plasma diagnostics').slice(0, 4),
      band,
      plasma_context: hasSpacePlasma
        ? 'space_or_ionized_plasma'
        : (bloodBioPlasma ? 'biomedical_plasma_context' : 'other'),
    };
  }
  return {
    score: 1.6,
    tier: 'D',
    hitCount: 0,
    vectors: ['experimental systems'],
    band: 'D',
    plasma_context: 'other',
  };
}

function focusSlug(keywords, scoreInfo) {
  const primary = (keywords[0] || scoreInfo.vectors[0] || 'research')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 28);
  return primary || 'research';
}

function fitRationale(name, keywords, scoreInfo, interests) {
  const topic = keywords.slice(0, 3).join(', ') || 'mechanical engineering';
  if (scoreInfo.plasma_context === 'biomedical_plasma_context') {
    return `Biomedical/biological context (${topic}) is not space/fusion plasma. Keep only via MEMS/instrumentation/sensing bridge if present — never via blood-plasma word match.`;
  }
  if (scoreInfo.band === 'A') {
    return scoreInfo.plasma_context === 'space_or_ionized_plasma'
      ? `Strong ionized-gas / non-thermal plasma or optical-diagnostics overlap: ${topic}. Maps to space/fusion-style plasma instrumentation, vacuum/DAQ, or combustion-adjacent lab work — not blood plasma.`
      : `Strong experimental/diagnostics overlap: ${topic}. Maps to optical measurement, vacuum/DAQ, or combustion-adjacent lab work.`;
  }
  if (scoreInfo.band === 'B') {
    return `Open-minded transfer fit via ${topic}. Instrumentation, sensing, controls, manufacturing monitoring, or experimental systems skills can support this lab even without identical domain history.`;
  }
  if (scoreInfo.band === 'C') {
    return `Plausible stretch into ${topic}. Bridge through test engineering, data acquisition, modeling, or experimental hardware support rather than claiming domain mastery.`;
  }
  return `Research-active ME contact (${topic || 'see profile'}), but transfer from plasma/diagnostics background is weak. Keep as low-priority network node; verify a concrete bottleneck before outreach.`;
}

function outreachAngle(scoreInfo, keywords) {
  const topic = keywords[0] || 'their experimental systems';
  if (scoreInfo.plasma_context === 'biomedical_plasma_context') {
    return `If outreach: pitch MEMS/instrumentation/sensing only for ${topic}. Do not claim blood/biomedical plasma matches space plasma experience.`;
  }
  if (scoreInfo.band === 'A') {
    return scoreInfo.plasma_context === 'space_or_ionized_plasma'
      ? `Lead with ionized-gas plasma / optical diagnostics, vacuum operations, and synchronized DAQ experience applied to ${topic}.`
      : `Lead with optical diagnostics, vacuum operations, and synchronized DAQ experience applied to ${topic}.`;
  }
  if (scoreInfo.band === 'B') {
    return `Frame around lab instrumentation, process sensing, controls/automation, and test-rig data acquisition supporting ${topic}.`;
  }
  if (scoreInfo.band === 'C') {
    return `Ask about experimental bottlenecks in ${topic}; offer instrumentation/DAQ/test-engineering support without overclaiming domain expertise.`;
  }
  return `Only outreach after reading a recent paper; ask one specific question about ${topic} rather than pitching a broad fit.`;
}

function likelyRoute(scoreInfo) {
  if (scoreInfo.band === 'A' || scoreInfo.band === 'B') {
    return 'Research staff, research area specialist, or lab engineer / RA supporting experimental systems.';
  }
  if (scoreInfo.band === 'C') {
    return 'Exploratory RA / research support conversation; confirm funding and role family first.';
  }
  return 'Low-priority informational contact only.';
}

function buildProspect(person, enrichment, allNames) {
  const interests = stripTrailingNames(person.research_interests_raw, allNames, person.name);
  const enriched = enrichment.get(person.slug) || {};
  const keywords = keywordsFromInterests(interests, enriched.keywords);
  const methods = methodsFromText(`${interests} ${keywords.join(' ')}`, enriched.methods);
  const scoreInfo = scoreProspect(`${interests} ${keywords.join(' ')} ${methods.join(' ')}`, person.title);
  const id = STABLE_IDS[person.slug] || `umich-${person.slug}-${focusSlug(keywords, scoreInfo)}`;
  const email = person.contact_email || enriched.contact_email || '';
  const lab = enriched.lab || '';
  const labUrl = enriched.lab_url || '';
  const evidence = [
    source('ME faculty profile', person.profile_url),
    source('ME faculty directory', DIRECTORY_URL),
  ];
  if (labUrl) evidence.push(source(lab || 'Lab page', labUrl));

  const vectors = [...new Set([
    ...scoreInfo.vectors,
    ...methods.filter(m => /optical|control|daq|sensing|manufactur|vacuum|plasma|laser/i.test(m)).slice(0, 2),
  ])].slice(0, 4);

  return applyResearchFitScoring({
    id,
    name: person.name,
    title: person.title.split(/\n/)[0].replace(/\s+/g, ' ').trim().slice(0, 180),
    unit: 'Michigan Engineering',
    department: 'Mechanical Engineering',
    lab: lab || keywords.slice(0, 2).join(' / '),
    role_type: 'faculty_or_research_staff',
    campus: 'Ann Arbor',
    profile_url: person.profile_url,
    lab_url: labUrl,
    contact_email: email,
    contact_page: person.profile_url,
    phone: '',
    research_keywords: keywords,
    methods,
    facilities: lab ? [lab] : [],
    transfer_vectors: vectors,
    hiring_signals: [],
    evidence,
    score: scoreInfo.score,
    tier: scoreInfo.tier,
    priority: scoreInfo.tier,
    plasma_context: scoreInfo.plasma_context || 'other',
    fit_rationale: fitRationale(person.name, keywords, scoreInfo, interests),
    outreach_angle: outreachAngle(scoreInfo, keywords),
    likely_route: likelyRoute(scoreInfo),
    opt_h1b_notes: 'University research roles can be cap-exempt H-1B candidates, but timeline must be raised early.',
    uncertainty_notes: [
      email
        ? 'Confirm current hiring appetite and a recent paper before outreach.'
        : 'Email missing from directory extract; verify on profile before outreach.',
      scoreInfo.plasma_context === 'biomedical_plasma_context'
        ? 'Scoring excludes blood/biomedical plasma as a space-plasma match.'
        : '',
    ].filter(Boolean).join(' '),
    research_interests_summary: interests,
    recent_publication: '',
    status: 'not_contacted',
    source_report: SOURCE_REPORT,
    first_seen: `${RESEARCH_DATE}T00:00:00.000Z`,
  });
}

function main() {
  const raw = JSON.parse(readFileSync(join(RESEARCH_DIR, '_me-faculty-raw.json'), 'utf8'));
  const enrichment = parseDeepResearchEnrichment(join(RESEARCH_DIR, 'umich-me-faculty-roster-2026.json'));
  const active = (raw.active || []).filter(p => !p.emeritus && !p.lecturer_only);
  const allNames = (raw.all || []).map(p => p.name);
  const prospects = active.map(p => buildProspect(p, enrichment, allNames));
  prospects.sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));

  const byTier = prospects.reduce((acc, p) => {
    acc[p.tier] = (acc[p.tier] || 0) + 1;
    return acc;
  }, {});

  const out = {
    scope: 'University of Michigan Mechanical Engineering active faculty prospects',
    research_run: 'trun_dd47611047ba45199022de406509321e',
    research_date: RESEARCH_DATE,
    source_report: SOURCE_REPORT,
    directory_url: DIRECTORY_URL,
    inclusion: 'Professor / Associate / Assistant Professor + research faculty/scientist ranks; exclude emeritus and teaching-only lecturers',
    counts: {
      total: prospects.length,
      with_email: prospects.filter(p => p.contact_email).length,
      with_lab_url: prospects.filter(p => p.lab_url).length,
      by_tier: byTier,
    },
    stable_id_overrides: STABLE_IDS,
    prospects,
  };

  mkdirSync(RESEARCH_DIR, { recursive: true });
  const outPath = join(RESEARCH_DIR, 'umich-me-faculty-prospects-2026.json');
  writeFileSync(outPath, `${JSON.stringify(out, null, 2)}\n`);
  console.log(`Wrote ${prospects.length} ME prospects -> ${outPath}`);
  console.log(`Tier summary: ${JSON.stringify(byTier)}`);
  console.log(`Emails: ${out.counts.with_email}; lab URLs: ${out.counts.with_lab_url}`);
  for (const [slug, id] of Object.entries(STABLE_IDS)) {
    const hit = prospects.find(p => p.id === id);
    console.log(`stable ${id}: ${hit ? hit.score + '/' + hit.tier : 'MISSING'}`);
  }
}

main();
