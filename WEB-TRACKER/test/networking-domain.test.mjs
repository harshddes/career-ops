import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  canonicalizeExternalUrl,
  identityMatchScore,
  isSafeGmailThreadUrl,
} from '../lib/networking/identity.mjs';
import { scoreNetworkingTask } from '../lib/networking/priority.mjs';
import {
  appendNetworkingInteraction,
  buildNetworkingReadModel,
  patchNetworkingPerson,
  readNetworking,
  reviewNetworkingPerson,
  upsertNetworkingOrganization,
  upsertNetworkingPerson,
  upsertNetworkingTask,
} from '../lib/networking/store.mjs';
import {
  deriveNextNetworkingAction,
  enforceOutreachGuardrails,
  pipelineGroupForStage,
} from '../lib/networking/workflow.mjs';
import {
  completeNetworkingResearch,
  markNetworkingResearchInProgress,
  queueNetworkingResearch,
  readNetworkingResearchQueue,
} from '../lib/networking/factory.mjs';

function tempFile(name) {
  const directory = mkdtempSync(join(tmpdir(), 'career-networking-'));
  return { directory, file: join(directory, name) };
}

test('identity resolution uses exact stable identifiers and review-only fuzzy matches', () => {
  assert.equal(
    canonicalizeExternalUrl('http://www.linkedin.com/in/Harsh/?utm_source=test'),
    'https://www.linkedin.com/in/Harsh',
  );
  assert.deepEqual(
    identityMatchScore(
      { display_name: 'Ada Lovelace', email: 'ADA@example.com' },
      { display_name: 'Different Name', email: 'ada@example.com' },
    ),
    { score: 1, reasons: ['same normalized email'] },
  );
  assert.equal(
    identityMatchScore(
      { display_name: 'Grace Hopper', current_organization: 'Navy' },
      { display_name: 'Grace Hopper', current_organization: 'Navy' },
    ).score,
    0.82,
  );
});

test('Gmail links accept only secure mail.google.com URLs', () => {
  assert.equal(isSafeGmailThreadUrl('https://mail.google.com/mail/u/0/#inbox/abc'), true);
  assert.equal(isSafeGmailThreadUrl('http://mail.google.com/mail/u/0/#inbox/abc'), false);
  assert.equal(isSafeGmailThreadUrl('https://mail.google.com.evil.test/thread'), false);
});

