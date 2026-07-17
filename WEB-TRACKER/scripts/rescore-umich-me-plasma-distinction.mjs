#!/usr/bin/env node
/**
 * Rescore Mechanical Engineering prospects with honest plasma distinction:
 * - Ionized-gas / non-thermal / fusion / HEDP plasma → keep or boost
 * - Blood / biomedical / cell / tissue "plasma" false friends → demote
 * - Pure biomedical without instrumentation → keep but do not inflate via plasma word
 * - MEMS / detectors / instruments in biomedical contexts → keep as instrumentation bridge
 *
 * Also backfills a few known MEMS faculty with empty interest text.
 */
import {
  readResearchProspects,
  syncResearchProspectsToDashboard,
  writeResearchProspects,
} from '../lib/research-prospect-store.mjs';
import { applyResearchFitScoring } from '../lib/research-fit-scoring.mjs';

const DEPARTMENT = 'Mechanical Engineering';

const SPACE_PLASMA_RE = /\b(?:non[-\s]?thermal\s+plasma|low[-\s]?temperature\s+plasma|plasma\s+jet|plasma\s+source|plasma\s+diagnos|plasma\s+physic|ionized\s+gas|pulsed\s+power|high[-\s]?energy[-\s]?density|hedp|maglif|laser[-\s]?plasma|fusion\s+plasma|electric\s+propulsion|ion\s+thruster|hollow[-\s]?cathode)\b/i;
const BLOOD_BIO_PLASMA_RE = /\b(?:blood\s+plasma|plasma\s+protein|platelet|hemostasis|coagulat|hematolog|blood\b|serum|plasma\s+exchange)\b/i;
const BIOMED_DOMAIN_RE = /\b(?:biomedical|bioengineering|biomechanic|mechanobiology|stem\s+cell|tissue\s+engineer|rehab|prosthetic|orthotic|neurovascular|cardiovascular|cell\s+biology|synthetic\s+biology|medical\s+device|drug\s+transport|bacterial\s+biofilm)\b/i;
const INSTRUMENTATION_RE = /\b(?:instrument|diagnos|sensor|sensing|daq|data\s+acquisition|mems|biomems|detector|metrology|tomograph|optical|laser|microscop|fpga|adc|vacuum|calibration|in[-\s]?situ|process\s+monitoring|nano[-\s]?position)\b/i;
const GENERIC_PLASMA_WORD = /\bplasmas?\b/i;

/** Manual interest backfill for empty ME profiles that matter for MEMS/instrumentation. */
const INTEREST_BACKFILL = {
  'yogesh-gianchandani': {
    interests: 'MEMS and microsystems; microfabricated sensors and actuators; microplasma and microdischarge devices; harsh-environment sensing; biomedical and industrial microsystem instrumentation.',
    lab: 'Center for Wireless Integrated MicroSensing and Systems (WIMS2) / Gianchandani microsystems',
    email: 'yogesh@umich.edu',
    methods: ['MEMS sensors', 'microplasma devices', 'microsystem instrumentation'],
  },
  'euisik-yoon': {
    interests: 'MEMS/NEMS; neural interfaces and neurotechnology; biomedical microsystems; integrated sensors and circuits for neural recording/stimulation; microfabricated instrumentation.',
    lab: 'Yoon Lab',
    lab_url: 'https://yoon.eecs.umich.edu/',
    email: 'esyoon@umich.edu',
    methods: ['BioMEMS', 'neural instrumentation', 'microfabricated sensors'],
  },
};

/** Force-correct known MEMS / microplasma faculty after backfill. */
const FORCE_SCORE = {
  'yogesh-gianchandani': {
    score: 4.3,
    tier: 'A',
    plasma_context: 'space_or_ionized_plasma',
    fit_rationale: 'Strong microplasma / microdischarge + MEMS instrumentation overlap. Maps to ionized-gas plasma devices, microsensors, and experimental instrumentation — not blood plasma.',
    outreach_angle: 'Lead with microplasma/MEMS instrumentation, sensor readout, and microsystem test automation.',
    transfer_vectors: ['plasma diagnostics', 'experimental systems', 'DAQ', 'MEMS'],
  },
  'euisik-yoon': {
    score: 3.6,
    tier: 'B',
    plasma_context: 'biomed_instrumentation',
    fit_rationale: 'Biomedical MEMS/neurotechnology with real microsystem instrumentation bridge. Relevant via detectors/sensors, not via blood plasma.',
    outreach_angle: 'Pitch BioMEMS / neural instrumentation and microfabricated sensing — do not claim space-plasma domain match.',
    transfer_vectors: ['experimental systems', 'DAQ', 'controls', 'MEMS'],
  },
};

