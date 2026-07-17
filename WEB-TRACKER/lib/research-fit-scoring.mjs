/**
 * Candidate-specific research fit scoring.
 *
 * Only faculty-side evidence is scored. Generated rationale, outreach copy, and
 * transfer vectors are outputs and must never become scoring inputs.
 */

const CORE_PATTERNS = [
  ['plasma diagnostics', /\bplasma diagnos/i],
  ['laser-plasma experiments', /\blaser[-\s]?plasma|laser[-\s]driven (?:particle|electron|ion) acceler/i],
  ['high-energy-density plasma', /\bhigh[-\s]?energy[-\s]?density|\bHEDP\b|\bMagLIF\b/i],
  ['electric propulsion', /\belectric propulsion|ion thruster|hall thruster|hollow[-\s]?cathode/i],
  ['optical/laser diagnostics', /\boptical diagnos|laser diagnos|interferometr|proton deflectometr/i],
  ['detector/readout instrumentation', /\bdetector|readout chain|particle instrument|charged[-\s]?particle|FPGA|ADC\b/i],
  ['ion optics/mass spectrometry', /\bion optics|mass spectrom|electrostatic analy[sz]er|time[-\s]?of[-\s]?flight|\bTOF\b/i],
  ['vacuum/high-voltage systems', /\bvacuum chamber|high[-\s]?voltage|pulsed[-\s]?power|cryostat/i],
  ['planetary/heliophysics instrumentation', /\bplanetary instrument|heliophysics instrument|space plasma|spacecraft instrument|payload instrument/i],
];

const ENABLING_PATTERNS = [
  ['additive manufacturing/LPBF', /\badditive manufacturing|\bLPBF\b|powder[-\s]?bed fusion|metal 3d print/i],
  ['precision machining/forming', /\bprecision machin|sheet[-\s]?metal|forming process|metal forming|micro[-\s]?machin/i],
  ['joining/welding', /\bweld|joining|brazing|bonding process/i],
  ['metrology/NDE/process inspection', /\bmetrolog|non[-\s]?destructive|\bNDE\b|computed tomography|process inspection|in[-\s]?situ property/i],
  ['fusion/space materials', /\bplasma[-\s]?facing|refractory|high[-\s]?temperature material|radiation[-\s]?resistant|thermal[-\s]?barrier|vacuum[-\s]?compatible/i],
  ['coatings/surface engineering', /\bcoating|surface engineering|surface treatment|atomic layer deposition|\bALD\b/i],
  ['complex hardware fabrication', /\bcomplex geometr|precision fabrication|machine tool|assembly process/i],
  ['propulsion/test hardware', /\bpropulsion test|thruster test|test stand|thermal[-\s]?vacuum|environmental test/i],
  ['experimental materials characterization', /\bmaterials characterization|mechanical testing|thermal testing|microscop|operando|in[-\s]?situ character/i],
  ['magnet/coil manufacturing', /\bmagnet manufacturing|coil winding|superconducting magnet|stellarator coil/i],
];

const HANDS_ON_PATTERNS = [
  ['experimental work', /\bexperiment(?:al|s)?\b/i],
  ['instrumentation', /\binstrument(?:ation|s)?\b/i],
  ['measurement/diagnostics', /\bmeasurement|diagnos/i],
  ['DAQ/test automation', /\bDAQ\b|data acquisition|test automation|test rig|test bed/i],
  ['sensors/process monitoring', /\bsensor|sensing|process monitoring|condition monitoring/i],
  ['in-situ/operando work', /\bin[-\s]?situ|operando/i],
  ['fabrication/machining', /\bfabricat|machin|forming|weld/i],
  ['lab/facility operations', /\btest facility|experimental facility|test stand|towing tank|wind tunnel|beamline/i],
  ['calibration/metrology', /\bcalibrat|metrolog|inspection/i],
  ['vacuum/HV hardware', /\bvacuum|high[-\s]?voltage|pulsed[-\s]?power/i],
  ['prototype/hardware', /\bprototype|hardware|device build|machine build/i],
];