test('networking store persists people, tasks, interactions, and derived next actions', () => {
  const { directory, file } = tempFile('networking.json');
  try {
    const organizationResult = upsertNetworkingOrganization({ name: 'Example Labs' }, file);
    const organization = organizationResult.organization;
    const personResult = upsertNetworkingPerson({
      display_name: 'Test Contact',
      current_organization_id: organization.id,
      current_organization: organization.name,
      relationship_stage: 'outreach_ready',
      linkedin_url: 'https://www.linkedin.com/in/test-contact',
      channel_states: {
        linkedin: { state: 'available', profile_url: 'https://www.linkedin.com/in/test-contact' },
      },
    }, file);
    const person = personResult.person;
    const taskResult = upsertNetworkingTask({
      id: 'task-follow-up',
      person_id: person.id,
      action_type: 'follow_up',
      subject: 'Follow up after the event',
      state: 'open',
      due_at: '2026-07-20T12:00:00.000Z',
    }, file);
    assert.equal(taskResult.task.person_id, person.id);

    const interactionResult = appendNetworkingInteraction({
      person_id: person.id,
      type: 'message',
      direction: 'outbound',
      channel: 'gmail',
      occurred_at: '2026-07-21T12:00:00.000Z',
      gmail_thread_url: 'https://mail.google.com/mail/u/0/#inbox/test-thread',
      summary: 'Shared one relevant proof point.',
    }, file);
    assert.equal(interactionResult.person.gmail_thread_url, 'https://mail.google.com/mail/u/0/#inbox/test-thread');

    const readModel = buildNetworkingReadModel(readNetworking(file), new Date('2026-07-21T13:00:00.000Z'));
    assert.equal(readModel.summary.organizations, 1);
    assert.equal(readModel.summary.people, 1);
    assert.equal(readModel.people[0].next_action.task_id, 'task-follow-up');
    assert.equal(readModel.ranked_tasks[0].priority.reasons.includes('overdue'), true);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('store rejects unsafe Gmail thread URLs', () => {
  const { directory, file } = tempFile('networking.json');
  try {
    assert.throws(() => upsertNetworkingPerson({
      display_name: 'Unsafe Link',
      gmail_thread_url: 'javascript:alert(1)',
    }, file), /mail\.google\.com/i);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('channel guardrails prevent cross-channel pile-on and repeated silent follow-ups', () => {
  const person = {
    channel_states: {
      linkedin: { state: 'request_pending', unanswered_followups: 0 },
      email: { state: 'available', unanswered_followups: 0 },
    },
  };
  assert.equal(enforceOutreachGuardrails(person, { type: 'message', channel: 'email' }).allowed, false);
  assert.equal(enforceOutreachGuardrails({
    channel_states: { email: { state: 'contacted', unanswered_followups: 1 } },
  }, { type: 'follow_up', channel: 'email' }).allowed, false);
  assert.equal(enforceOutreachGuardrails({
    review_status: 'review_ready',
    channel_states: { email: { state: 'available' } },
  }, { type: 'message', channel: 'email' }).allowed, false);
});

test('workflow groups stages and derives a seven-day follow-up', () => {
  assert.equal(pipelineGroupForStage('referral_eligible'), 'activate');
  const action = deriveNextNetworkingAction({
    id: 'p1',
    relationship_stage: 'contacted',
    channel_states: {
      email: {
        state: 'contacted',
        last_touch_at: '2026-07-01T12:00:00.000Z',
        unanswered_followups: 0,
      },
    },
  }, [], new Date('2026-07-09T12:00:00.000Z'));
  assert.equal(action.type, 'follow_up');
});

test('priority scoring explains urgency and blocks do-not-contact tasks', () => {
  const urgent = scoreNetworkingTask(
    { due_at: '2026-07-20T12:00:00.000Z', state: 'open', outcome_value: 0.9 },
    { person: { fit_score: 4.5 } },
    new Date('2026-07-21T12:00:00.000Z'),
  );
  const suppressed = scoreNetworkingTask(
    { due_at: '2026-07-20T12:00:00.000Z', state: 'open' },
    { person: { do_not_contact: true } },
    new Date('2026-07-21T12:00:00.000Z'),
  );
  assert.equal(urgent.reasons.includes('overdue'), true);
  assert.equal(suppressed.score, 0);
  assert.equal(suppressed.penalties.includes('do not contact'), true);
});

test('research queue advances without mixing completed work into pending', () => {
  const { directory, file } = tempFile('queue.json');
  try {
    const queued = queueNetworkingResearch({
      organization_name: 'Queue Test Labs',
      personas: ['peer', 'recruiter'],
      affinity_paths: ['University of Michigan'],
    }, file);
    assert.equal(queued.queue.pending_count, 1);
    markNetworkingResearchInProgress(queued.order.id, file);
    completeNetworkingResearch(queued.order.id, {}, file);
    const result = readNetworkingResearchQueue(file);
    assert.equal(result.pending_count, 0);
    assert.equal(result.completed[0].status, 'completed');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('person patch preserves independent channel state', () => {
  const { directory, file } = tempFile('networking.json');
  try {
    const created = upsertNetworkingPerson({
      display_name: 'Channel Person',
      channel_states: {
        linkedin: { state: 'request_pending' },
        email: { state: 'available' },
      },
    }, file);
    const patched = patchNetworkingPerson(created.person.id, {
      channel_states: { email: { state: 'contacted', last_touch_at: '2026-07-21T12:00:00.000Z' } },
    }, file);
    assert.equal(patched.person.channel_states.linkedin.state, 'request_pending');
    assert.equal(patched.person.channel_states.email.state, 'contacted');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('candidate review gates outreach and approval advances the workflow', () => {
  const { directory, file } = tempFile('networking.json');
  try {
    const created = upsertNetworkingPerson({
      display_name: 'Reviewed Candidate',
      review_status: 'review_ready',
      relationship_stage: 'researching',
      channel_states: { email: { state: 'available' } },
      source_refs: [{
        field: 'title',
        observed_value: 'Instrument Engineer',
        url: 'https://example.test/official-profile',
        source_type: 'official_profile',
      }],
    }, file);
    assert.throws(() => patchNetworkingPerson(created.person.id, {
      relationship_stage: 'outreach_ready',
    }, file), /Approve/i);
    assert.throws(() => appendNetworkingInteraction({
      person_id: created.person.id,
      type: 'message',
      direction: 'outbound',
      channel: 'email',
    }, file), /Approve/i);

    const approved = reviewNetworkingPerson(created.person.id, 'approve', file);
    assert.equal(approved.person.review_status, 'approved');
    assert.equal(approved.person.relationship_stage, 'qualified');

    const contacted = appendNetworkingInteraction({
      person_id: created.person.id,
      type: 'message',
      direction: 'outbound',
      channel: 'email',
    }, file);
    assert.equal(contacted.person.relationship_stage, 'contacted');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('interaction logging advances replies and held conversations automatically', () => {
  const { directory, file } = tempFile('networking.json');
  try {
    const created = upsertNetworkingPerson({
      display_name: 'Conversation Contact',
      relationship_stage: 'contacted',
      channel_states: { email: { state: 'contacted' } },
    }, file);
    const engaged = appendNetworkingInteraction({
      person_id: created.person.id,
      type: 'reply',
      direction: 'inbound',
      channel: 'email',
    }, file);
    assert.equal(engaged.person.relationship_stage, 'engaged');

    const warm = appendNetworkingInteraction({
      person_id: created.person.id,
      type: 'conversation',
      direction: 'inbound',
      channel: 'email',
    }, file);
    assert.equal(warm.person.relationship_stage, 'warm');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('waiting and snoozed tasks stay out of Today until their wake time', () => {
  const { directory, file } = tempFile('networking.json');
  try {
    const created = upsertNetworkingPerson({
      display_name: 'Deferred Contact',
      relationship_stage: 'contacted',
    }, file);
    upsertNetworkingTask({
      id: 'waiting-later',
      person_id: created.person.id,
      state: 'waiting',
      waiting_until: '2026-08-01T12:00:00.000Z',
    }, file);
    upsertNetworkingTask({
      id: 'snoozed-awake',
      person_id: created.person.id,
      state: 'snoozed',
      snoozed_until: '2026-07-20T12:00:00.000Z',
    }, file);
    const model = buildNetworkingReadModel(readNetworking(file), new Date('2026-07-21T12:00:00.000Z'));

    assert.deepEqual(model.ranked_tasks.map(task => task.id), ['snoozed-awake']);
    assert.equal(model.people[0].next_action.task_id, 'snoozed-awake');
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('missing task scores inherit person context', () => {
  const { directory, file } = tempFile('networking.json');
  try {
    const created = upsertNetworkingPerson({
      display_name: 'Priority Contact',
      relationship_stage: 'outreach_ready',
      fit_score: 5,
      relationship_strength: 0.8,
      path_strength: 0.7,
    }, file);
    upsertNetworkingTask({
      id: 'context-priority',
      person_id: created.person.id,
      state: 'open',
    }, file);
    const model = buildNetworkingReadModel(readNetworking(file), new Date('2026-07-21T12:00:00.000Z'));

    assert.equal(model.ranked_tasks[0].priority.components.outcome_value, 100);
    assert.equal(model.ranked_tasks[0].priority.components.relationship_momentum, 80);
    assert.equal(model.ranked_tasks[0].priority.components.path_quality, 70);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
