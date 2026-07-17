import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

function checkJson(filePath) {
  if (!existsSync(filePath)) return { path: filePath, ok: true, missing: true };
  try {
    JSON.parse(readFileSync(filePath, 'utf-8'));
    return { path: filePath, ok: true };
  } catch (err) {
    return { path: filePath, ok: false, error: err.message };
  }
}

async function checkEndpoint(url, timeoutMs = 5000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    return { url, ok: res.ok, status: res.status };
  } catch (err) {
    return { url, ok: false, error: err.message };
  } finally {
    clearTimeout(timer);
  }
}

export async function runPreflight({ trackerDir, careerOpsDir, checkHealth = false, port = 3737 } = {}) {
  const jsonChecks = [
    join(careerOpsDir, 'data', 'jobs-to-consider.json'),
    join(careerOpsDir, 'data', 'jobs-to-consider-user-state.json'),
    join(careerOpsDir, 'data', 'research-prospect-user-state.json'),
    join(trackerDir, 'data', 'jobs-to-consider.json'),
    join(trackerDir, 'data', 'source-state.json'),
    join(trackerDir, 'data', 'phd-prospect-sources.json'),
  ].map(checkJson);
  const healthChecks = checkHealth
    ? [
      await checkEndpoint(`http://127.0.0.1:${port}/healthz`),
      await checkEndpoint(`http://127.0.0.1:${port}/api/source-health`, 8000),
    ]
    : [];
  return {
    ok: jsonChecks.every(item => item.ok) && healthChecks.every(item => item.ok),
    generated_at: new Date().toISOString(),
    json: jsonChecks,
    health: healthChecks,
  };
}
