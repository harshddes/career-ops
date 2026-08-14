#!/usr/bin/env node
/** Deploy the Hono Worker. No-op without CLOUDFLARE_API_TOKEN. */
import { spawnSync } from 'node:child_process';

if (!process.env.CLOUDFLARE_API_TOKEN && !process.env.CF_API_TOKEN) {
  console.log('CLOUDFLARE_API_TOKEN unset — skip Cloudflare deploy.');
  process.exit(0);
}

function run(args, { input } = {}) {
  const result = spawnSync('npx', ['wrangler', ...args], {
    encoding: 'utf8',
    stdio: input == null ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
    input,
    env: process.env,
  });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return {
    status: result.status ?? 1,
    out: `${result.stdout || ''}\n${result.stderr || ''}`,
  };
}

function parseWorkersDevUrl(text) {
  const match = String(text || '').match(/https:\/\/[a-z0-9.-]+\.workers\.dev/i);
  return match ? match[0].replace(/\/$/, '') : '';
}

async function smokeCheck(url) {
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) {
    throw new Error(`Smoke check failed: ${url} -> ${res.status}`);
  }
  console.log(`Smoke check ok: ${url} -> ${res.status}`);
}

async function main() {
  const deploy = run(['deploy']);
  if (deploy.status !== 0) process.exit(deploy.status);

  const fromWrangler = parseWorkersDevUrl(deploy.out);
  if (!process.env.APP_BASE_URL && fromWrangler) {
    process.env.APP_BASE_URL = fromWrangler;
    console.log(`APP_BASE_URL unset — using ${fromWrangler}`);
  }

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
    const status = run(['secret', 'put', name], { input: value }).status;
    if (status !== 0) process.exit(status);
  }

  const publicUrl = process.env.APP_BASE_URL || fromWrangler;
  if (publicUrl) await smokeCheck(publicUrl);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
