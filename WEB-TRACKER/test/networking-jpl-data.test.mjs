import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const BASE = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS = join(BASE, '..', '..');

test('NASA JPL map contains official evidence, team branches, and review-ready people', () => {
  const store = JSON.parse(readFileSync(join(CAREER_OPS, 'data', 'networking.json'), 'utf-8'));
  const jpl = store.organizations.find(organization => organization.name === 'NASA Jet Propulsion Laboratory');
  const people = store.people.filter(person => person.current_organization_id === jpl?.id);

  assert.ok(jpl);
  assert.equal(jpl.feasibility_label, 'Role-dependent / foreign-national review required');
  assert.ok(jpl.organization_units.length >= 7);
  assert.equal(people.length, 11);
  // Seeded people start as review_ready; live approve/reject during E2E is expected.
  assert.ok(people.every(person => ['review_ready', 'approved', 'rejected'].includes(person.review_status)));
  assert.ok(people.some(person => person.review_status === 'review_ready'));
  assert.ok(people.every(person => {
    if (person.review_status === 'review_ready') return person.relationship_stage === 'researching';
    if (person.review_status === 'approved') {
      return !['identified', 'researching', 'archived', 'declined', 'do_not_contact'].includes(person.relationship_stage);
    }
    return person.relationship_stage === 'archived';
  }));
  assert.ok(people.every(person => person.organization_unit));
  assert.ok(people.every(person => person.source_refs.length > 0));
  assert.ok(people.every(person => person.source_refs.every(source => (
    source.source_type === 'official'
    && /^https:\/\/(?:[\w-]+\.)*(?:jpl\.nasa\.gov|nasa\.gov|caltech\.edu)\//.test(source.url)
  ))));
  assert.ok(people.every(person => !person.email && !person.linkedin_url));
  assert.equal(store.people.some(person => person.display_name === 'Smoke Contact'), false);
});

test('JPL evaluation policy avoids a blanket foreign-national rejection', () => {
  const profile = readFileSync(join(CAREER_OPS, 'modes', '_profile.md'), 'utf-8');

  assert.match(profile, /NASA JPL \/ Caltech special handling/);
  assert.match(profile, /role-dependent \/ foreign-national review required/i);
  assert.match(profile, /Do not auto-SKIP every JPL opportunity/);
});
