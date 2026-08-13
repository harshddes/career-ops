import test from 'node:test';
import assert from 'node:assert/strict';

import {
  collectApiPaths,
  isPrivateDataFile,
  sanitizeActivityNdjson,
  sanitizeProfessorGmailData,
  sanitizeStaticApiPayload,
} from '../lib/generate-static-snapshot.mjs';

test('static snapshot includes PhD, EURAXESS, and U-M Careers live feed paths', () => {
  const paths = collectApiPaths([
    { id: 'kth' },
  ]);

  assert.ok(paths.includes('/api/phd-research-prospects/kth'));
  assert.ok(paths.includes('/api/euraxess/opportunities'));
  assert.ok(paths.includes('/api/euraxess/health'));
  assert.ok(paths.includes('/api/umich-careers/opportunities'));
  assert.ok(paths.includes('/api/umich-careers/health'));
  assert.equal(paths.includes('/api/networking'), false);
});

test('static snapshot excludes private networking records and work orders', () => {
  assert.equal(isPrivateDataFile('networking.json'), true);
  assert.equal(isPrivateDataFile('networking-research-queue.json'), true);
  assert.equal(isPrivateDataFile('networking-activity.ndjson'), true);
  assert.equal(isPrivateDataFile('jobs-to-consider.json'), false);
});

test('static snapshot removes networking events from shared activity data', () => {
  const publicEvent = JSON.stringify({ domain: 'jobs', subject_label: 'Public role' });
  const privateEvent = JSON.stringify({
    domain: 'networking',
    subject_label: 'Private person',
    metadata: { gmail_thread_url: 'https://mail.google.com/mail/u/0/#inbox/private' },
  });
  const sanitized = sanitizeActivityNdjson(`${publicEvent}\n${privateEvent}\n`);

  assert.match(sanitized, /Public role/);
  assert.doesNotMatch(sanitized, /Private person|mail\.google\.com/);
});

test('static Today API removes networking rows and private metadata', () => {
  const payload = sanitizeStaticApiPayload('/api/today-activity?date=2026-07-21', {
    details: {
      audit_activity: [
        { type: 'job_applied', source: 'Jobs', title: 'Public role' },
        {
          type: 'networking_person_saved',
          source: 'Networking Command Center',
          contact: 'Private person',
          notes: 'Private note',
        },
      ],
      all_activity: [
        { type: 'application', source: 'Applications', title: 'Public role' },
        { type: 'networking_task_completed', source: 'Networking Command Center' },
      ],
    },
  });

  assert.equal(payload.details.audit_activity.length, 1);
  assert.equal(payload.details.all_activity.length, 1);
  assert.doesNotMatch(JSON.stringify(payload), /Private person|Private note|networking_/);
});

test('static professor snapshots remove promoted and raw Gmail links', () => {
  const payload = sanitizeStaticApiPayload('/api/phd-research-prospects/professor-list', {
    prospects: [{
      id: 'professor-list-ada',
      name: 'Ada Lovelace',
      gmail_thread_url: 'https://mail.google.com/mail/u/0/#inbox/private',
      source_details: {
        email_audit: {
          'Direct Gmail Thread URL': 'https://mail.google.com/mail/u/0/#inbox/private',
          'Crisp Thread Outcome': 'Public-safe summary',
        },
      },
    }],
  });

  assert.equal(payload.prospects[0].gmail_thread_url, undefined);
  assert.equal(payload.prospects[0].source_details.email_audit['Direct Gmail Thread URL'], undefined);
  assert.equal(payload.prospects[0].source_details.email_audit['Crisp Thread Outcome'], 'Public-safe summary');
  assert.doesNotMatch(JSON.stringify(sanitizeProfessorGmailData(payload)), /mail\.google\.com/);
});
