import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyOutreachSemantics,
  normalizeOutreach,
  normalizeOutreachStage,
  normalizeProspectStatus,
} from '../lib/research-user-state.mjs';

test('legacy responded status normalizes to responded_positive', () => {
  assert.equal(normalizeProspectStatus('responded'), 'responded_positive');
  assert.equal(normalizeProspectStatus('responded_negative'), 'responded_negative');
});

test('followed_up is a first-class status', () => {
  assert.equal(normalizeProspectStatus('followed_up'), 'followed_up');
});

test('legacy follow_up_due stage normalizes to finished', () => {
  assert.equal(normalizeOutreachStage('follow_up_due'), 'finished');
  assert.equal(normalizeOutreach({ stage: 'follow_up_due' }).stage, 'finished');
});

test('positive status transition auto-enters your_move', () => {
  const result = applyOutreachSemantics({
    status: 'responded_positive',
    previousStatus: 'contacted',
    currentOutreach: null,
    today: '2026-07-13',
    now: '2026-07-13T12:00:00.000Z',
  });
  assert.equal(result.outreach.stage, 'your_move');
  assert.equal(result.outreach.entered_at, '2026-07-13T12:00:00.000Z');
});

test('followed_up with no stage enters their_move', () => {
  const result = applyOutreachSemantics({
    status: 'followed_up',
    previousStatus: 'contacted',
    currentOutreach: null,
    now: '2026-07-13T12:00:00.000Z',
  });
  assert.equal(result.outreach.stage, 'their_move');
});

test('explicit remove from rail keeps positive status off-rail', () => {
  const result = applyOutreachSemantics({
    status: 'responded_positive',
    previousStatus: 'responded_positive',
    currentOutreach: {
      stage: 'your_move',
      stage_updated_at: '2026-07-12T12:00:00.000Z',
      entered_at: '2026-07-12T12:00:00.000Z',
      notes: '',
    },
    outreachUpdate: { stage: '' },
    now: '2026-07-13T12:00:00.000Z',
  });
  assert.equal(result.outreach.stage, '');
});

test('negative status auto-enters finished', () => {
  const result = applyOutreachSemantics({
    status: 'responded_negative',
    previousStatus: 'responded_positive',
    currentOutreach: { stage: 'their_move', stage_updated_at: 'x', entered_at: 'y', notes: '' },
    now: '2026-07-13T12:00:00.000Z',
  });
  assert.equal(result.outreach.stage, 'finished');
});

test('finished stage is accepted without forcing a follow_up_date', () => {
  const result = applyOutreachSemantics({
    status: 'followed_up',
    previousStatus: 'followed_up',
    currentOutreach: { stage: 'next_step_locked', stage_updated_at: 'x', entered_at: 'y', notes: '' },
    outreachUpdate: { stage: 'finished' },
    currentFollowUpDate: '',
    today: '2026-07-13',
    now: '2026-07-13T12:00:00.000Z',
  });
  assert.equal(result.outreach.stage, 'finished');
  assert.equal(result.follow_up_date, '');
});

test('normalizeOutreach rejects unknown stages', () => {
  assert.equal(normalizeOutreach({ stage: 'ready_for_application' }).stage, '');
  assert.equal(normalizeOutreach({ stage: 'their_move' }).stage, 'their_move');
});

test('legacy follow_up status normalizes to contacted', () => {
  assert.equal(normalizeProspectStatus('follow_up'), 'contacted');
});

test('silence follow-up path can set your_move while staying contacted', () => {
  const result = applyOutreachSemantics({
    status: 'contacted',
    previousStatus: 'contacted',
    currentOutreach: null,
    outreachUpdate: { stage: 'your_move' },
    followUpDateUpdate: '',
    now: '2026-07-13T12:00:00.000Z',
  });
  assert.equal(result.outreach.stage, 'your_move');
  assert.equal(result.follow_up_date, '');
});

