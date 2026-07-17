import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  exhibitorCompanyId,
  normalizeExhibitorCompany,
  writeExhibitorCompanies,
  readExhibitorCompanies,
  upsertExhibitorCompany,
  patchExhibitorCompany,
} from '../lib/exhibitor/company-store.mjs';

test('exhibitorCompanyId is stable', () => {
  assert.equal(
    exhibitorCompanyId({ event: 'smallsat-2026', name: 'Rocket Lab' }),
    'exhibitor-smallsat-2026-rocket-lab',
  );
});

test('normalize + upsert + patch roundtrip', () => {
  const dir = mkdtempSync(join(tmpdir(), 'exhibitor-store-'));
  const file = join(dir, 'exhibitor-companies.json');
  try {
    const company = normalizeExhibitorCompany({
      name: 'Test Co',
      booth: '42',
      event: 'smallsat-2026',
      batch: 'N-R',
    });
    upsertExhibitorCompany(company, file);
    const store = readExhibitorCompanies(file);
    assert.equal(store.companies.length, 1);
    assert.equal(store.companies[0].worker_status, 'seeded');

    const patched = patchExhibitorCompany(company.id, {
      worker_status: 'research_ready',
      research_report: 'reports/exhibitor-test-co-2026-07-13.md',
      jobs_found: [{ id: 'job-1', title: 'Test Engineer', url: 'https://example.com/j', score: '4.0/5' }],
    }, file);
    assert.equal(patched.company.worker_status, 'research_ready');
    assert.equal(patched.company.resources.report_md, 'reports/exhibitor-test-co-2026-07-13.md');
    assert.equal(patched.company.jobs_found.length, 1);

    writeExhibitorCompanies(patched.store, file);
    const again = readExhibitorCompanies(file);
    assert.equal(again.summary.roles_linked, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
