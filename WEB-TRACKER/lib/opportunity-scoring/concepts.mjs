/**
 * Deterministic research-concept ontology.
 * Unique concept IDs only — synonyms never double-count.
 */

export const RESEARCH_CONCEPTS = [
  {
    id: 'space_mass_spectrometry',
    polarities: ['domain', 'method'],
    aliases: [
      /space\s+mass\s+spectrom/i,
      /\bLIMS\b/,
      /laser[-\s]?ionization\s+mass\s+spectrom/i,
      /mass\s+spectrom(?:eter|etry)?\s+(?:for\s+)?(?:space|planetary|comet|asteroid)/i,
      /(?:space|planetary|comet|asteroid).{0,40}mass\s+spectrom/i,
    ],
  },
  {
    id: 'plasma_diagnostics',
    polarities: ['domain', 'method'],
    aliases: [
      /plasma\s+diagnos/i,
      /fusion\s+(?:exhaust\s+)?plasma\s+diagnos/i,
      /plasma\s+edge\s+physics\s+and\s+diagnos/i,
      /\bPEPD\b/,
      /exhaust\/?divertor\s+diagnos/i,
      /divertor\s+diagnos/i,
      /fusion\s+plasma\s+diagnos/i,
    ],
  },
  {
    id: 'fusion_exhaust_diagnostics',
    polarities: ['domain', 'method'],
    aliases: [
      /fusion\s+exhaust/i,
      /exhaust\s+plasma\s+diagnos/i,
      /divertor\s+(?:physics|diagnos|plasma)/i,
      /plasma[-\s]?wall\s+interaction/i,
    ],
  },
  {
    id: 'cxrs',
    polarities: ['method'],
    aliases: [/\bCXRS\b/, /charge[-\s]?exchange\s+recombination\s+spectroscop/i],
  },
  {
    id: 'motional_stark_effect',
    polarities: ['method'],
    aliases: [/\bMSE\b/, /motional\s+stark\s+effect/i],
  },
  {
    id: 'reflectometry',
    polarities: ['method'],
    aliases: [/reflectometr/i],
  },
  {
    id: 'multispectral_imaging',
    polarities: ['method'],
    aliases: [/multispectral\s+imag/i, /\bMANTIS\b/],
  },
  {
    id: 'magnum_psi',
    polarities: ['domain', 'method'],
    aliases: [/\bMagnum[-\s]?PSI\b/i],
  },
  {
    id: 'particle_detection',
    polarities: ['method'],
    aliases: [
      /particle\s+detect/i,
      /radiation\s+detect/i,
      /charged[-\s]?particle/i,
      /\bscintillator\b/i,
      /\bCEM\b/,
      /\bESA\b/,
      /electrostatic\s+analy[sz]er/i,
      /detector\s+readout/i,
      /\bFPGA\b/,
    ],
  },
  {
    id: 'ion_optics',
    polarities: ['method'],
    aliases: [/ion\s+optics/i, /\bSIMION\b/i, /\bSRIM\b/i, /time[-\s]?of[-\s]?flight|\bTOF\b/i],
  },
  {
    id: 'vacuum_hv_daq',
    polarities: ['method'],
    aliases: [
      /vacuum\s+chamber/i,
      /high[-\s]?voltage/i,
      /pulsed[-\s]?power/i,
      /\bDAQ\b/,
      /data\s+acquisition/i,
      /test\s+(?:rig|stand|bed)/i,
      /calibrat(?:ion|e)/i,
    ],
  },
  {
    id: 'space_instrumentation',
    polarities: ['domain', 'method'],
    aliases: [
      /space\s+instrument/i,
      /spacecraft\s+instrument/i,
      /payload\s+instrument/i,
      /planetary\s+instrument/i,
      /heliophysics\s+instrument/i,
      /space\s+science\s+(?:and\s+)?engineering/i,
      /physical\s+(?:&|and)\s+chemical\s+instrumentation\s+of\s+space/i,
    ],
  },
  {
    id: 'space_plasma',
    polarities: ['domain'],
    aliases: [/space\s+plasma/i, /planetary\s+plasma/i, /heliophysics/i, /solar\s+wind/i],
  },
  {
    id: 'fusion_plasma',
    polarities: ['domain'],
    aliases: [
      /\bfusion\b/i,
      /\btokamak\b/i,
      /\bstellarator\b/i,
      /nuclear\s+fusion/i,
      /\bITER\b/,
      /\bPPPL\b/,
      /\bFLARE\b/,
    ],
  },
  {
    id: 'laser_plasma',
    polarities: ['domain', 'method'],
    aliases: [
      /laser[-\s]?plasma/i,
      /high[-\s]?field\s+science/i,
      /high[-\s]?energy[-\s]?density/i,
      /\bHEDP\b/,
      /\bZEUS\b/,
      /\bHERCULES\b/,
      /optical\s+diagnos/i,
      /laser\s+diagnos/i,
    ],
  },
  {
    id: 'electric_propulsion',
    polarities: ['domain', 'method'],
    aliases: [/electric\s+propulsion/i, /ion\s+thruster/i, /hall\s+thruster/i, /hollow[-\s]?cathode/i],
  },
  {
    id: 'materials_manufacturing',
    polarities: ['domain', 'method'],
    aliases: [
      /additive\s+manufacturing/i,
      /\bLPBF\b/,
      /materials\s+characterization/i,
      /plasma[-\s]?facing/i,
      /precision\s+machin/i,
      /metrolog/i,
      /coating|surface\s+engineering/i,
    ],
  },
  {
    id: 'hardware_fabrication',
    polarities: ['method'],
    aliases: [
      /\bfabricat/i,
      /\bprototype\b/i,
      /\bhardware\b/i,
      /machine\s+build/i,
      /instrumentation/i,
      /experimental\s+(?:work|facility|plasma|laser)/i,
    ],
  },
  {
    id: 'environmental_test',
    polarities: ['method'],
    aliases: [/environmental\s+test/i, /thermal[-\s]?vacuum/i, /test\s+facility/i],
  },
  {
    id: 'computation_theory',
    polarities: ['computation'],
    aliases: [
      /artificial\s+intelligence/i,
      /ai[-\s]?powered/i,
      /machine\s+learning/i,
      /autonomous\s+laborator/i,
      /\bsimulation\b/i,
      /computational\s+model/i,
      /numerical\s+model/i,
      /\bCFD\b/,
      /high[-\s]?performance\s+computing|\bHPC\b/i,
      /\btheor(?:y|etical)\b/i,
      /digital\s+twin/i,
      /model[-\s]?based\s+control/i,
    ],
  },
  {
    id: 'inactive_route',
    polarities: ['inactive'],
    aliases: [/\bemeritus\b/i, /professor\s+of\s+practice/i, /teaching[-\s]?focused/i],
  },
  {
    id: 'biomedical_only',
    polarities: ['negative'],
    aliases: [/biomedical|biomechan|prosthet|orthotic|rehabilitation|healthcare|medical\s+device|surgical/i],
  },
];

