import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { loadPhdResearchSources } from '../lib/phd-research-sources.mjs';

test('loads dynamic PhD research source registry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'career-ops-phd-sources-'));
  const file = join(dir, 'phd-prospect-sources.json');
  writeFileSync(file, JSON.stringify({
    sources: [
      {
        id: 'euraxess-fusion',
        label: 'EURAXESS Fusion',
        prospects_file: 'euraxess-fusion-research-prospects.json',
      },
    ],
  }));

  const registry = loadPhdResearchSources(file);
  assert.equal(registry.sources.length, 1);
  assert.equal(registry.sources[0].id, 'euraxess-fusion');
  assert.equal(registry.sources[0].api_prefix, '/api/phd-research-prospects/euraxess-fusion');
});

test('registers the imported professor list as a PhD advisor source', () => {
  const registry = loadPhdResearchSources();
  const source = registry.sources.find(item => item.id === 'professor-list');
  assert.ok(source);
  assert.equal(source.prospects_file, 'professor-list-research-prospects.json');
  assert.equal(source.api_prefix, '/api/phd-research-prospects/professor-list');
});
