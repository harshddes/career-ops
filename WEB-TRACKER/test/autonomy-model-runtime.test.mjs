import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'http';
import { OllamaNativeClient } from '../lib/local-llm/ollama-client.mjs';
import { selectModel } from '../lib/local-llm/ollama-runtime.mjs';

function withServer(handler) {
  return new Promise(resolve => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () => new Promise(done => server.close(done)),
      });
    });
  });
}

test('model selection falls back to installed smaller model', () => {
  const selected = selectModel(['qwen2.5:3b'], ['gpt-oss:20b', 'qwen2.5:7b', 'qwen2.5:3b']);
  assert.equal(selected.selected, 'qwen2.5:3b');
  assert.deepEqual(selected.missing, ['gpt-oss:20b', 'qwen2.5:7b']);
});

test('ollama native client parses structured JSON response', async () => {
  const server = await withServer((req, res) => {
    if (req.url !== '/api/chat') {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      message: {
        content: JSON.stringify({
          verdict: 'needs_review',
          summary: 'Mocked result.',
          proposed_writes: [],
        }),
      },
    }));
  });

  try {
    const client = new OllamaNativeClient({ host: server.url, model: 'qwen2.5:3b' });
    const raw = await client.chatJSON({ system: 'JSON only', user: 'test' });
    const parsed = JSON.parse(raw);
    assert.equal(parsed.verdict, 'needs_review');
    assert.deepEqual(parsed.proposed_writes, []);
  } finally {
    await server.close();
  }
});