const FALSE_FRIENDS = [
  /office\s+space/ig,
  /work\s+space/ig,
  /space\s+planning/ig,
  /blood\s+plasma/ig,
  /plasma\s+donation/ig,
  /plasma\s+center/ig,
  /nuclear\s+medicine/ig,
];

function cleanText(value = '') {
  return String(value ?? '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export function sanitizeResearchText(value = '') {
  let text = cleanText(value);
  for (const pattern of FALSE_FRIENDS) {
    text = text.replace(pattern, ' ');
  }
  return text.replace(/\s+/g, ' ').trim();
}

export function facultyEvidenceText(prospect = {}) {
  const parts = [
    prospect.title,
    prospect.unit,
    prospect.department,
    prospect.lab,
    prospect.current_focus,
    prospect.recent_publication,
    prospect.research_interests_summary,
    ...(Array.isArray(prospect.research_fields) ? prospect.research_fields : []),
    ...(Array.isArray(prospect.research_keywords) ? prospect.research_keywords : []),
    ...(Array.isArray(prospect.methods) ? prospect.methods : []),
    ...(Array.isArray(prospect.facilities) ? prospect.facilities : []),
    ...(Array.isArray(prospect.hiring_signals)
      ? prospect.hiring_signals.map(item => [item?.label, item?.note].filter(Boolean).join(' '))
      : []),
  ];
  return sanitizeResearchText(parts.filter(Boolean).join(' | '));
}

export function matchResearchConcepts(sourceText = '', concepts = RESEARCH_CONCEPTS) {
  const text = sanitizeResearchText(sourceText);
  const matched = [];
  for (const concept of concepts) {
    for (const alias of concept.aliases || []) {
      const found = text.match(alias);
      if (!found) continue;
      matched.push({
        concept_id: concept.id,
        polarities: [...(concept.polarities || [])],
        quote: found[0],
        source_location: 'research_evidence',
      });
      break;
    }
  }
  return matched;
}

export function conceptsByPolarity(matches = [], polarity) {
  return matches.filter(item => (item.polarities || []).includes(polarity));
}
