import { OpenAICompatibleLocalClient } from './openai-compatible-client.mjs';
import { OllamaNativeClient } from './ollama-client.mjs';
import { ollamaStatus } from './ollama-runtime.mjs';

export async function localModelHealth(options = {}) {
  const provider = String(options.provider || process.env.LOCAL_LLM_PROVIDER || 'ollama').toLowerCase();
  const baseUrl = options.baseUrl || process.env.LOCAL_LLM_BASE_URL || 'http://127.0.0.1:11434/v1';
  if (provider === 'ollama' || baseUrl.includes('11434')) {
    return ollamaStatus();
  }
  const client = new OpenAICompatibleLocalClient(options);
  return client.health();
}

export async function createLocalModelClient(options = {}) {
  const provider = String(options.provider || process.env.LOCAL_LLM_PROVIDER || 'ollama').toLowerCase();
  const health = await localModelHealth(options);
  if (provider === 'ollama' || health.provider === 'ollama') {
    return {
      client: new OllamaNativeClient({ model: health.selected_model || options.model }),
      health,
    };
  }
  return {
    client: new OpenAICompatibleLocalClient({
      ...options,
      model: health.selected_model || health.model || options.model,
    }),
    health,
  };
}
