import test from 'node:test';
import assert from 'node:assert/strict';
import { startFastServer } from '../server-fast.mjs';
import {
  readResearchProspects,
  writeResearchProspects,
  syncResearchProspectsToDashboard,
} from '../lib/research-prospect-store.mjs';

test('fast server PATCH updates U-M research prospect status', async () => {
  const id = `umich-test-status-${Date.now()}`;
  const before = readResearchProspects({ source: 'umich' });
  writeResearchProspects({
    ...before,
    prospects: [
      ...(before.prospects || []).filter(p => p.id !== id),
      {
        id,
        name: 'Status Patch Probe',
        title: 'Assistant Professor',
        department: 'Mechanical Engineering',
        profile_url: `https://example.test/${id}`,
        contact_email: '',
        score: 2.5,
        tier: 'C',
        status: 'not_contacted',
        research_keywords: ['test'],
        methods: ['test'],
        transfer_vectors: ['DAQ'],
        evidence: [{ type: 'source', label: 'test', url: `https://example.test/${id}`, date: '2026-07-09' }],
        fit_rationale: 'Temporary probe for fast-server PATCH.',
        outreach_angle: 'Ignore.',
        likely_route: 'test',
      },
    ],
  }, { source: 'umich', preserveUserState: true });
  syncResearchProspectsToDashboard({ institution: 'umich' });

  const server = await startFastServer(0, '127.0.0.1');
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/research-prospects/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'contacted' }),
    });
    const bodyText = await res.text();
    assert.equal(res.status, 200, bodyText);
    const body = JSON.parse(bodyText);
    assert.equal(body.prospect?.id, id);
    assert.equal(body.prospect?.status, 'contacted');

    const stored = readResearchProspects({ source: 'umich' });
    const prospect = stored.prospects.find(p => p.id === id);
    assert.equal(prospect?.status, 'contacted');
  } finally {
    await new Promise(resolve => server.close(resolve));
    const after = readResearchProspects({ source: 'umich' });
    writeResearchProspects({
      ...after,
      prospects: (after.prospects || []).filter(p => p.id !== id),
    }, { source: 'umich', preserveUserState: true });
    syncResearchProspectsToDashboard({ institution: 'umich' });
  }
});

test('fast server rejects unknown research prospect PATCH with JSON 404', async () => {
  const server = await startFastServer(0, '127.0.0.1');
  try {
    const { port } = server.address();
    const res = await fetch(`http://127.0.0.1:${port}/api/research-prospects/does-not-exist-${Date.now()}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status: 'contacted' }),
    });
    assert.equal(res.status, 404);
    const body = await res.json();
    assert.match(String(body.error || ''), /not found/i);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
