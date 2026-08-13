import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  CAREER_DOMAIN_IDS,
  careerDomainLabel,
  inferCareerDomainsFromJob,
  inferCareerDomainsFromOrg,
  jobMatchesCareerDomain,
  normalizeCareerDomains,
  orgHasCareerDomain,
} from '../lib/career-domains.mjs';
import {
  readNetworking,
  upsertNetworkingOrganization,
} from '../lib/networking/store.mjs';

test('career domain ids normalize and label', () => {
  assert.deepEqual(
    normalizeCareerDomains(['fusion_instrumentation', 'bogus', 'fusion_instrumentation', 'Plasma Diagnostics']),
    ['fusion_instrumentation', 'plasma_diagnostics'],
  );
  assert.equal(careerDomainLabel('space_instrumentation'), 'Space instrumentation');
  assert.ok(CAREER_DOMAIN_IDS.includes('plasma_diagnostics'));
});

test('org inference maps fusion and space tags into islands', () => {
  assert.ok(
    inferCareerDomainsFromOrg({ name: 'UKAEA', tags: ['fusion', 'uk'] })
      .includes('fusion_instrumentation'),
  );
  assert.ok(
    inferCareerDomainsFromOrg({ name: 'Airbus Defence and Space', tags: ['europe-space'] })
      .includes('space_instrumentation'),
  );
  assert.ok(
    inferCareerDomainsFromOrg({ name: 'Airbus Defence and Space', tags: ['europe-space'] })
      .includes('adjacent_aerospace'),
  );
});

test('ALBA synchrotron maps to particle physics and detectors', () => {
  const domains = inferCareerDomainsFromJob({
    company: 'ALBA Synchrotron Light Source',
    title: 'Project Engineer (Cryogenic)',
  });
  assert.ok(domains.includes('particle_physics'));
  assert.ok(domains.includes('detectors'));
});

test('job soft fallback uses adjacent_fields when org is missing', () => {
  const domains = inferCareerDomainsFromJob({
    title: 'Diagnostics Engineer',
    adjacent_fields: ['plasma / vacuum / high voltage'],
  });
  assert.ok(domains.includes('plasma_diagnostics'));
  assert.equal(
    jobMatchesCareerDomain(
      { title: 'Diagnostics Engineer', adjacent_fields: ['plasma / vacuum / high voltage'] },
      'plasma_diagnostics',
    ),
    true,
  );
});

test('org without jobs still carries career_domains for island membership', () => {
  const directory = mkdtempSync(join(tmpdir(), 'career-domains-'));
  const file = join(directory, 'networking.json');
  try {
    const result = upsertNetworkingOrganization({
      name: 'Island Only Labs',
      career_domains: ['plasma_diagnostics'],
      tags: [],
    }, file);
    assert.deepEqual(result.organization.career_domains, ['plasma_diagnostics']);
    assert.equal(orgHasCareerDomain(result.organization, 'plasma_diagnostics'), true);
    const store = readNetworking(file);
    const org = store.organizations.find(item => item.name === 'Island Only Labs');
    assert.ok(org);
    assert.deepEqual(org.career_domains, ['plasma_diagnostics']);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('organization upsert unions career_domains instead of wiping them', () => {
  const directory = mkdtempSync(join(tmpdir(), 'career-domains-merge-'));
  const file = join(directory, 'networking.json');
  try {
    upsertNetworkingOrganization({
      name: 'Merge Labs',
      career_domains: ['adjacent_aerospace'],
    }, file);
    const merged = upsertNetworkingOrganization({
      name: 'Merge Labs',
      career_domains: ['space_instrumentation'],
    }, file);
    assert.deepEqual(
      [...merged.organization.career_domains].sort(),
      ['adjacent_aerospace', 'space_instrumentation'],
    );
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
