#!/usr/bin/env node

import { processEuraxessFactory } from './lib/euraxess/factory.mjs';

const args = process.argv.slice(2);

function argValue(name, fallback = '') {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : fallback;
}

function flag(name) {
  return args.includes(name);
}

const result = await processEuraxessFactory({
  max: Number(argValue('--max', 3)) || 3,
  dryRun: flag('--dry-run'),
  force: flag('--force'),
  pollTimeoutSec: Number(argValue('--poll-timeout', flag('--dry-run') ? 1 : 120)) || 120,
}).then(value => ({ ok: true, compatibility_wrapper: true, ...value }))
  .catch(err => ({
    ok: false,
    compatibility_wrapper: true,
    generated_at: new Date().toISOString(),
    error: err?.stack || err?.message || String(err),
  }));

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
