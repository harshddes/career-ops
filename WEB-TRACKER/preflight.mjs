#!/usr/bin/env node
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { runPreflight } from './lib/preflight.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const CAREER_OPS = join(BASE, '..');
const args = process.argv.slice(2);
const result = await runPreflight({
  trackerDir: BASE,
  careerOpsDir: CAREER_OPS,
  checkHealth: args.includes('--health'),
  port: Number(process.env.PORT || 3737),
});

console.log(JSON.stringify(result, null, 2));
process.exit(result.ok ? 0 : 1);
