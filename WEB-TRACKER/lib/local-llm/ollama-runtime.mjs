import { execFile, spawn } from 'child_process';

export const OLLAMA_HOST = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
export const DEFAULT_MODEL_CHAIN = [
  process.env.LOCAL_LLM_MODEL,
  'gpt-oss:20b',
  'qwen2.5:7b',
  'qwen2.5:3b',
].filter(Boolean);

function ollamaCandidates() {
  return [
    'ollama',
    process.env.LOCALAPPDATA ? `${process.env.LOCALAPPDATA}\\Programs\\Ollama\\ollama.exe` : null,
    process.env.USERPROFILE ? `${process.env.USERPROFILE}\\AppData\\Local\\Programs\\Ollama\\ollama.exe` : null,
  ].filter(Boolean);
}

function checkCommand(command) {
  return new Promise(resolve => {
    execFile(command, ['--version'], { timeout: 8_000, windowsHide: true }, (err, stdout = '', stderr = '') => {
      resolve({
        ok: !err,
        command,
        detail: (stdout || stderr || err?.message || '').trim(),
      });
    });
  });
}

async function findOllamaCommand() {
  const results = [];
  for (const command of ollamaCandidates()) {
    const result = await checkCommand(command);
    results.push(result);
    if (result.ok) return result;
  }
  return results[0] || { ok: false, command: 'ollama', detail: 'ollama command not found' };
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || 8_000);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    const text = await res.text();
    if (!res.ok) throw new Error(text || res.statusText);
    return text ? JSON.parse(text) : {};
  } finally {
    clearTimeout(timer);
  }
}

function modelNames(tagsResponse) {
  return Array.isArray(tagsResponse?.models)
    ? tagsResponse.models.map(model => model.name || model.model).filter(Boolean)
    : [];
}

export function selectModel(installedModels = [], chain = DEFAULT_MODEL_CHAIN) {
  const installed = new Set(installedModels);
  const configured = process.env.LOCAL_LLM_MODEL;
  const selected = chain.find(model => installed.has(model)) || installedModels[0] || null;
  const missing = chain.filter(model => !installed.has(model));
  return {
    configured,
    selected,
    preferred: chain[0] || null,
    chain,
    missing,
  };
}

function repairActions({ installed, server, selected, missing }) {
  if (!installed) {
    return [{
      id: 'install_ollama',
      label: 'Install Ollama',
      kind: 'manual',
      command: 'winget install --id Ollama.Ollama',
      description: 'Install the free local model runtime. Run only after you approve the installer.',
    }];
  }
  if (!server) {
    return [{
      id: 'start_ollama',
      label: 'Start Ollama',
      kind: 'server_action',
      endpoint: '/api/autonomy/model/start',
      description: 'Start the local Ollama server on this machine.',
    }];
  }
  if (!selected) {
    return [{
      id: 'pull_fallback_model',
      label: 'Pull fallback model',
      kind: 'server_action',
      endpoint: '/api/autonomy/model/pull',
      model: missing[0] || 'qwen2.5:3b',
      description: 'Download a free local model that can produce structured JSON.',
    }];
  }
  return [{
    id: 'json_sanity_test',
    label: 'Run JSON sanity test',
    kind: 'server_action',
    endpoint: '/api/autonomy/model/json-sanity',
    model: selected,
    description: 'Verify the selected local model can return strict JSON.',
  }];
}

export async function ollamaStatus() {
  const cli = await findOllamaCommand();
  let server = null;
  let models = [];
  let serverDetail = null;

  try {
    server = await fetchJson(`${OLLAMA_HOST}/api/version`);
    models = modelNames(await fetchJson(`${OLLAMA_HOST}/api/tags`));
  } catch (err) {
    serverDetail = err.name === 'AbortError' ? 'Ollama server timed out.' : err.message;
  }

  const selection = selectModel(models);
  const ok = Boolean(cli.ok && server && selection.selected);
  const actions = repairActions({
    installed: cli.ok,
    command: cli.ok ? cli.command : 'ollama',
    server: Boolean(server),
    selected: selection.selected,
    missing: selection.missing,
  });

  return {
    provider: 'ollama',
    ok,
    installed: cli.ok,
    install_command: 'winget install --id Ollama.Ollama',
    server_running: Boolean(server),
    host: OLLAMA_HOST,
    base_url: `${OLLAMA_HOST}/v1`,
    version: server?.version || null,
    cli_detail: cli.detail,
    server_detail: serverDetail,
    models,
    model: selection.selected,
    selected_model: selection.selected,
    preferred_model: selection.preferred,
    configured_model: selection.configured || null,
    fallback_chain: selection.chain,
    missing_models: selection.missing,
    detail: ok
      ? `Ollama is ready with ${selection.selected}.`
      : 'Ollama needs setup before local reasoning can run.',
    repair_actions: actions,
  };
}

export async function waitForOllama({ timeoutMs = 20_000 } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const status = await ollamaStatus();
    if (status.server_running) return status;
    await new Promise(resolve => setTimeout(resolve, 1_000));
  }
  return ollamaStatus();
}

export async function startOllama() {
  const before = await ollamaStatus();
  if (!before.installed) {
    return {
      ...before,
      started: false,
      detail: 'Ollama is not installed. Install it first, then start the server.',
    };
  }
  if (before.server_running) return { ...before, started: false, detail: 'Ollama server is already running.' };

  const child = spawn(before.command, ['serve'], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  const after = await waitForOllama();
  return { ...after, started: after.server_running };
}

export async function pullOllamaModel(model = null) {
  const status = await ollamaStatus();
  if (!status.installed) throw new Error('Ollama is not installed. Run: winget install --id Ollama.Ollama');
  if (!status.server_running) await startOllama();

  const modelToPull = model || status.missing_models[0] || 'qwen2.5:3b';
  await new Promise((resolve, reject) => {
    execFile(status.command, ['pull', modelToPull], { timeout: 30 * 60_000, windowsHide: true }, (err, stdout = '', stderr = '') => {
      if (err) {
        err.stdout = stdout;
        err.stderr = stderr;
        return reject(err);
      }
      resolve();
    });
  });
  return ollamaStatus();
}
