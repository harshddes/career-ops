#!/usr/bin/env node
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { AgentTaskQueue } from './lib/agent-task-queue.mjs';
import { createAutonomyOrchestrator } from './lib/autonomy/orchestrator.mjs';
import { ollamaJsonSanity } from './lib/local-llm/ollama-client.mjs';
import { pullOllamaModel, startOllama } from './lib/local-llm/ollama-runtime.mjs';

const BASE = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(BASE, 'data');
const CAREER_OPS = join(BASE, '..');
const args = process.argv.slice(2);

function argValue(name, fallback = null) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

const taskQueue = new AgentTaskQueue(join(DATA_DIR, 'agent-tasks.ndjson'));
const autonomy = createAutonomyOrchestrator({
  dataDir: DATA_DIR,
  careerOpsDir: CAREER_OPS,
  taskQueue,
});

if (args.includes('--health')) {
  console.log(JSON.stringify(await autonomy.modelHealth(), null, 2));
  process.exit(0);
}

if (args.includes('--budget')) {
  console.log(JSON.stringify(autonomy.researchBudget(), null, 2));
  process.exit(0);
}

if (args.includes('--model-start')) {
  console.log(JSON.stringify(await startOllama(), null, 2));
  process.exit(0);
}

if (args.includes('--model-pull')) {
  console.log(JSON.stringify(await pullOllamaModel(argValue('--model')), null, 2));
  process.exit(0);
}

if (args.includes('--json-sanity')) {
  console.log(JSON.stringify(await ollamaJsonSanity({ model: argValue('--model') }), null, 2));
  process.exit(0);
}

const result = await autonomy.runPending({
  maxTasks: Number(argValue('--max', 1)),
  pollTimeoutSec: Number(argValue('--poll-timeout', 120)),
  researchOnly: args.includes('--research-only'),
});
console.log(JSON.stringify(result, null, 2));