function slugFromUrl(url = '') {
  const m = String(url).match(/\/faculty\/([a-z0-9-]+)\/?/i);
  return m ? m[1].toLowerCase() : '';
}

function blobFor(prospect) {
  // Only faculty-side text. Never use fit_rationale / outreach / transfer_vectors —
  // those often contain the candidate's "plasma diagnostics" language and false-trigger demotions.
  return [
    prospect.research_interests_summary,
    prospect.lab,
    prospect.title,
    ...(prospect.research_keywords || []),
    ...(prospect.methods || []),
  ].join(' | ');
}

function classifyPlasma(text) {
  const hasPlasmaWord = GENERIC_PLASMA_WORD.test(text);
  const space = SPACE_PLASMA_RE.test(text);
  const blood = BLOOD_BIO_PLASMA_RE.test(text);
  const biomed = BIOMED_DOMAIN_RE.test(text);
  const instrument = INSTRUMENTATION_RE.test(text);

  if (space) {
    return {
      kind: 'space_or_ionized_plasma',
      note: 'Ionized-gas / non-thermal / HEDP-style plasma language present — relevant to space/fusion instrumentation background.',
    };
  }
  if (hasPlasmaWord && biomed && !space) {
    return {
      kind: 'biomedical_plasma_context',
      note: 'Plasma appears in biomedical/biological context, not space/fusion plasma. Do not score as plasma-diagnostics match.',
    };
  }
  if (hasPlasmaWord && !space) {
    // Ambiguous bare "plasmas" (e.g. Johnsen multiphase + plasmas + biomedical apps)
    if (biomed && !/\b(?:hedp|high[-\s]?energy[-\s]?density|non[-\s]?thermal|low[-\s]?temperature)\b/i.test(text)) {
      return {
        kind: 'ambiguous_plasma_with_biomed',
        note: 'Bare plasma mention with biomedical applications — treat as weak/ambiguous, not automatic Tier A plasma fit.',
      };
    }
    return {
      kind: 'ambiguous_plasma',
      note: 'Bare plasma mention without clear ionized-gas diagnostics framing — verify before treating as plasma match.',
    };
  }
  if (biomed && instrument) {
    return {
      kind: 'biomed_instrumentation',
      note: 'Biomedical domain with instrumentation/MEMS/sensing bridge — keep reachable, not via blood-plasma confusion.',
    };
  }
  if (biomed) {
    return {
      kind: 'biomed_only',
      note: 'Primarily biomedical/bio domain without strong instrumentation bridge.',
    };
  }
  return { kind: 'other', note: '' };
}

