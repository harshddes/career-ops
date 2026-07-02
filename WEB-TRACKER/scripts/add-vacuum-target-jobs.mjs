#!/usr/bin/env node
/**
 * One-shot: upsert vacuum-target research jobs into jobs-to-consider.json
 */
import { upsertConsiderJob, syncConsiderJobsToDashboard } from '../lib/jobs-to-consider-store.mjs';

const RESEARCH_DATE = '2026-05-18';
const NOTE = `Added from vacuum target company research ${RESEARCH_DATE}`;

const jobs = [
  {
    id: 'pfeiffer-vacuum-service-technician-nashua',
    company: 'Pfeiffer Vacuum',
    title: 'Service Technician',
    url: 'https://jobs.buschvacuum.com/pfeiffervacuum/job/Nashua-Service-Technician-NH-03063/1358321557/',
    location: 'Nashua, NH (on-site)',
    source: 'vacuum_target_research',
    score: '3.7/5',
    fit_summary: 'Strong vacuum hands-on fit; service/repair of pumps and leak detectors. VISA: H-1B unknown — ask early.',
    recommendation: 'Review posting; confirm H-1B sponsorship before applying.',
    notes: NOTE,
  },
  {
    id: 'pfeiffer-vacuum-field-service-engineer-san-jose',
    company: 'Pfeiffer Vacuum',
    title: 'Field Service Engineer',
    url: 'https://jobs.buschvacuum.com/pfeiffervacuum/job/Field-Service-Engineer-CA/1358942857/',
    location: 'San Jose, CA area (remote field — Bay Area customers)',
    source: 'vacuum_target_research',
    score: '3.8/5',
    fit_summary: 'High vacuum field service + troubleshooting at semiconductor sites; travel-heavy. VISA: H-1B unknown.',
    recommendation: 'Strong overlap if you want customer-site vacuum work; confirm sponsorship and travel tolerance.',
    notes: NOTE,
  },
  {
    id: 'pfeiffer-vacuum-key-account-customer-quality-engineer-san-jose',
    company: 'Pfeiffer Vacuum',
    title: 'Key Account Customer Quality Engineer',
    url: 'https://jobs.buschvacuum.com/pfeiffervacuum/job/San-Jose-Key-Account-Customer-Quality-Engineer-CA-95131/1356292257/',
    location: 'San Jose, CA',
    source: 'vacuum_target_research',
    score: '3.5/5',
    fit_summary: 'BS Engineering required; failure analysis and test apparatus — less lab-R&D, more customer QA. VISA: H-1B unknown.',
    recommendation: 'Consider if you want quality/failure-analysis path; salary band ~$85K–$105K posted.',
    notes: `${NOTE}. Compensation: $85K-$105K (posted range).`,
  },
  {
    id: 'pfeiffer-vacuum-service-technician-austin',
    company: 'Pfeiffer Vacuum',
    title: 'Service Technician',
    url: 'https://jobs.buschvacuum.com/pfeiffervacuum/job/Austin-Service-Technician-TX-78754/1360127857/',
    location: 'Austin, TX',
    source: 'vacuum_target_research',
    score: '3.6/5',
    fit_summary: 'Same family as Nashua service role — electromechanical vacuum equipment repair. VISA: H-1B unknown.',
    recommendation: 'Review posting; confirm sponsorship before applying.',
    notes: NOTE,
  },
  {
    id: 'vat-lab-development-engineer-haag',
    company: 'VAT Group',
    title: 'Lab Development Engineer',
    url: 'https://careers.vatvalve.com/job/Haag-Lab-Development-Engineer-St_/1342960355/',
    location: 'Haag, St. Gallen, Switzerland',
    source: 'vacuum_target_research',
    score: '3.2/5',
    fit_summary: 'Automated R&D test environments (PLC/TwinCAT); 5+ yrs Beckhoff ST required — senior bar. VISA: EU/CH permit only.',
    recommendation: 'Stretch on seniority and Swiss work auth; strong science fit if eligible for CH employment.',
    notes: `${NOTE}. Requires 5+ years TwinCAT/ST experience.`,
  },
  {
    id: 'vat-electrical-development-engineer-haag',
    company: 'VAT Group',
    title: 'Electrical Development Engineer',
    url: 'https://careers.vatvalve.com/job/Haag-Electrical-Development-Engineer-St_/1343563355/',
    location: 'Haag, St. Gallen, Switzerland',
    source: 'vacuum_target_research',
    score: '3.6/5',
    fit_summary: 'Mechatronics hardware, test plans, Beckhoff — good instrumentation overlap. VISA: EU/CH permit only.',
    recommendation: 'Apply only if pursuing Swiss/EU work authorization; confirm language expectations.',
    notes: NOTE,
  },
  {
    id: 'pfeiffer-vacuum-konstrukteur-asslar',
    company: 'Pfeiffer Vacuum',
    title: 'Konstrukteur (m/w/d)',
    url: 'https://jobs.buschvacuum.com/pfeiffervacuum/job/Asslar-Konstrukteur-%28mwd%29-HE-35614/1351186957/',
    location: 'Asslar, Germany',
    source: 'vacuum_target_research',
    score: '3.4/5',
    fit_summary: 'Mechanical design of turbopumps; NX/Teamcenter; lab experiments. VISA: Germany/EU permit; German required.',
    recommendation: 'Strong vacuum OEM design path if EU-eligible and German-proficient.',
    notes: NOTE,
  },
  {
    id: 'pfeiffer-vacuum-student-initiative-asslar',
    company: 'Pfeiffer Vacuum',
    title: 'Initiativbewerbungen Schüler & Studenten (m/w/d)',
    url: 'https://jobs.buschvacuum.com/pfeiffervacuum/job/Asslar-Initiativbewerbungen-Sch%C3%BCler-&amp;-Studenten-%28mwd%29-35614/820333102/',
    location: 'Asslar, Germany',
    source: 'vacuum_target_research',
    score: '3.3/5',
    fit_summary: 'Open student/university applications at HQ — pipeline builder, not a specific role. VISA: EU permit.',
    recommendation: 'Use for EU networking if eligible; not a direct US OPT path.',
    notes: NOTE,
  },
  {
    id: 'kompaflex-anlagen-apparatebauer-steinebrunn',
    company: 'Kompaflex',
    title: 'Anlagen- & Apparatebauer',
    url: 'https://kompaflex.com/wp-content/uploads/2024/07/2025-12-Anlagen-und-Apparatebauer.pdf',
    location: 'Steinebrunn, Switzerland',
    source: 'vacuum_target_research',
    score: '3.1/5',
    fit_summary: 'Welding/fabrication for UHV expansion joints — hands-on trade path, not instrumentation R&D. VISA: CH permit.',
    recommendation: 'Only if pursuing Swiss fabrication career; PDF application not standard ATS.',
    notes: `${NOTE}. Application via PDF on careers page.`,
  },
  {
    id: 'equans-axima-technicien-frigoriste-france',
    company: 'Axima (Equans)',
    title: 'Technicien Frigoriste H/F',
    url: 'https://www.equans.fr/jobs/72907-technicien-frigoriste-h-f-en-itinerance-sur-toute-la-france-axima-nucleaire',
    location: 'France (itinerant)',
    source: 'vacuum_target_research',
    score: '2.8/5',
    fit_summary: 'HVAC/refrigeration maintenance for nuclear division — weak direct fit vs instrumentation. VISA: EU/FR permit.',
    recommendation: 'Low priority unless targeting French nuclear field service path.',
    notes: NOTE,
  },
];

let added = 0;
for (const job of jobs) {
  upsertConsiderJob(job);
  added++;
  console.log(`  upserted: ${job.id}`);
}

const synced = syncConsiderJobsToDashboard();
console.log(`\nDone: ${added} jobs upserted; dashboard mirror has ${synced.total} total jobs.`);
