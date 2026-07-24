import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

test('fast server supports the full networking workflow and keeps Gmail links validated', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'career-networking-api-'));
  process.env.NETWORKING_DATA_FILE = join(directory, 'networking.json');
  process.env.NETWORKING_DASHBOARD_FILE = join(directory, 'networking-dashboard.json');
  process.env.NETWORKING_RESEARCH_QUEUE_FILE = join(directory, 'networking-queue.json');
  process.env.NETWORKING_ACTIVITY_LOG = 'off';

  const { startFastServer } = await import(`../server-fast.mjs?networking-test=${Date.now()}`);
  const server = await startFastServer(0, '127.0.0.1');
  try {
    const { port } = server.address();
    const base = `http://127.0.0.1:${port}`;

    const organizationResponse = await fetch(`${base}/api/networking/organizations`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'API Labs' }),
    });
    const organizationBody = await organizationResponse.text();
    assert.equal(organizationResponse.status, 201, organizationBody);
    const organization = JSON.parse(organizationBody).organization;

    const createResponse = await fetch(`${base}/api/networking/people`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        display_name: 'API Contact',
        current_organization: 'API Labs',
        current_organization_id: organization.id,
        relationship_stage: 'researching',
        review_status: 'review_ready',
        source_refs: [{
          field: 'title',
          observed_value: 'API Engineer',
          url: 'https://example.test/official-profile',
          source_type: 'official_profile',
        }],
        channel_states: { linkedin: { state: 'available' } },
      }),
    });
    const createBody = await createResponse.text();
    assert.equal(createResponse.status, 201, createBody);
    const created = JSON.parse(createBody);

    const rejectedCandidateResponse = await fetch(`${base}/api/networking/people`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        display_name: 'Rejected API Contact',
        current_organization: 'API Labs',
        current_organization_id: organization.id,
        relationship_stage: 'researching',
        review_status: 'review_ready',
      }),
    });
    const rejectedCandidateBody = await rejectedCandidateResponse.text();
    assert.equal(rejectedCandidateResponse.status, 201, rejectedCandidateBody);
    const rejectedCandidate = JSON.parse(rejectedCandidateBody);

    const rejectResponse = await fetch(
      `${base}/api/networking/people/${encodeURIComponent(rejectedCandidate.person.id)}/review`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'reject' }),
      },
    );
    const rejectBody = await rejectResponse.text();
    assert.equal(rejectResponse.status, 200, rejectBody);
    assert.equal(JSON.parse(rejectBody).person.relationship_stage, 'archived');

    const blockedInteractionResponse = await fetch(`${base}/api/networking/interactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        person_id: created.person.id,
        type: 'message',
        direction: 'outbound',
        channel: 'gmail',
      }),
    });
    assert.equal(blockedInteractionResponse.status, 400);

    const reviewResponse = await fetch(`${base}/api/networking/people/${encodeURIComponent(created.person.id)}/review`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'approve' }),
    });
    assert.equal(reviewResponse.status, 200, await reviewResponse.text());

    const patchResponse = await fetch(`${base}/api/networking/people/${encodeURIComponent(created.person.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ relationship_stage: 'outreach_ready' }),
    });
    assert.equal(patchResponse.status, 200, await patchResponse.text());

    const interactionResponse = await fetch(`${base}/api/networking/interactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        person_id: created.person.id,
        type: 'message',
        direction: 'outbound',
        channel: 'gmail',
        gmail_thread_url: 'https://mail.google.com/mail/u/0/#inbox/api-thread',
      }),
    });
    assert.equal(interactionResponse.status, 201, await interactionResponse.text());

    const unsafeResponse = await fetch(`${base}/api/networking/interactions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        person_id: created.person.id,
        channel: 'gmail',
        gmail_thread_url: 'https://example.test/not-gmail',
      }),
    });
    assert.equal(unsafeResponse.status, 400);

    const taskResponse = await fetch(`${base}/api/networking/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        person_id: created.person.id,
        action_type: 'follow_up',
        subject: 'API follow-up',
        state: 'open',
      }),
    });
    const taskBody = await taskResponse.text();
    assert.equal(taskResponse.status, 201, taskBody);
    const task = JSON.parse(taskBody).task;

    const snoozeResponse = await fetch(`${base}/api/networking/tasks/${encodeURIComponent(task.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        state: 'snoozed',
        snoozed_until: new Date(Date.now() + 86_400_000).toISOString(),
      }),
    });
    const snoozeBody = await snoozeResponse.text();
    assert.equal(snoozeResponse.status, 200, snoozeBody);
    assert.equal(JSON.parse(snoozeBody).task.state, 'snoozed');

    const completeTaskResponse = await fetch(`${base}/api/networking/tasks/${encodeURIComponent(task.id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ state: 'completed' }),
    });
    const completeTaskBody = await completeTaskResponse.text();
    assert.equal(completeTaskResponse.status, 200, completeTaskBody);
    assert.ok(JSON.parse(completeTaskBody).task.completed_at);

    const pathResponse = await fetch(`${base}/api/networking/edges`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        from_person_id: 'self',
        to_person_id: created.person.id,
        type: 'knows',
        notes: 'API path',
      }),
    });
    assert.equal(pathResponse.status, 201, await pathResponse.text());

    const eventResponse = await fetch(`${base}/api/networking/events`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        name: 'API Networking Event',
        organization_id: organization.id,
        url: 'https://example.test/networking-event',
        person_ids: [created.person.id],
      }),
    });
    assert.equal(eventResponse.status, 201, await eventResponse.text());

    const queueResponse = await fetch(`${base}/api/networking/research-queue`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        organization_id: organization.id,
        organization_name: organization.name,
        personas: ['peer'],
      }),
    });
    const queueBody = await queueResponse.text();
    assert.equal(queueResponse.status, 201, queueBody);
    const order = JSON.parse(queueBody).order;

    for (const [action, payload] of [
      ['start', {}],
      ['review_ready', { candidate_person_ids: [created.person.id] }],
      ['complete', {}],
    ]) {
      const transitionResponse = await fetch(
        `${base}/api/networking/research-queue/${encodeURIComponent(order.id)}`,
        {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action, ...payload }),
        },
      );
      assert.equal(transitionResponse.status, 200, await transitionResponse.text());
    }

    const queueReadResponse = await fetch(`${base}/api/networking/research-queue`);
    const queueReadModel = await queueReadResponse.json();
    assert.equal(queueReadModel.pending_count, 0);
    assert.equal(queueReadModel.completed[0].status, 'completed');

    const streamController = new AbortController();
    const streamResponse = await fetch(`${base}/stream`, { signal: streamController.signal });
    assert.equal(streamResponse.status, 200);
    assert.match(streamResponse.headers.get('content-type'), /^text\/event-stream/);
    const streamChunk = await streamResponse.body.getReader().read();
    assert.match(new TextDecoder().decode(streamChunk.value), /event: connected/);
    streamController.abort();

    const readResponse = await fetch(`${base}/api/networking`);
    const readModel = await readResponse.json();
    const approvedPerson = readModel.people.find(person => person.id === created.person.id);
    const rejectedPerson = readModel.people.find(person => person.id === rejectedCandidate.person.id);
    assert.equal(approvedPerson.relationship_stage, 'contacted');
    assert.equal(approvedPerson.review_status, 'approved');
    assert.equal(approvedPerson.gmail_thread_url, 'https://mail.google.com/mail/u/0/#inbox/api-thread');
    assert.equal(rejectedPerson.review_status, 'rejected');
    assert.equal(readModel.tasks[0].state, 'completed');
    assert.equal(readModel.events[0].name, 'API Networking Event');
    assert.equal(readModel.edges[0].to_person_id, created.person.id);
    assert.equal(readModel.local_only, true);
  } finally {
    await new Promise(resolve => server.close(resolve));
    delete process.env.NETWORKING_DATA_FILE;
    delete process.env.NETWORKING_DASHBOARD_FILE;
    delete process.env.NETWORKING_RESEARCH_QUEUE_FILE;
    delete process.env.NETWORKING_ACTIVITY_LOG;
    rmSync(directory, { recursive: true, force: true });
  }
});
