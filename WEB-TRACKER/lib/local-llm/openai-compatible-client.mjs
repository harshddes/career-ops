function trimSlash(value) {
  return String(value || '').replace(/\/+$/, '');
}

function withTimeout(ms) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { controller, cancel: () => clearTimeout(timer) };
}

export class OpenAICompatibleLocalClient {
  constructor({ baseUrl, model, timeoutMs = 120_000 } = {}) {
    this.baseUrl = trimSlash(baseUrl || process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:11434/v1');
    this.model = model || process.env.LOCAL_LLM_MODEL || 'gpt-oss:20b';
    this.timeoutMs = timeoutMs;
  }

  async health() {
    const { controller, cancel } = withTimeout(8_000);
    try {
      const res = await fetch(`${this.baseUrl}/models`, { signal: controller.signal });
      const text = await res.text();
      if (!res.ok) {
        return { ok: false, base_url: this.baseUrl, model: this.model, detail: text || res.statusText };
      }
      let models = [];
      try {
        const parsed = JSON.parse(text);
        models = Array.isArray(parsed.data) ? parsed.data.map(item => item.id).filter(Boolean) : [];
      } catch {}
      return {
        ok: true,
        base_url: this.baseUrl,
        model: this.model,
        selected_model: models.includes(this.model) ? this.model : models[0] || null,
        models,
        detail: models.includes(this.model) ? 'Model is listed by local endpoint.' : 'Endpoint is reachable; configured model was not confirmed.',
      };
    } catch (err) {
      return {
        ok: false,
        base_url: this.baseUrl,
        model: this.model,
        detail: err.name === 'AbortError' ? 'Local model endpoint timed out.' : err.message,
      };
    } finally {
      cancel();
    }
  }

  async chatJSON({ system, user, temperature = 0.2 } = {}) {
    const { controller, cancel } = withTimeout(this.timeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          model: this.model,
          temperature,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: system || 'Return strict JSON only.' },
            { role: 'user', content: user || '' },
          ],
        }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(text || res.statusText);
      const parsed = JSON.parse(text);
      const content = parsed.choices?.[0]?.message?.content;
      if (!content) throw new Error('local model returned no message content');
      return content;
    } finally {
      cancel();
    }
  }
}
