#!/usr/bin/env node
/**
 * Seed SmallSat 2026 exhibitor batch N–R (booth list) into exhibitor-companies store.
 * No careers scraping — cards only.
 */

import {
  exhibitorCompanyId,
  syncExhibitorCompaniesToDashboard,
  upsertExhibitorCompany,
  writeExhibitorCompanies,
} from '../lib/exhibitor/company-store.mjs';

const EVENT = 'smallsat-2026';
const BATCH = 'N-R';

/** Left column top→bottom, then right column — booth list from user extract. */
const EXHIBITORS = [
  { name: 'Novo Space', booth: '430' },
  { name: 'NPC Spacemind', booth: '1328' },
  { name: 'Odysseus Space', booth: '231' },
  { name: 'Officina Stellare Spa', booth: '1702' },
  { name: 'OHB SE', booth: '1717' },
  { name: 'OKAPI:Orbits', booth: '331' },
  { name: 'Oligo Space', booth: '832' },
  { name: 'Omnetics Connectors Corporation', booth: '1504' },
  { name: 'OpenC3', booth: '934' },
  { name: 'Opterus Research and Development, Inc.', booth: '1131' },
  { name: 'Optical Support, Inc.', booth: '1713' },
  { name: 'Optisys', booth: '805' },
  { name: 'Orban Microwave, Inc.', booth: '627' },
  { name: 'Orbion Space Technology', booth: '1233' },
  { name: 'Orbit Communication Systems', booth: '500' },
  { name: 'Orbital Research Ltd.', booth: 'T20' },
  { name: 'Orion Space Solutions', booth: '1130' },
  { name: 'Out of the Box Manufacturing', booth: 'T5' },
  { name: 'Oxford Space Systems', booth: '532' },
  { name: 'Pacific Defense', booth: 'T11' },
  { name: 'Packet Digital', booth: 'T6' },
  { name: 'PacSci EMC', booth: '2336' },
  { name: 'PADT', booth: '2351' },
  { name: 'Pale Blue', booth: '1832' },
  { name: 'PCB Piezotronics', booth: '1012' },
  { name: 'Phase One United States Inc.', booth: '1814' },
  { name: 'Pinkmatter', booth: '1331' },
  { name: 'Polaris Business Solutions, Inc.', booth: 'T19' },
  { name: 'Polaris Semiconductor LLC', booth: 'T2' },
  { name: 'Presidio Components', booth: '2334' },
  { name: 'Printech Circuit Laboratories Ltd', booth: '1031' },
  { name: 'PULSAR FUSION Ltd', booth: '109' },
  { name: 'Pumpkin Space Systems', booth: '1618' },
  { name: 'Q-Tech Corporation', booth: '2350' },
  { name: 'Q2 Diamonds, LLC', booth: '703' },
  { name: 'Quartus Engineering', booth: '2064' },
  { name: 'Quindar', booth: '2231' },
  { name: 'Qwaltec, Inc.', booth: '405' },
  { name: 'Radiation Test Solutions, Inc.', booth: '1628' },
  { name: 'RAFAEL Advanced Defense Systems Ltd.', booth: '2130' },
  { name: 'Ragnarok Industries - Nano-Satellite Company', booth: '1501' },
  { name: 'Rakon', booth: '329' },
  { name: 'RAM Aviation, Space & Defense', booth: '415' },
  { name: 'Ramon.Space', booth: '2249' },
  { name: 'RBC Signals', booth: '215' },
  { name: 'RdF Corporation', booth: '1600' },
  { name: 'Reactel, Incorporated', booth: '609' },
  { name: 'Redline Chambers, Inc.', booth: '2245' },
  { name: 'Redwire', booth: '1319' },
  { name: 'Reflex Aerospace', booth: '131' },
  { name: 'Renesas', booth: '1301' },
  { name: 'Resilient Computing', booth: '407' },
  { name: 'Reynard Corporation', booth: '2444' },
  { name: 'RF Microtech srl', booth: '2548' },
  { name: 'Rincon Research Corporation (RRC)', booth: '412' },
  { name: 'Rock West Composites', booth: '2037' },
  { name: 'Rocket Lab', booth: '1019' },
  { name: 'Rohde & Schwarz', booth: '308' },
  { name: 'Rydberg Vacuum Sciences, Inc.', booth: '1229' },
];

function main() {
  let upserted = 0;
  for (const row of EXHIBITORS) {
    const id = exhibitorCompanyId({ event: EVENT, name: row.name });
    upsertExhibitorCompany({
      id,
      name: row.name,
      booth: row.booth,
      event: EVENT,
      batch: BATCH,
      worker_status: 'seeded',
      notes: `Seeded from SmallSat exhibitor booth list (batch ${BATCH}).`,
    });
    upserted += 1;
  }
  const store = syncExhibitorCompaniesToDashboard();
  // Touch write so summary is fresh on canonical too
  writeExhibitorCompanies(store);
  syncExhibitorCompaniesToDashboard();
  console.log(JSON.stringify({
    ok: true,
    event: EVENT,
    batch: BATCH,
    upserted,
    total: store.companies.length,
    summary: store.summary,
  }, null, 2));
}

main();
