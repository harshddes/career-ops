/** Per-prospect defense-sheet snippets sourced from Parallel deep-research reports (2026-06). */

const ENRICHMENT = {
  'kth-marek-rubel-pwi': {
    research_interests: 'Report-supported: KTH PWI, Rubel profile, and Uppsala Tandem collaboration. The researched interests are plasma-facing materials, tritium/hydrogen retention, dust, fuel removal, in-vessel diagnostics, and ITER-relevant material migration with post-exposure ion-beam analysis.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: PFC lifetime, tritium inventory, and nuclear microprobe / ion-beam analysis of plasma-exposed samples. Before emailing, verify one recent PWI / retention / microprobe paper from the KTH profile or Google Scholar and write the title in column 3.',
  },
  'kth-henrik-bergsaker-pwi': {
    research_interests: 'Report-supported: Bergsaker is the active PWI associate-professor contact in the KTH PWI cluster. The researched interests are plasma-facing materials, fusion technology, fuel retention, surface analysis, and experimental PWI workflows tied to KTH/Sweden fusion-materials work.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: PFM/PFC lifetime diagnostics, sample exposure or insertion workflows, and post-exposure surface analysis. Verify a 2023-2026 PWI / retention paper from his profile before citing it.',
  },
  'kth-per-petersson-pwi': {
    research_interests: 'Report-supported: Petersson is a PWI researcher connected to Uppsala Tandem work. The researched interests are ion-beam analysis (ERDA, RBS, NRA, PIXE), deuterium retention, and beamline campaigns supporting fusion-materials analysis.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: IBA campaigns for plasma-exposed samples at Uppsala Tandem Lab. Verify one recent IBA / retention / PFC analysis paper before citing it.',
  },
  'kth-lorenzo-frassinetti-pedestal': {
    research_interests: 'Report-supported: Frassinetti is the Pedestal Physics contact. The researched interests are multi-tokamak pedestal experiments, pedestal MHD modelling, and diagnostic/database work across European tokamak campaigns.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: European tokamak pedestal campaigns and pedestal MHD modelling. Verify one 2023-2026 pedestal / ELM / H-mode paper before using this as an email hook.',
  },
  'kth-per-brunsell-extrap-control': {
    research_interests: 'Report-supported: Brunsell is the Plasma Control / EXTRAP T2R contact. The researched interests are reversed-field-pinch operation, resistive-wall-mode feedback, digital control, sensor arrays, and real-time DAQ.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: EXTRAP T2R RWM feedback and real-time control. Open Brunsell KTH profile and verify one recent RWM / RFP / control paper.',
  },
  'kth-mathias-hoppe-fast-electrons': {
    research_interests: 'Report-supported: Hoppe is the Fast Electron Physics contact. The researched interests are runaway electrons, synthetic diagnostics, numerical modelling, and codes including DREAM, SOFT, STREAM, and YODA.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: numerical modelling of fast-electron physics and code development. Verify one recent runaway-electron or synthetic-diagnostic paper before referencing it.',
  },
  'kth-per-arne-lindqvist-mms': {
    research_interests: 'Report-supported: Lindqvist is an MMS / space-plasma instrumentation contact. The researched interests are electric-field measurements, spacecraft-plasma interactions, and instrument-quality issues on magnetospheric missions.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: MMS electric-field instrument science and magnetospheric data. Verify one recent MMS / E-field / space-plasma instrumentation paper.',
  },
  'kth-tomas-karlsson-space-plasma': {
    research_interests: 'Report-supported: Karlsson is a KTH space-plasma contact. The researched interests are space plasma physics, MMS/Cluster data, and auroral or substorm-related plasma processes.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: magnetospheric plasma physics using MMS/Cluster datasets. Verify one recent substorm / auroral / space-plasma paper before email outreach.',
  },
  'kth-mykola-ivchenko-space-systems': {
    research_interests: 'Report-supported: Ivchenko is a space-systems bridge inside KTH EMP. The researched interests are satellite data handling, operation of space systems, and plasma-physics-adjacent teaching/research.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: spacecraft operations and space-plasma data handling. Verify a recent space-systems or space-plasma data paper before citing.',
  },
  'kth-andris-vaivads-space-plasma': {
    research_interests: 'Report-supported: Vaivads is a broader EMP space-plasma contact. The researched fit is space plasma physics and instrument/data-analysis paths at KTH, with weaker fusion-PWI overlap.',
    recent_publication: 'No specific recent publication title was extracted in our report. Verify a recent space-plasma paper on his profile before using this contact.',
  },
  'kth-lorenz-roth-planetary-plasma': {
    research_interests: 'Report-supported: Roth is a planetary-plasma contact. The report also flagged that unsolicited PhD email may be discouraged, so treat this as a posted-position monitor unless a specific advert matches.',
    recent_publication: 'Do not cold-email for PhD. If a posted project matches, verify one recent planetary-plasma paper from the advert or profile first.',
  },
  'kth-anita-kullen-near-earth': {
    research_interests: 'Report-supported: Kullen is a near-Earth space-plasma backup contact. The researched interests are magnetospheric physics and adjacent space-plasma themes, with less direct instrumentation overlap than MMS contacts.',
    recent_publication: 'No specific recent publication title was extracted in our report. Verify one recent near-Earth plasma paper on the profile if you pursue this path.',
  },
  'chalmers-tunde-fulop-plasma-theory': {
    research_interests: 'Report-supported: Fulop is a Chalmers FP3 collaborator, not a KTH employee. The researched interests are plasma theory, fusion-relevant transport, and kinetic modelling.',
    recent_publication: 'No specific recent publication title was extracted in our report. Check Fulop publications for a recent fusion transport / runaway / tokamak modelling paper before citing.',
  },
  'uppsala-daniel-primetzhofer-tandem': {
    research_interests: 'Report-supported: Primetzhofer / Uppsala Tandem Lab is a KTH PWI collaborator route. The researched interests are ion-beam analysis for fusion materials, energy materials, and IBA methods supporting sample campaigns.',
    recent_publication: 'No specific recent publication title was extracted in our report. Uppsala IBA / energy-materials pages support active beamline-analysis work; verify one Primetzhofer or Tandem Lab IBA / materials paper before citing.',
  },
  'uppsala-tandem-lab-iba-contact': {
    research_interests: 'Report-supported: Uppsala Tandem is a facility/contact route for IBA methods. The researched methods are ERDA, RBS, NRA, and PIXE for post-exposure fusion-material analysis linked to KTH PWI.',
    recent_publication: 'Facility-level contact, not a professor-specific publication row. Use the Tandem Lab publications list or staff page to verify one recent IBA / fusion-materials paper before referencing it.',
  },
  'ipp-hans-meister-iter-diagnostics': {
    research_interests: 'Report-supported: Meister is the ITER Diagnostics contact. The researched interests are ITER upper-port bolometers, ionisation pressure gauges, tomographic reconstruction, sensor qualification, and commissioning support.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: ITER upper-port bolometer and pressure-gauge deliverables. Verify one 2023-2026 bolometer / pressure-gauge / ITER diagnostics paper before citing.',
  },
  'ipp-ursel-fantz-ited-nbi': {
    research_interests: 'Report-supported: Fantz is the ITED division head. The researched interests are neutral beam injection, negative-ion sources, ELISE, BATMAN Upgrade, ITER technology coordination, and plasma-for-gas-conversion as a lower-priority adjacent line.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: ITER NBI and diagnostics contributions, including ELISE/BATMAN test-stand work. Verify one recent negative-ion source or ITER technology paper before citing.',
  },
  'ipp-robert-wolf-nbi-heating': {
    research_interests: 'Report-supported: Wolf is a Greifswald senior experimental-heating contact. The researched interests are neutral beam heating/current drive, NBI test stands, and ITER-relevant heating physics.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: NBI / heating work connected to ITER-relevant beam systems. Check MPG or IPP profile for a recent NBI / heating publication before citing.',
  },
  'ipp-thomas-klinger-w7x': {
    research_interests: 'Report-supported: Klinger is the W7-X / Stellarator Dynamics and Transport contact. The researched interests are W7-X operations, stellarator dynamics/transport, and diagnostic-heavy long-pulse experimental campaigns.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: W7-X diagnostics and long-pulse data acquisition. Verify a recent W7-X / stellarator diagnostics paper before citing.',
  },
  'ipp-rachael-mcdermott-asdex': {
    research_interests: 'Report-supported: McDermott is an ASDEX Upgrade / plasma-scenario contact. The researched interests are ITER-relevant AUG scenarios, tungsten-divertor operation, and diagnostic implications of AUG upgrades.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: AUG ITER-scenario and divertor-upgrade work. Check IPP ASDEX pages or profile for a recent AUG scenario / divertor paper before citing.',
  },
  'ipp-tim-happel-asdex-transition': {
    research_interests: 'Report-supported: Happel is an ASDEX Upgrade experiments/diagnostics contact. The report also flagged a 2026 transition to TUM, so treat the supervisor path as potentially transitional.',
    recent_publication: 'No specific recent publication title was extracted in our report. Report-supported current line: AUG diagnostics/scenario work with transition risk. Verify a recent AUG diagnostics/scenario paper and note the leadership transition before outreach.',
  },
  'ipp-sibylle-guenter-directorate': {
    research_interests: 'Report-supported: Guenter is IPP scientific director. This is a strategic/directorate contact, not a first instrumentation PhD target.',
    recent_publication: 'No specific recent publication title was extracted in our report. Use only if routed through IPP leadership, and verify a recent IPP / strategic fusion publication before citing.',
  },
  'ipp-per-helander-stellarator-theory': {
    research_interests: 'Report-supported: Helander is the Stellarator Theory contact. The researched interests are stellarator transport theory and modelling; this is lower fit for an instrumentation-heavy PhD.',
    recent_publication: 'No specific recent publication title was extracted in our report. Check Helander recent theory papers before citing; the report ranks this as a weak top-level instrumentation target.',
  },
};

export function getDefenseSheetEnrichment(prospectId = '') {
  return ENRICHMENT[cleanId(prospectId)] || null;
}

function cleanId(value) {
  return String(value || '').trim();
}