const COMPUTATION_PATTERNS = [
  ['AI/ML', /\bartificial intelligence|\bAI[-\s]powered|\bmachine learning|\bML\b|deep learning/i],
  ['autonomous-lab software', /\bautonomous laborator|\bself[-\s]?driving lab/i],
  ['simulation/modeling', /\bsimulation|computational model|numerical model|physics[-\s]?based model/i],
  ['CFD/HPC', /\bCFD\b|high[-\s]?performance computing|\bHPC\b|supercomput/i],
  ['theory', /\btheor(?:y|etical)|analytical model/i],
  ['software/data science', /\bsoftware platform|data science|algorithm development|computer vision/i],
  ['optimization/digital twin', /\boptimization|digital twin|surrogate model/i],
];

const INACTIVE_PATTERNS = [
  ['emeritus', /\bemeritus\b/i],
  ['teaching-only', /\blecturer\b|teaching[-\s]?focused|professor of practice/i],
  ['administrative-only', /\badministrative|program manager|research manager/i],
];

const BIOMEDICAL_PATTERNS = [
  ['biomedical/health application', /\bbiomedical|biomechan|prosthet|orthotic|rehabilitation|healthcare|medical device|surgical/i],
];

function cleanText(value) {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function unique(values = []) {
  return [...new Set(values.map(cleanText).filter(Boolean))];
}

function facultyOnlyText(value) {
  return cleanText(value)
    .split(/(?<=[.!?])\s+|\s*;\s*/)
    .filter(part => !/\b(Harsh|fit|relevant to|maps? to|transfer|outreach|you can|could support|help fit)\b/i.test(part))
    .join(' ');
}

function evidenceText(prospect = {}) {
  return [
    prospect.current_focus,
    prospect.recent_publication,
    prospect.research_interests_summary,
    prospect.lab,
    prospect.title,
    ...(prospect.research_keywords || []),
    ...(prospect.methods || []),
    ...(prospect.facilities || []),
  ].map(facultyOnlyText).filter(Boolean).join(' | ');
}

function matches(text, catalog) {
  return catalog.filter(([, pattern]) => pattern.test(text)).map(([label]) => label);
}

function clamp(value, min = 0, max = 5) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function rounded(value) {
  return Number(clamp(value).toFixed(1));
}

function tierForScore(score) {
  if (score >= 4) return 'A';
  if (score >= 3) return 'B';
  if (score >= 2) return 'C';
  return 'D';
}

function confidenceFor(prospect) {
  let value = 1;
  const reasons = [];
  const evidenceUrls = (prospect.evidence || []).filter(item => /^https?:\/\//i.test(item?.url || ''));
  const labOrCurrentWorkEvidence = Boolean(prospect.lab_url)
    || evidenceUrls.some(item => /\b(lab|current|project|recent|publication|facility|research center)\b/i.test(item?.label || '')
      && !/\b(area|directory)\b/i.test(item?.label || ''));
  if (evidenceUrls.length >= 1) {
    value += 1;
    reasons.push('official/profile source');
  }
  if (labOrCurrentWorkEvidence) {
    value += 0.8;
    reasons.push('lab or current-work source');
  }
  if (cleanText(prospect.current_focus).length >= 60) {
    value += 1;
    reasons.push('current work described');
  }
  if ((prospect.methods || []).length >= 2 || (prospect.facilities || []).length >= 1) {
    value += 0.7;
    reasons.push('methods/facilities described');
  }
  if (cleanText(prospect.recent_publication).match(/\b20(?:2[3-9]|3\d)\b/)) {
    value += 0.5;
    reasons.push('recent signal');
  }
  return {
    value: rounded(value),
    reasons,
    verified_work_evidence: labOrCurrentWorkEvidence
      || (Boolean(cleanText(prospect.current_focus)) && evidenceUrls.length >= 1),
  };
}

function dailyWorkType({ inactive, core, enabling, handsOn, computation }) {
  if (inactive.length) return 'inactive_or_nonresearch';
  if (core.length >= 1 && handsOn.length >= 2) return 'core_experimental_hardware';
  if (enabling.length >= 1 && handsOn.length >= 2) return 'strategic_materials_manufacturing_hardware';
  if (handsOn.length >= 2 && computation.length >= 1) return 'mixed_experimental_computational';
  if (computation.length >= 2 && handsOn.length < 2) return 'computation_theory_dominant';
  if (handsOn.length >= 2) return 'general_experimental_hardware';
  if (computation.length) return 'computation_adjacent_unverified_hardware';
  return 'insufficiently_verified';
}

function rationaleFor(result) {
  const overlap = result.verified_overlap.slice(0, 4).join(', ');
  const caps = result.cap_reasons.join(' ');
  if (result.tier === 'A') {
    return `Direct, desirable hands-on fit: ${overlap}. Official evidence supports both daily experimental work and an immediate instrumentation/hardware contribution.`;
  }
  if (result.tier === 'B') {
    return `Credible hands-on or strategic hardware path: ${overlap}. This is relevant to fusion/space/laser systems without pretending the domains are identical.`;
  }
  if (result.tier === 'C') {
    return `Conditional learning/network fit${overlap ? ` via ${overlap}` : ''}. ${caps || 'A concrete hands-on hardware role is not sufficiently verified.'}`.trim();
  }
  return `Low-priority fit. ${caps || 'Verified daily work does not match the desired hands-on instrumentation/manufacturing path.'}`.trim();
}

function outreachFor(result) {
  if (result.tier === 'A') return `Lead with ${result.verified_overlap.slice(0, 3).join(', ')} and ask about the current experimental bottleneck.`;
  if (result.tier === 'B') return `Ask how ${result.verified_overlap.slice(0, 3).join(', ')} supports current fusion-, space-, laser-, or manufacturing-hardware work.`;
  if (result.tier === 'C') return 'Only outreach after verifying a specific physical experiment, machine, instrument, or fabrication bottleneck.';
  return 'Do not prioritize for technical outreach; retain only as a network reference if useful.';
}

export function scoreResearchProspect(prospect = {}) {
  const text = evidenceText(prospect);
  const core = matches(text, CORE_PATTERNS);
  const enabling = matches(text, ENABLING_PATTERNS);
  const handsOn = matches(text, HANDS_ON_PATTERNS);
  const computation = matches(text, COMPUTATION_PATTERNS);
  const inactive = matches(text, INACTIVE_PATTERNS);
  const biomedical = matches(text, BIOMEDICAL_PATTERNS);
  const confidence = confidenceFor(prospect);
  const type = dailyWorkType({ inactive, core, enabling, handsOn, computation });

  const coreHardware = core.length >= 1 && handsOn.length >= 2;
  const strategicHardware = enabling.length >= 1 && handsOn.length >= 2;
  const substantialHardware = handsOn.length >= 3 && (core.length + enabling.length >= 1);
  const computationDominant = computation.length >= 2 && !substantialHardware;

  let interest = 1.5;
  let experimental = Math.min(5, 1 + handsOn.length * 0.65);
  let directContribution = 1.4;
  let strategicLearning = 1.8;

  if (coreHardware) {
    interest = 5;
    experimental = Math.max(experimental, 4.3);
    directContribution = Math.min(5, 4.1 + core.length * 0.25);
    strategicLearning = 4.7;
  } else if (strategicHardware) {
    interest = 4.3;
    experimental = Math.max(experimental, 3.8);
    // Strategic manufacturing/materials can be an excellent growth path, but
    // it is not an immediate Tier-A contribution without a core diagnostics link.
    directContribution = Math.min(3.9, 3.1 + enabling.length * 0.2);
    strategicLearning = 4.8;
  } else if (handsOn.length >= 2) {
    interest = 3.4;
    directContribution = 2.8;
    strategicLearning = 3.3;
  }

  if (type === 'mixed_experimental_computational') {
    interest = Math.min(interest, substantialHardware ? 3.8 : 3.0);
  }
  if (computationDominant) {
    interest = Math.min(interest, 1.6);
    experimental = Math.min(experimental, 2.0);
    directContribution = Math.min(directContribution, 1.8);
    strategicLearning = Math.min(strategicLearning, 2.1);
  }
  const activeRoute = inactive.length
    ? 1
    : (prospect.hiring_signals || []).length
      ? 4.8
      : /assistant professor|associate professor|professor|research scientist/i.test(prospect.title || '')
        ? 3.5
        : 3;

  const dimensions = {
    daily_work_interest: rounded(interest),
    hands_on_experimental: rounded(experimental),
    direct_skill_contribution: rounded(directContribution),
    strategic_learning_value: rounded(strategicLearning),
    active_lab_route: rounded(activeRoute),
    evidence_confidence: confidence.value,
  };

  let score = (
    dimensions.daily_work_interest * 0.25
    + dimensions.hands_on_experimental * 0.25
    + dimensions.direct_skill_contribution * 0.20
    + dimensions.strategic_learning_value * 0.15
    + dimensions.active_lab_route * 0.10
    + dimensions.evidence_confidence * 0.05
  );

  score = rounded(score);
  const capReasons = [];
  let tierCap = '';
  if (inactive.length) {
    score = Math.min(score, 1.9);
    tierCap = 'D';
    capReasons.push(`Inactive/non-target route: ${inactive.join(', ')}.`);
  }
  if (computationDominant) {
    score = (enabling.length || handsOn.length)
      ? Math.max(2, Math.min(score, 2.9))
      : Math.min(score, 2.9);
    tierCap = 'C';
    capReasons.push(`AI/ML/simulation/theory dominates without substantial verified hardware: ${computation.join(', ')}.`);
  }
  if (biomedical.length && !coreHardware) {
    score = Math.min(score, 2.9);
    tierCap = 'C';
    capReasons.push(`Biomedical/health application is outside the destination domains: ${biomedical.join(', ')}.`);
  }
  if (score >= 3 && !coreHardware && !strategicHardware) {
    score = Math.min(score, 2.9);
    tierCap = 'C';
    capReasons.push('Tier B requires verified core instrumentation work or a concrete fusion/space/laser-enabling materials or manufacturing path.');
  }
  const independentHardwareEvidence = confidence.reasons.includes('lab or current-work source');
  if (score >= 4 && !(interest >= 4 && experimental >= 4 && directContribution >= 4 && confidence.value >= 3 && independentHardwareEvidence)) {
    score = Math.min(score, 3.9);
    tierCap = tierCap || 'B';
    capReasons.push('Tier A requires desirable daily work, substantial hands-on evidence, direct contribution, and an official lab/current-project or second source.');
  }
  if (score >= 3 && (confidence.value < 2.5 || !confidence.verified_work_evidence || !independentHardwareEvidence)) {
    score = Math.min(score, 2.9);
    tierCap = 'C';
    capReasons.push('A/B evidence gate failed: an official lab, current-project, recent-work, or evidence-backed current-focus source is missing.');
  }
  if (!cleanText(prospect.current_focus) && !cleanText(prospect.research_interests_summary)) {
    score = Math.min(score, 2.9);
    tierCap = 'C';
    capReasons.push('Current work and research interests are missing.');
  }

  score = rounded(score);
  const tier = tierForScore(score);
  const verifiedOverlap = unique([...core, ...enabling, ...handsOn]).slice(0, 8);
  const missingEvidence = [];
  if (!cleanText(prospect.current_focus)) missingEvidence.push('current_focus');
  if (!prospect.lab_url) missingEvidence.push('lab_url');
  if (!(prospect.methods || []).length) missingEvidence.push('methods');
  if (confidence.value < 3) missingEvidence.push('independent_official_evidence');

  const result = {
    score,
    tier,
    priority: tier,
    tier_cap: tierCap,
    cap_reasons: capReasons,
    daily_work_type: type,
    verified_overlap: verifiedOverlap,
    missing_evidence: unique(missingEvidence),
    score_breakdown: {
      ...dimensions,
      core_destination_matches: core,
      enabling_hardware_matches: enabling,
      hands_on_matches: handsOn,
      computation_theory_matches: computation,
      inactive_route_matches: inactive,
      biomedical_matches: biomedical,
      confidence_reasons: confidence.reasons,
      computation_dominant: computationDominant,
      substantial_hardware_verified: substantialHardware,
      independent_hardware_evidence: independentHardwareEvidence,
    },
  };

  return {
    ...result,
    fit_rationale: rationaleFor(result),
    outreach_angle: outreachFor(result),
    transfer_vectors: verifiedOverlap.slice(0, 6),
  };
}

export function applyResearchFitScoring(prospect = {}) {
  return {
    ...prospect,
    ...scoreResearchProspect(prospect),
  };
}

export const RESEARCH_FIT_POLICY_VERSION = '2026-07-interest-first-v1';