test('nudge Did you follow up path can set followed_up + your_move', () => {
  const result = applyOutreachSemantics({
    status: 'followed_up',
    previousStatus: 'contacted',
    currentOutreach: null,
    outreachUpdate: { stage: 'your_move' },
    followUpDateUpdate: '',
    now: '2026-07-13T12:00:00.000Z',
  });
  assert.equal(result.outreach.stage, 'your_move');
  assert.equal(result.follow_up_date, '');
});

test('nudge negative reply parks in finished', () => {
  const result = applyOutreachSemantics({
    status: 'responded_negative',
    previousStatus: 'contacted',
    currentOutreach: { stage: 'your_move', stage_updated_at: 'x', entered_at: 'y', notes: '' },
    outreachUpdate: { stage: 'finished' },
    now: '2026-07-13T12:00:00.000Z',
  });
  assert.equal(result.outreach.stage, 'finished');
});

test('manual followed_up after finished recovers to their_move', () => {
  const result = applyOutreachSemantics({
    status: 'followed_up',
    previousStatus: 'responded_negative',
    currentOutreach: {
      stage: 'finished',
      stage_updated_at: '2026-07-12T12:00:00.000Z',
      entered_at: '2026-07-12T12:00:00.000Z',
      notes: '',
    },
    now: '2026-07-13T12:00:00.000Z',
  });
  assert.equal(result.outreach.stage, 'their_move');
});

test('manual contacted after finished clears stage', () => {
  const result = applyOutreachSemantics({
    status: 'contacted',
    previousStatus: 'responded_negative',
    currentOutreach: {
      stage: 'finished',
      stage_updated_at: '2026-07-12T12:00:00.000Z',
      entered_at: '2026-07-12T12:00:00.000Z',
      notes: '',
    },
    now: '2026-07-13T12:00:00.000Z',
  });
  assert.equal(result.outreach.stage, '');
});

test('archived still clears outreach stage', () => {
  const result = applyOutreachSemantics({
    status: 'archived',
    previousStatus: 'responded_negative',
    currentOutreach: { stage: 'finished', stage_updated_at: 'x', entered_at: 'y', notes: '' },
    now: '2026-07-13T12:00:00.000Z',
  });
  assert.equal(result.outreach.stage, '');
});

test('next_step_locked advance to finished keeps any prior status semantics', () => {
  for (const status of ['contacted', 'followed_up', 'responded_positive']) {
    const result = applyOutreachSemantics({
      status,
      previousStatus: status,
      currentOutreach: {
        stage: 'next_step_locked',
        stage_updated_at: '2026-07-12T12:00:00.000Z',
        entered_at: '2026-07-12T12:00:00.000Z',
        notes: '',
      },
      outreachUpdate: { stage: 'finished' },
      now: '2026-07-13T12:00:00.000Z',
    });
    assert.equal(result.outreach.stage, 'finished', status);
  }
});

test('explicit finished while contacted is not cleared', () => {
  const result = applyOutreachSemantics({
    status: 'contacted',
    previousStatus: 'contacted',
    currentOutreach: {
      stage: 'next_step_locked',
      stage_updated_at: 'x',
      entered_at: 'y',
      notes: '',
    },
    outreachUpdate: { stage: 'finished' },
    now: '2026-07-13T12:00:00.000Z',
  });
  assert.equal(result.outreach.stage, 'finished');
});

test('your_move to their_move with responded_positive keeps stage move without requiring followed_up', () => {
  const result = applyOutreachSemantics({
    status: 'responded_positive',
    previousStatus: 'responded_positive',
    currentOutreach: {
      stage: 'your_move',
      stage_updated_at: 'x',
      entered_at: 'y',
      notes: '',
    },
    outreachUpdate: { stage: 'their_move' },
    now: '2026-07-13T12:00:00.000Z',
  });
  assert.equal(result.outreach.stage, 'their_move');
});
