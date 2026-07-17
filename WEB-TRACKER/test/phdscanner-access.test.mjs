import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assessRobotsTextForUrl,
  parsePhdscannerSitemap,
  parsePhdscannerUrlSlug,
} from '../lib/phdscanner/source-adapter.mjs';

const ROBOTS = `
User-agent: *
Allow: /
Disallow: /*?created_at*
Disallow: /*?page=*
`;

test('robots deny pagination query page=', () => {
  const decision = assessRobotsTextForUrl(ROBOTS, 'https://www.phdscanner.com/phd-vacancies/standard?page=2');
  assert.equal(decision.allowed, false);
  assert.match(decision.matched_rule, /disallow: \/\*\?page=\*/i);
});

test('robots allow funded listing without page=', () => {
  const decision = assessRobotsTextForUrl(ROBOTS, 'https://www.phdscanner.com/phd-vacancies/standard?funded=true');
  assert.equal(decision.allowed, true);
});

test('robots allow opportunity detail URLs', () => {
  const decision = assessRobotsTextForUrl(
    ROBOTS,
    'https://www.phdscanner.com/opportunities/phd-vacancies-epfl-switzerland-phd-in-plasma-7177a261-0c47-4903-825a-e908e80453f9',
  );
  assert.equal(decision.allowed, true);
});

test('robots allow sitemap', () => {
  const decision = assessRobotsTextForUrl(ROBOTS, 'https://www.phdscanner.com/sitemap-phdpositions-details-new.xml');
  assert.equal(decision.allowed, true);
});

test('parse sitemap locs into opportunity URLs', () => {
  const xml = `<?xml version="1.0"?>
  <urlset>
    <url><loc>https://www.phdscanner.com/opportunities/phd-vacancies-epfl-switzerland-phd-in-plasma-diagnostics-7177a261-0c47-4903-825a-e908e80453f9</loc></url>
    <url><loc>https://www.phdscanner.com/about</loc></url>
  </urlset>`;
  const postings = parsePhdscannerSitemap(xml);
  assert.equal(postings.length, 1);
  assert.equal(postings[0].id, '7177a261-0c47-4903-825a-e908e80453f9');
  assert.match(postings[0].title || '', /Plasma/i);
  assert.equal(postings[0].country, 'Switzerland');
});

test('parsePhdscannerUrlSlug extracts university/country/title', () => {
  const parsed = parsePhdscannerUrlSlug(
    'https://www.phdscanner.com/opportunities/phd-vacancies-cranfield-university-united-kingdom-experimental-cryogenic-heat-pipe-abc12345-aaaa-bbbb-cccc-ddddeeee0001',
  );
  assert.match(parsed.university || '', /Cranfield/i);
  assert.equal(parsed.country, 'United Kingdom');
  assert.match(parsed.title || '', /Cryogenic/i);
});
