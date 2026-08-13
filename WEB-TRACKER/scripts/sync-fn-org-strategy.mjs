#!/usr/bin/env node
/**
 * Align networking org strategy ladder with FN playbook:
 * - keep existing A/B/C + feasibility when present
 * - mark known hard-ITAR US primes as tier C / watch / intel-only
 * Does NOT invent a Jobs "tier" field.
 */
import {
  readNetworking,
  syncNetworkingToDashboard,
  upsertNetworkingOrganization,
} from '../lib/networking/store.mjs';

const CLOSED_US_ITAR = [
  { name: 'SpaceX', aliases: ['Space Exploration Technologies'], feasibility_label: 'US technical roles ITAR-blocked for most foreign nationals; network for open-lane referrals only' },
  { name: 'Rocket Lab', aliases: ['Rocket Lab USA'], feasibility_label: 'US engineering roles typically US-person; NZ/commercial lanes may differ — confirm before apply' },
  { name: 'Lockheed Martin', aliases: [], feasibility_label: 'Defense-primary — US-person gate for most engineering; intel_only networking' },
  { name: 'Northrop Grumman', aliases: [], feasibility_label: 'Defense-primary — US-person gate for most engineering; intel_only networking' },
  { name: 'Raytheon', aliases: ['RTX', 'Raytheon Technologies'], feasibility_label: 'Defense-primary — US-person gate; intel_only networking' },
  { name: 'General Dynamics', aliases: [], feasibility_label: 'Defense-primary — US-person gate; intel_only networking' },
  { name: 'L3Harris', aliases: ['L3Harris Technologies'], feasibility_label: 'Defense-heavy — treat engineering as closed unless posting explicitly non-ITAR' },
  { name: 'Blue Origin', aliases: [], feasibility_label: 'Often US-person for engineering; verify posting before apply; prefer intel networking if gated' },
];

const OPEN_EUROPE_HINTS = [
  { name: 'ITER Organization', aliases: ['ITER'], tier: 'A', strategy_status: 'active', feasibility_label: 'International org — foreign nationals welcome; primary Europe apply lane', tags: ['europe-primary', 'fusion', 'apply-lane'] },
  { name: 'UKAEA', aliases: ['United Kingdom Atomic Energy Authority'], tier: 'A', strategy_status: 'active', feasibility_label: 'UK Skilled Worker sponsor path for fusion roles', tags: ['europe-primary', 'fusion', 'uk', 'apply-lane'] },
  { name: 'Tokamak Energy', aliases: [], tier: 'A', strategy_status: 'active', feasibility_label: 'UK fusion startup — Skilled Worker sponsorship history', tags: ['europe-primary', 'fusion', 'apply-lane'] },
];

const before = readNetworking();
const results = { closed: 0, open: 0, skipped: 0 };

for (const item of CLOSED_US_ITAR) {
  const existing = (before.organizations || []).find(org => {
    const names = [org.name, ...(org.aliases || [])].map(v => String(v || '').toLowerCase());
    return names.includes(item.name.toLowerCase())
      || item.aliases.some(a => names.includes(a.toLowerCase()));
  });
  upsertNetworkingOrganization({
    id: existing?.id,
    name: existing?.name || item.name,
    aliases: [...new Set([...(existing?.aliases || []), ...(item.aliases || [])])],
    tier: 'C',
    strategy_status: 'watch',
    feasibility_label: existing?.feasibility_label || item.feasibility_label,
    feasibility_notes: existing?.feasibility_notes
      || 'FN playbook: hard/closed apply lane — research notes must include intel_only; do not ask for ITAR exceptions as the default ask.',
    tags: [...new Set([...(existing?.tags || []), 'intel-only', 'itar-hard', 'fn-closed'])],
  });
  results.closed += 1;
}

for (const item of OPEN_EUROPE_HINTS) {
  const existing = (before.organizations || []).find(org => {
    const names = [org.name, ...(org.aliases || [])].map(v => String(v || '').toLowerCase());
    return names.includes(item.name.toLowerCase())
      || item.aliases.some(a => names.includes(a.toLowerCase()));
  });
  if (existing?.tier === 'A' && existing?.strategy_status === 'active') {
    results.skipped += 1;
    continue;
  }
  upsertNetworkingOrganization({
    id: existing?.id,
    name: existing?.name || item.name,
    aliases: [...new Set([...(existing?.aliases || []), ...(item.aliases || [])])],
    tier: item.tier,
    strategy_status: item.strategy_status,
    feasibility_label: existing?.feasibility_label || item.feasibility_label,
    tags: [...new Set([...(existing?.tags || []), ...(item.tags || [])])],
  });
  results.open += 1;
}

const dashboard = syncNetworkingToDashboard();
const after = readNetworking();
console.log(JSON.stringify({
  ...results,
  org_total: after.organizations.length,
  dashboard_synced: Boolean(dashboard),
}, null, 2));
