import test from 'node:test';
import assert from 'node:assert/strict';
import { requestResponse, PROVIDER_PRESETS } from '../server/provider.js';

const originalFetch = globalThis.fetch;
test.after(() => { globalThis.fetch = originalFetch; });
const provider = { baseUrl: 'https://api.moonshot.cn/v1', apiKey: 'fixture-secret-key', model: 'kimi-k2.5', protocol: 'chat_completions' };
function sse(chunks) { return new Response(`${chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('')}data: [DONE]\n\n`, { headers: { 'content-type': 'text/event-stream' } }); }

test('Chat Completions stream normalizes text and split tool calls while retaining reasoning', async () => {
  let request;
  globalThis.fetch = async (url, options) => { request = { url: String(url), body: JSON.parse(options.body), authorization: options.headers.Authorization }; return sse([
    { choices: [{ delta: { reasoning_content: '先判断。', content: '读取文件', tool_calls: [{ index: 0, id: 'call-1', function: { name: 'read_', arguments: '{"path":' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'file', arguments: '"x.md"}' } }] } }] },
    { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 11, completion_tokens: 4 } }
  ]); };
  const result = await requestResponse({ provider, model: provider.model, instructions: 'system rules', tools: [{ name: 'read_file', description: 'read', parameters: { type: 'object', properties: {} } }], input: [{ role: 'user', content: 'inspect' }] });
  assert.equal(request.url, 'https://api.moonshot.cn/v1/chat/completions'); assert.equal(request.authorization, `Bearer ${provider.apiKey}`);
  assert.equal(result.text, '读取文件'); assert.equal(result.usage.input_tokens, 11);
  assert.equal(result.output[0].reasoning_content, '先判断。');
  assert.deepEqual(result.output[1], { type: 'function_call', call_id: 'call-1', name: 'read_file', arguments: '{"path":"x.md"}' });
  assert.equal(request.body.tools[0].function.name, 'read_file');
});

test('tool continuation maps to one assistant message with reasoning, tool call and tool result', async () => {
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    const assistant = body.messages.find(item => item.role === 'assistant' && item.tool_calls);
    assert.equal(assistant.reasoning_content, '保留推理签名');
    assert.equal(assistant.content, '现在调用工具');
    assert.deepEqual(assistant.tool_calls, [{ id: 'call-2', type: 'function', function: { name: 'read_file', arguments: '{"path":"x.md"}' } }]);
    assert.deepEqual(body.messages.at(-1), { role: 'tool', tool_call_id: 'call-2', content: '读取结果' });
    return sse([{ choices: [{ delta: { content: '完成' }, finish_reason: 'stop' }] }]);
  };
  const result = await requestResponse({ provider, input: [
    { role: 'user', content: 'inspect' },
    { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: '现在调用工具' }], reasoning_content: '保留推理签名' },
    { type: 'function_call', call_id: 'call-2', name: 'read_file', arguments: '{"path":"x.md"}' },
    { type: 'function_call_output', call_id: 'call-2', output: '读取结果' }
  ] });
  assert.equal(result.text, '完成');
});

test('non-stream Chat Completions result is normalized too', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ choices: [{ message: { content: 'OK', reasoning_content: 'reason', tool_calls: [{ id: 'c', function: { name: 'read_file', arguments: '{"path":"a"}' } }] } }], usage: { total_tokens: 5 } }), { headers: { 'content-type': 'application/json' } });
  const result = await requestResponse({ provider, input: [] });
  assert.equal(result.text, 'OK'); assert.equal(result.output[0].reasoning_content, 'reason'); assert.equal(result.output[1].call_id, 'c');
});

test('interrupted or length-limited chat output is never accepted as complete', async () => {
  globalThis.fetch = async () => new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
  await assert.rejects(requestResponse({ provider, input: [] }), /中断/);
  globalThis.fetch = async () => sse([{ choices: [{ delta: { content: 'partial' }, finish_reason: 'length' }] }]);
  await assert.rejects(requestResponse({ provider, input: [] }), /length/);
});

test('provider errors redact the supplied credential', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: `bad ${provider.apiKey}` } }), { status: 401 });
  await assert.rejects(requestResponse({ provider, input: [] }), error => /HTTP 401/.test(error.message) && !error.message.includes(provider.apiKey));
});

test('all four domestic presets call their own Chat Completions endpoint', async () => {
  for (const preset of PROVIDER_PRESETS.filter(item => item.id !== 'custom')) {
    globalThis.fetch = async (url, options) => {
      assert.equal(String(url), preset.baseUrl + '/chat/completions');
      const body = JSON.parse(options.body);
      assert.equal(body.model, 'fixture-domestic-model');
      if (preset.id === 'minimax-cn') assert.equal(body.reasoning_split, true);
      return sse([{ choices: [{ delta: { content: 'OK' }, finish_reason: 'stop' }] }]);
    };
    const result = await requestResponse({ provider: { ...preset, preset: preset.id, model: 'fixture-domestic-model', apiKey: 'fixture-domestic-key' }, input: [{ role: 'user', content: 'hello' }] });
    assert.equal(result.text, 'OK');
  }
});
