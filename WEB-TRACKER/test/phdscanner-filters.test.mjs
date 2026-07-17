import test from 'node:test';
import assert from 'node:assert/strict';
import {
  phdscannerMatchesFilters,
  resolvePhdscannerFacetFilters,
  collectPhdscannerFacets,
} from '../lib/phdscanner/filters.mjs';

const sample = {
  id: 'phdscanner-1',
  title: 'PhD in Plasma Diagnostics',
  university: 'EPFL',
  institution: 'EPFL',
  country: 'Switzerland',
  discipline: 'Physics',
  department: 'Physics',
  summary: 'Fusion plasma diagnostics and instrumentation.',
  fully_funded: true,
  minimal_financial_barriers: true,
  published_at: '2026-07-01T00:00:00.000Z',
  score: 4.1,
  score_band: 'top_priority',
  visible: true,
  archived: false,
  status: 'open',
  score_breakdown: { strong_matches: ['plasma', 'diagnostics'] },
};

test('fully funded filter requires flag', () => {
  assert.equal(phdscannerMatchesFilters(sample, { fullyFunded: true, scoreBand: 'all' }), true);
  assert.equal(phdscannerMatchesFilters({ ...sample, fully_funded: false }, { fullyFunded: true, scoreBand: 'all' }), false);
});

test('country and discipline are mutually exclusive in resolve helper', () => {
  assert.deepEqual(resolvePhdscannerFacetFilters({ country: 'Germany', discipline: 'Physics' }), {
    country: 'Germany',
    university: '',
    discipline: '',
  });
  assert.deepEqual(resolvePhdscannerFacetFilters({ discipline: 'Physics', university: 'EPFL' }), {
    country: '',
    university: '',
    discipline: 'Physics',
  });
});

test('country filter matches university scope', () => {
  assert.equal(phdscannerMatchesFilters(sample, { country: 'Switzerland', scoreBand: 'all' }), true);
  assert.equal(phdscannerMatchesFilters(sample, { country: 'Germany', scoreBand: 'all' }), false);
  assert.equal(phdscannerMatchesFilters(sample, { country: 'Switzerland', university: 'EPFL', scoreBand: 'all' }), true);
});

test('published date range filter', () => {
  assert.equal(phdscannerMatchesFilters(sample, {
    scoreBand: 'all',
    publishedFrom: '2026-06-01',
    publishedTo: '2026-07-15',
  }), true);
  assert.equal(phdscannerMatchesFilters(sample, {
    scoreBand: 'all',
    publishedFrom: '2026-07-10',
  }), false);
});

test('topic plasma matches', () => {
  assert.equal(phdscannerMatchesFilters(sample, { scoreBand: 'all', topic: 'plasma' }), true);
  assert.equal(phdscannerMatchesFilters(sample, { scoreBand: 'all', topic: 'bio_chem' }), false);
});

test('collect facets builds country/university/discipline lists', () => {
  const facets = collectPhdscannerFacets([sample, {
    country: 'Germany',
    university: 'TUM',
    discipline: 'Electrical Engineering',
  }]);
  assert.ok(facets.countries.includes('Switzerland'));
  assert.ok(facets.countries.includes('Germany'));
  assert.ok(facets.disciplines.includes('Physics'));
  assert.ok(facets.universitiesByCountry.Switzerland.includes('EPFL'));
});
