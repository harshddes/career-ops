import test from 'node:test';
import assert from 'node:assert/strict';

import { collectApiPaths } from '../lib/generate-static-snapshot.mjs';

test('static snapshot includes PhD source paths and EURAXESS live feed paths', () => {
  const paths = collectApiPaths([
    { id: 'kth' },
  ]);

  assert.ok(paths.includes('/api/phd-research-prospects/kth'));
  assert.ok(paths.includes('/api/euraxess/opportunities'));
  assert.ok(paths.includes('/api/euraxess/health'));
});
