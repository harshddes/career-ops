import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  deriveOutreachCoverage,
  enrichConsiderJobWithNetworking,
  jobsNeedingOutreachFollowup,
} from '../lib/jobs-networking-bridge.mjs';
import { normalizeConsiderJob } from '../lib/jobs-to-consider-store.mjs';
import {
  readNetworking,
  upsertNetworkingOrganization,
  upsertNetworkingPerson,
} from '../lib/networking/store.mjs';
import {
  queueNetworkingResearch,
  readNetworkingResearchQueue,
} from '../lib/networking/factory.mjs';

function tempDir(prefix) {
  return mkdtempSync(join(tmpdir(), prefix));
}

test('normalizeConsiderJob keeps networking link fields', () => {
  const job = normalizeConsiderJob({
    company: 'Helion',
    title: 'Diagnostics Engineer',
    networking_org_id: 'network-org-helion',
    networking_person_ids: ['network-person-ada'],
    networking_research_order_id: 'network-research-1',
  });
  assert.equal(job.networking_org_id, 'network-org-helion');
  assert.deepEqual(job.networking_person_ids, ['network-person-ada']);
  assert.equal(job.networking_research_order_id, 'network-research-1');
});

test('deriveOutreachCoverage ranks referred > warm > contacted > candidates > queued > none', () => {
  const bare = { id: 'job-1' };
  const job = { id: 'job-1', networking_org_id: 'org-1' };
  assert.equal(deriveOutreachCoverage(bare, {
    networkingStore: { people: [] },
    queue: { pending: [], completed: [] },
  }), 'none');

  // Org link alone must not imply queued after cancel / completed research.
  assert.equal(deriveOutreachCoverage(job, {
    networkingStore: { people: [] },
    queue: { pending: [], completed: [] },
  }), 'none');

  assert.equal(deriveOutreachCoverage({
    ...job,
    networking_research_order_id: 'order-1',
  }, {
    networkingStore: { people: [] },
    queue: { pending: [{ id: 'order-1', status: 'queued', opportunity_ids: ['job-1'] }], completed: [] },
  }), 'queued');

  assert.equal(deriveOutreachCoverage({
    ...job,
    networking_research_order_id: 'order-canceled',
  }, {
    networkingStore: { people: [] },
    queue: {
      pending: [],
      completed: [{ id: 'order-canceled', status: 'canceled', opportunity_ids: ['job-1'] }],
    },
  }), 'none');

  assert.equal(deriveOutreachCoverage(job, {
    networkingStore: {
      people: [{
        id: 'p1',
        current_organization_id: 'org-1',
        opportunity_ids: ['job-1'],
        relationship_stage: 'researching',
      }],
    },
    queue: { pending: [], completed: [] },
  }), 'candidates');

  assert.equal(deriveOutreachCoverage(job, {
    networkingStore: {
      people: [{
        id: 'p2',
        opportunity_ids: ['job-1'],
        relationship_stage: 'contacted',
      }],
    },
    queue: { pending: [], completed: [] },
  }), 'contacted');

  assert.equal(deriveOutreachCoverage(job, {
    networkingStore: {
      people: [{
        id: 'p3',
        opportunity_ids: ['job-1'],
        relationship_stage: 'warm',
      }],
    },
    queue: { pending: [], completed: [] },
  }), 'warm');

  assert.equal(deriveOutreachCoverage(job, {
    networkingStore: {
      people: [{
        id: 'p4',
        opportunity_ids: ['job-1'],
        relationship_stage: 'referred',
      }],
    },
    queue: { pending: [], completed: [] },
  }), 'referred');
});

test('queueNetworkingResearch dedupes pending orders and enrichment links people', () => {
  const directory = tempDir('jobs-net-bridge-');
  const networkingFile = join(directory, 'networking.json');
  const queueFile = join(directory, 'queue.json');

  try {
    writeFileSync(networkingFile, JSON.stringify({
      version: 1,
      organizations: [],
      people: [],
      affiliations: [],
      edges: [],
      interactions: [],
      tasks: [],
      events: [],
      summary: {},
    }, null, 2));
    writeFileSync(queueFile, JSON.stringify({
      version: 1,
      pending: [],
      completed: [],
      pending_count: 0,
    }, null, 2));

    const org = upsertNetworkingOrganization({ name: 'Bridge Test Co' }, networkingFile).organization;
    const first = queueNetworkingResearch({
      organization_id: org.id,
      organization_name: org.name,
      opportunity_ids: ['bridge-test-role'],
      personas: ['hiring_manager', 'peer', 'recruiter'],
      notes: 'Find hiring managers',
    }, queueFile);
    const second = queueNetworkingResearch({
      organization_id: org.id,
      organization_name: org.name,
      opportunity_ids: ['bridge-test-role-2'],
      personas: ['hiring_manager'],
      notes: 'Also peer FPGA engineers',
    }, queueFile);

    assert.equal(first.duplicate, false);
    assert.equal(second.duplicate, true);
    assert.equal(second.order.id, first.order.id);
    assert.ok((second.order.opportunity_ids || []).includes('bridge-test-role'));
    assert.ok((second.order.opportunity_ids || []).includes('bridge-test-role-2'));
    assert.match(second.order.notes, /hiring managers/i);
    assert.match(second.order.notes, /FPGA/i);

    const linkedOrg = upsertNetworkingOrganization({
      id: org.id,
      name: org.name,
      opportunity_ids: [...(org.opportunity_ids || []), 'bridge-test-role'],
    }, networkingFile).organization;
    assert.ok(linkedOrg.opportunity_ids.includes('bridge-test-role'));

    const person = upsertNetworkingPerson({
      display_name: 'Bridge Contact',
      current_organization_id: org.id,
      current_organization: org.name,
      opportunity_ids: ['bridge-test-role'],
      relationship_stage: 'identified',
      review_status: 'review_ready',
    }, networkingFile).person;

    const enriched = enrichConsiderJobWithNetworking({
      id: 'bridge-test-role',
      company: 'Bridge Test Co',
      title: 'FPGA Engineer',
      networking_org_id: org.id,
      networking_research_order_id: first.order.id,
      applied: true,
      applied_at: new Date(Date.now() - 6 * 86400000).toISOString(),
      status: 'applied',
    }, {
      networkingStore: readNetworking(networkingFile),
      queue: readNetworkingResearchQueue(queueFile),
    });

    assert.equal(enriched.outreach_coverage, 'candidates');
    assert.ok(enriched.networking_person_ids.includes(person.id));
    assert.match(enriched.outreach_coverage_label, /people/i);

    const gaps = jobsNeedingOutreachFollowup([{
      id: 'dark-app',
      status: 'applied',
      applied: true,
      applied_at: new Date(Date.now() - 6 * 86400000).toISOString(),
      outreach_coverage: 'none',
    }], { olderThanDays: 5 });
    assert.equal(gaps.length, 1);

    const notYet = jobsNeedingOutreachFollowup([{
      id: 'fresh-app',
      status: 'applied',
      applied: true,
      applied_at: new Date().toISOString(),
      outreach_coverage: 'none',
    }], { olderThanDays: 5 });
    assert.equal(notYet.length, 0);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
