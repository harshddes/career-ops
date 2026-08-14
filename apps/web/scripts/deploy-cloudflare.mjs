#!/usr/bin/env node
/** Deploy the Hono Worker. No-op without CLOUDFLARE_API_TOKEN. */
import { spawnSync } from 'node:child_process';

if (!process.env.CLOUDFLARE_API_TOKEN && !process.env.CF_API_TOKEN) {
  console.log('CLOUDFLARE_API_TOKEN unset — skip Cloudflare deploy.');
  process.exit(0);
}

function run(args, { input } = {}) {
  const result = spawnSync('npx', ['wrangler', ...args], {
    stdio: input == null ? 'inherit' : ['pipe', 'inherit', 'inherit'],
    input,
    env: process.env,
  });
  return result.status ?? 1;
}

const deployStatus = run(['deploy']);
if (deployStatus !== 0) process.exit(deployStatus);

const secrets = [
  'DATABASE_URL',
  'GOOGLE_CLIENT_ID',
  'GOOGLE_CLIENT_SECRET',
  'RESEND_API_KEY',
  'CATALOG_SERVICE_KEY',
  'APP_BASE_URL',
];
for (const name of secrets) {
  const value = process.env[name];
  if (!value) continue;
  const status = run(['secret', 'put', name], { input: value });
  if (status !== 0) process.exit(status);
}

process.exit(0);