function rescore(prospect, classification) {
  let score = Number(prospect.score || 0);
  let tier = prospect.tier || 'D';
  let changed = false;
  const notes = [];

  if (classification.kind === 'space_or_ionized_plasma') {
    if (score < 4.0) {
      score = Math.max(score, 4.2);
      tier = 'A';
      changed = true;
      notes.push('Boosted: clear ionized-gas / non-thermal plasma relevance.');
    }
  }

  if (classification.kind === 'biomedical_plasma_context') {
    // Was likely inflated by /\bplasma\b/ A-band rule
    if (score >= 4.0) {
      score = classification.kind && INSTRUMENTATION_RE.test(blobFor(prospect)) ? 3.4 : 2.4;
      tier = score >= 3.0 ? 'B' : 'C';
      changed = true;
      notes.push('Demoted: biomedical/blood-context plasma is not space/fusion plasma.');
    }
  }

  if (classification.kind === 'ambiguous_plasma_with_biomed') {
    if (score >= 4.5) {
      // e.g. Johnsen: real fluids/HEDP adjacency but also biomedical apps — keep solid but not top plasma A
      score = 3.9;
      tier = 'B';
      changed = true;
      notes.push('Adjusted: ambiguous plasma + biomedical apps; keep experimental fluids bridge, remove auto Tier-A plasma boost.');
    } else if (score >= 4.0) {
      score = 3.8;
      tier = 'B';
      changed = true;
      notes.push('Adjusted: ambiguous plasma wording; not automatic plasma-diagnostics Tier A.');
    }
  }

  const strongInstrument = /\b(?:mems|biomems|detector|microsystem|sensor|sensing|instrument(?:ation)?|metrology|tomograph|microscop|microplasma|microdischarge)\b/i.test(blobFor(prospect));
  const designTheoryOnly = /\b(?:design theory|idea generation|front-end design|collaborative engagement in engineering design)\b/i.test(blobFor(prospect));

  if (classification.kind === 'biomed_instrumentation') {
    // Only raise when MEMS/detector/sensor language is explicit on the faculty side.
    if (score < 3.0 && strongInstrument) {
      score = 3.5;
      tier = 'B';
      changed = true;
      notes.push('Raised: biomedical + MEMS/instrumentation bridge is outreach-worthy without plasma confusion.');
    }
  }

  // Undo prior over-raises for design-theory / soft-bio people without real instrumentation language.
  if (!strongInstrument && designTheoryOnly && score >= 3.0 && score <= 3.6) {
    score = 2.5;
    tier = 'C';
    changed = true;
    notes.push('Corrected: design-theory bio application is not an instrumentation bridge.');
  }
  if (!strongInstrument && classification.kind === 'biomed_instrumentation' && score === 3.5 && !prospect.outreach_tier) {
    // Likely prior false raise from candidate-side "instrumentation" text in fit fields.
    const facultyHasInstrumentWord = /\b(?:instrument|sensor|sensing|mems|diagnos|metrology|optical|laser|daq)\b/i.test(blobFor(prospect));
    if (!facultyHasInstrumentWord) {
      score = 2.6;
      tier = 'C';
      changed = true;
      notes.push('Corrected: no faculty-side instrumentation language; removed false biomed-instrumentation raise.');
    }
  }

  if (classification.kind === 'biomed_only' && score >= 4.0 && !INSTRUMENTATION_RE.test(blobFor(prospect))) {
    score = 2.5;
    tier = 'C';
    changed = true;
    notes.push('Demoted: pure biomedical without instrumentation bridge.');
  }

  return { score, tier, changed, notes };
}

function rewriteFit(prospect, classification, score, tier) {
  const topic = (prospect.research_keywords || []).slice(0, 3).join(', ')
    || (prospect.lab || 'mechanical engineering');

  if (classification.kind === 'space_or_ionized_plasma') {
    return {
      fit_rationale: `Strong ionized-gas / non-thermal plasma relevance (${topic}). Maps to space/fusion-style plasma instrumentation, vacuum/DAQ, and experimental diagnostics — not blood plasma.`,
      outreach_angle: `Lead with plasma-source / diagnostics instrumentation, vacuum operations, and synchronized DAQ applied to ${topic}. Explicitly distinguish from biomedical blood-plasma work.`,
      transfer_vectors: [...new Set(['plasma diagnostics', 'experimental systems', 'DAQ', ...(prospect.transfer_vectors || [])])].slice(0, 5),
    };
  }
  if (classification.kind === 'biomedical_plasma_context') {
    return {
      fit_rationale: `Biomedical/biological plasma context (${topic}) is NOT space/fusion plasma. ${INSTRUMENTATION_RE.test(blobFor(prospect)) ? 'Keep only if MEMS/instrumentation bridge is concrete.' : 'Low relevance to plasma instrumentation background.'}`,
      outreach_angle: INSTRUMENTATION_RE.test(blobFor(prospect))
        ? `If outreach: pitch MEMS/instrumentation/sensing only — never claim blood-plasma work matches space plasma experience.`
        : `Low priority unless a specific instrumentation paper appears; do not pitch plasma-diagnostics fit.`,
      transfer_vectors: [...new Set([
        ...(INSTRUMENTATION_RE.test(blobFor(prospect)) ? ['experimental systems', 'DAQ'] : ['experimental systems']),
        ...((prospect.transfer_vectors || []).filter(v => !/plasma/i.test(v))),
      ])].slice(0, 4),
    };
  }
  if (classification.kind === 'ambiguous_plasma_with_biomed' || classification.kind === 'ambiguous_plasma') {
    return {
      fit_rationale: `Ambiguous plasma wording with other domains (${topic}). Treat as experimental fluids/systems bridge after paper check — not automatic space-plasma match.`,
      outreach_angle: `Verify whether their "plasma" means ionized gas / HEDP before claiming plasma-diagnostics fit; otherwise lead with multiphase/experimental methods.`,
      transfer_vectors: [...new Set(['experimental systems', 'DAQ', ...((prospect.transfer_vectors || []).filter(v => !/^plasma diagnostics$/i.test(v)))])].slice(0, 4),
    };
  }
  if (classification.kind === 'biomed_instrumentation') {
    return {
      fit_rationale: `Biomedical domain with instrumentation/MEMS/sensing bridge (${topic}). Relevant via detectors/instruments, not via blood plasma.`,
      outreach_angle: `Pitch MEMS/detector/instrumentation and measurement automation. Do not equate biomedical applications with space/fusion plasma experience.`,
      transfer_vectors: [...new Set(['experimental systems', 'DAQ', 'controls', ...((prospect.transfer_vectors || []).filter(v => !/plasma/i.test(v)))])].slice(0, 4),
    };
  }
  return null;
}

