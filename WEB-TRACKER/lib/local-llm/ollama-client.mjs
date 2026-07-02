import { AUTONOMY_RESULT_JSON_SCHEMA } from '../autonomy/schemas.mjs';
import { OLLAMA_HOST, ollamaStatus } from './ollama-runtime.mjs';

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, cancel: () => clearTimeout(timer) };
}

export class OllamaNativeClient {
  constructor({ host = OLLAMA_HOST, model = null, timeoutMs = 180_000 } = {}) {
    this.host = String(host || OLLAMA_HOST).replace(/\/+$/, '');
    this.model = model || process.env.LOCAL_LLM_MODEL || null;
    this.timeoutMs = timeoutMs;
  }

  async health() {
    const status = await ollamaStatus();
    if (status.selected_model) this.model = status.selected_model;
    return status;
  }

  async chatJSON({ system, user, temperature = 0, schema = AUTONOMY_RESULT_JSON_SCHEMA } = {}) {
    if (!this.model) {
      const status = await this.health();
      if (!status.selected_model) throw new Error('No Ollama model is installed. Pull a fallback model first.');
    }

    const { controller, cancel } = withTimeout(this.timeoutMs);
    try {
      const res = await fetch(`${this.host}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          stream: false,
          format: schema,
          options: { temperature },
          messages: [
            { role: 'system', content: system || 'Return strict JSON only.' },
            { role: 'user', content: user || '' },
          ],
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || res.statusText);
      const parsed = JSON.parse(text);
      const content = parsed.message?.content;
      if (!content) throw new Error('Ollama returned no message content');
      return content;
    } finally {
      cancel();
    }
  }
}

export async function ollamaJsonSanity({ model = null } = {}) {
  const client = new OllamaNativeClient({ model });
  const raw = await client.chatJSON({
    system: 'Return strict JSON only.',
    user: JSON.stringify({
      instruction: 'Return a minimal valid autonomy result.',
      required: ['verdict', 'summary', 'proposed_writes'],
    }),
    schema: AUTONOMY_RESULT_JSON_SCHEMA,
  });
  return JSON.parse(raw);
}
