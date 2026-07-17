import test from 'node:test';
import assert from 'node:assert/strict';
import { assessRobotsTextForUrl } from '../lib/euraxess/source-adapter.mjs';

const ROBOTS = `
User-agent: *
Disallow: /*?
Disallow: */api/*
Disallow: /jobs/*
Allow: /jobs
`;

test('EURAXESS access gate blocks query-string job searches', () => {
  const decision = assessRobotsTextForUrl(ROBOTS, 'https://euraxess.ec.europa.eu/jobs/search?keywords=fusion');
  assert.equal(decision.allowed, false);
  assert.ok(decision.matched_rule.startsWith('disallow:'));
});

test('EURAXESS access gate allows exact jobs landing path', () => {
  const decision = assessRobotsTextForUrl(ROBOTS, 'https://euraxess.ec.europa.eu/jobs');
  assert.equal(decision.allowed, true);
  assert.equal(decision.matched_rule, 'allow: /jobs');
});