const store = readResearchProspects({ source: 'umich', preserveUserState: true });
const changes = [];
let patched = 0;

const nextProspects = (store.prospects || []).map(prospect => {
  if (prospect.department !== DEPARTMENT) return prospect;

  const slug = slugFromUrl(prospect.profile_url);
  let current = { ...prospect };

  if (INTEREST_BACKFILL[slug] && (!(current.research_interests_summary || '').trim() || /microplasma|mems\/nems/i.test(INTEREST_BACKFILL[slug].interests))) {
    const fill = INTEREST_BACKFILL[slug];
    const shouldFill = !(current.research_interests_summary || '').trim()
      || (INTEREST_BACKFILL[slug] && FORCE_SCORE[slug]);
    if (shouldFill) {
      current = {
        ...current,
        research_interests_summary: fill.interests || current.research_interests_summary,
        lab: fill.lab || current.lab,
        lab_url: fill.lab_url || current.lab_url || '',
        contact_email: current.contact_email || fill.email || '',
        methods: [...new Set([...(fill.methods || []), ...(current.methods || [])])],
        research_keywords: (fill.interests || current.research_interests_summary || '')
          .split(/[;,]/)
          .map(s => s.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 8),
      };
      changes.push({ name: current.name, action: 'backfill_interests' });
    }
  }

  const classification = classifyPlasma(blobFor(current));
  let { score, tier, changed, notes } = rescore(current, classification);
  let rewrite = (changed || ['space_or_ionized_plasma', 'biomedical_plasma_context', 'ambiguous_plasma_with_biomed', 'biomed_instrumentation'].includes(classification.kind))
    ? rewriteFit(current, classification, score, tier)
    : null;

  if (FORCE_SCORE[slug]) {
    const force = FORCE_SCORE[slug];
    score = force.score;
    tier = force.tier;
    changed = true;
    rewrite = {
      fit_rationale: force.fit_rationale,
      outreach_angle: force.outreach_angle,
      transfer_vectors: force.transfer_vectors,
    };
    notes.push(`Force-scored from known MEMS/microplasma profile.`);
  }

  if (!changed && !rewrite && !INTEREST_BACKFILL[slug] && !FORCE_SCORE[slug]) return prospect;

  const plasma_context = FORCE_SCORE[slug]?.plasma_context || classification.kind;
  const updated = applyResearchFitScoring({
    ...current,
    score,
    tier,
    priority: tier,
    plasma_context,
    plasma_context_note: FORCE_SCORE[slug]
      ? (FORCE_SCORE[slug].fit_rationale || classification.note || '')
      : (classification.note || current.plasma_context_note || ''),
    ...(rewrite || {}),
    uncertainty_notes: [
      current.uncertainty_notes || '',
      classification.note || '',
      ...notes,
    ].filter(Boolean).join(' ').slice(0, 500),
    last_updated: new Date().toISOString(),
  });

  if (changed || rewrite || INTEREST_BACKFILL[slug]) {
    patched += 1;
    changes.push({
      name: updated.name,
      from: `${prospect.score}/${prospect.tier}`,
      to: `${updated.score}/${updated.tier}`,
      plasma_context,
      notes,
    });
  }
  return updated;
});

nextProspects.sort((a, b) => Number(b.score || 0) - Number(a.score || 0) || String(a.name).localeCompare(String(b.name)));

writeResearchProspects({
  ...store,
  me_plasma_rescore: {
    date: new Date().toISOString().slice(0, 10),
    patched,
    rule: 'Distinguish ionized-gas/space/fusion plasma from blood/biomedical plasma; keep MEMS/instrumentation biomedical bridges.',
  },
  prospects: nextProspects,
}, { source: 'umich', preserveUserState: true });

syncResearchProspectsToDashboard({ institution: 'umich' });

console.log(`Patched ${patched} ME prospects`);
console.log(JSON.stringify(changes.filter(c => c.to || c.action).slice(0, 40), null, 2));
