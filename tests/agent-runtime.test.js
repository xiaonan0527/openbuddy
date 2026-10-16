import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAgent } from '../server/agent.js';
import { requestResponse, publicProvider } from '../server/provider.js';

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuddy-agent-test-'));
const previousHome = process.env.CODEX_HOME, originalFetch = globalThis.fetch;
const codex = path.join(temporary, 'codex'); fs.mkdirSync(codex);
fs.writeFileSync(path.join(codex, 'config.toml'), 'model="test-model"\nmodel_provider="test"\n[model_providers.test]\nbase_url="http://127.0.0.1:9999"\nwire_api="responses"\nexperimental_bearer_token="local-test-credential-value"\n');
process.env.CODEX_HOME = codex;
test.after(() => { if (previousHome === undefined) delete process.env.CODEX_HOME; else process.env.CODEX_HOME = previousHome; globalThis.fetch = originalFetch; fs.rmSync(temporary, { recursive: true, force: true }); });

function sse(output, text = '') {
  const chunks = [];
  if (text) chunks.push({ type: 'response.output_text.delta', delta: text });
  chunks.push({ type: 'response.completed', response: { status: 'completed', output, usage: { input_tokens: 10, output_tokens: 5 } } });
  return new Response(chunks.map(event => `data: ${JSON.stringify(event)}\n\n`).join(''), { headers: { 'content-type': 'text/event-stream' } });
}
function message(text) { return { type: 'message', role: 'assistant', content: [{ type: 'output_text', text }] }; }
function call(name, args) { return { type: 'function_call', name, call_id: `call-${name}`, arguments: JSON.stringify(args) }; }
function setup(mode = 'default') {
  const workspacePath = fs.mkdtempSync(path.join(temporary, 'workspace-'));
  const task = { id: 'task', title: 'test', workspaceId: 'w', mode, skillIds: [], messages: [{ role: 'user', content: '完成工作' }], events: [], artifactPaths: [] };
  const store = { state: { tasks: [task], settings: { maxSteps: 6 }, experts: [], skills: [], library: [] }, workspace: () => ({ id: 'w', name: '测试', path: workspacePath }), save() {}, log() {} };
  const agent = createAgent({ store, notify() {}, connectors: { getTools: () => [], call: () => { throw new Error('should not run'); } } });
  return { agent, store, task, workspacePath };
}
async function pending(task) { for (let n = 0; n < 100; n++) { const event = task.events.find(e => e.type === 'approval' && e.status === 'pending'); if (event) return event; await new Promise(resolve => setTimeout(resolve, 5)); } throw new Error('Approval did not appear'); }

test('public provider never contains local credential', () => { const provider = publicProvider(); assert.equal(provider.configured, true); assert.equal(JSON.stringify(provider).includes('local-test-credential-value'), false); });

test('agent executes a real file tool and registers artifact before completion', async () => {
  const { agent, task, workspacePath, store } = setup(); let count = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    if (++count === 1) return sse([call('write_file', { path: 'result.md', content: '# 已完成' })]);
    assert.ok(body.input.some(i => i.type === 'function_call_output' && JSON.parse(i.output).path === 'result.md'));
    return sse([message('已生成 result.md')], '已生成 result.md');
  };
  const run = agent.run(task.id), consent = await pending(task);
  assert.equal(fs.existsSync(path.join(workspacePath, 'result.md')), false);
  agent.approve(task.id, consent.requestId, true); await run;
  assert.equal(task.status, 'completed'); assert.equal(fs.readFileSync(path.join(workspacePath, 'result.md'), 'utf8'), '# 已完成');
  assert.deepEqual(task.artifactPaths, ['result.md']); assert.equal(store.state.library.length, 1); assert.equal(agent.active(task.id), false);
});

test('readOnly rejects a model that attempts an unavailable mutation tool', async () => {
  const { agent, task, workspacePath } = setup('readOnly'); let count = 0;
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body); assert.equal(body.tools.some(t => t.name === 'write_file'), false);
    if (++count === 1) return sse([call('write_file', { path: 'denied.md', content: 'must not exist' })]);
    assert.match(body.input.find(i => i.type === 'function_call_output').output, /只读/);
    return sse([message('只读模式没有修改文件')]);
  };
  await agent.run(task.id); assert.equal(task.status, 'completed'); assert.equal(fs.existsSync(path.join(workspacePath, 'denied.md')), false);
});

test('shell waits for exact UI approval then returns actual process output', async () => {
  const { agent, task } = setup(); let count = 0;
  globalThis.fetch = async (_url, options) => {
    if (++count === 1) return sse([call('run_shell', { command: 'printf openbuddy-test' })]);
    const output = JSON.parse(JSON.parse(options.body).input.find(i => i.type === 'function_call_output').output);
    assert.equal(output.output, 'openbuddy-test'); assert.equal(output.code, 0);
    return sse([message('命令已完成')]);
  };
  const run = agent.run(task.id), approval = await pending(task);
  assert.equal(task.status, 'awaiting_approval'); assert.equal(agent.approve(task.id, 'wrong-id', true), false);
  assert.equal(agent.approve(task.id, approval.requestId, true), true); await run;
  assert.equal(task.status, 'completed'); assert.equal(approval.status, 'approved');
});

test('stopping pending approval never executes command and exits cleanly', async () => {
  const { agent, task, workspacePath } = setup();
  globalThis.fetch = async () => sse([call('run_shell', { command: 'touch should-not-exist' })]);
  const run = agent.run(task.id); const approval = await pending(task); agent.stop(task.id); await run;
  assert.equal(task.status, 'stopped'); assert.equal(approval.status, 'denied'); assert.equal(fs.existsSync(path.join(workspacePath, 'should-not-exist')), false);
});

test('truncated model stream fails rather than recording fake success', async () => {
  globalThis.fetch = async () => new Response(`data: ${JSON.stringify({ type: 'response.output_text.delta', delta: 'partial' })}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
  await assert.rejects(requestResponse({ input: 'test' }), /中断/);
});

test('model service errors redact the exact local credential', async () => {
  globalThis.fetch = async () => new Response(JSON.stringify({ error: { message: 'bad local-test-credential-value' } }), { status: 401 });
  try { await requestResponse({ input: 'test' }); assert.fail('must fail'); }
  catch (error) { assert.match(error.message, /HTTP 401/); assert.equal(error.message.includes('local-test-credential-value'), false); }
});
