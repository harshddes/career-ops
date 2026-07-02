import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyProposedWrite } from '../lib/autonomy/policy-gate.mjs';
import { safeRelativePath, validateAutonomyResult } from '../lib/autonomy/schemas.mjs';

test('dry-run mode never allows report writes automatically', () => {
  const decision = classifyProposedWrite(
    { action: 'report_draft', relative_path: 'reports/099-demo.md' },
    { AUTONOMY_MODE: 'dry_run' }
  );
  assert.equal(decision.lane, 'dry_run');
  assert.equal(decision.allowed, false);
  assert.equal(decision.requiresApproval, true);
});

test('forbidden submission actions stay blocked', () => {
  const decision = classifyProposedWrite(
    { action: 'submit_application', summary: 'submit this role' },
    { AUTONOMY_MODE: 'auto_safe', AUTONOMY_REQUIRE_APPROVAL_FOR_WRITES: 'false' }
  );
  assert.equal(decision.lane, 'forbidden');
  assert.equal(decision.allowed, false);
});

test('paths must stay inside approved roots', () => {
  assert.equal(safeRelativePath('reports/demo.md', ['reports']), 'reports/demo.md');
  assert.equal(safeRelativePath('../cv.md', ['reports']), null);
  assert.equal(safeRelativePath('data/applications.md', ['reports']), null);
});

test('model output is normalized into structured proposed writes', () => {
  const result = validateAutonomyResult({
    verdict: 'evaluate',
    score: 3.8,
    summary: 'Reasonable secondary fit.',
    proposed_writes: [
      { action: 'tracker_addition', summary: 'Add pending evaluation row.', relative_path: 'batch/tracker-additions/demo.tsv' },
    ],
  });
  assert.equal(result.verdict, 'evaluate');
  assert.equal(result.proposed_writes[0].action, 'tracker_addition');
  assert.equal(result.proposed_writes[0].risk, 'medium');
});
