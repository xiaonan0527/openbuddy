import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createAgent } from '../server/agent.js';
import { requestResponse, publicProvider } from '../server/provider.js';
import { Store } from '../server/store.js';

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

test('unknown side effects require an explicit skip or retry before continuation', async () => {
  const { agent, task } = setup();
  const callItem = call('run_shell', { command: 'touch duplicate-side-effect' });
  const event = { id: 'uncertain', type: 'tool', callId: callItem.call_id, tool: callItem.name, args: JSON.parse(callItem.arguments), status: 'unknown', message: '结果未知' };
  callItem.eventId = event.id;
  task.events.push(event); task.status = 'stopped';
  task.runState = { input: [{ role: 'user', content: '完成工作' }, callItem], pendingCalls: [callItem], cursor: 0, userCount: 1 };
  globalThis.fetch = async (_url, options) => {
    const body = JSON.parse(options.body);
    assert.match(body.input.at(-1).output, /用户检查后选择跳过/);
    return sse([message('已按你的选择跳过这次操作')]);
  };
  await assert.rejects(agent.run(task.id), /结果未知/);
  agent.resolveUnknown(task.id, event.id, 'skip');
  await agent.run(task.id);
  assert.equal(task.status, 'completed'); assert.equal(event.status, 'skipped');
});

test('missing deliverable blocks completed status', async () => {
  const { agent, task } = setup(); task.artifactPaths.push('missing.md');
  globalThis.fetch = async () => sse([message('已完成')]);
  await agent.run(task.id);
  assert.equal(task.status, 'failed'); assert.match(task.error, /产物验收失败/);
});

test('retry of an unknown write still requires a fresh approval and honors refusal', async () => {
  const { agent, task, workspacePath } = setup();
  const item = { ...call('write_file', { path: 'retry.md', content: 'test' }), eventId: 'retry-event' };
  task.events.push({ id: item.eventId, type: 'tool', tool: 'write_file', status: 'unknown' });
  task.runState = { input: [call('write_file', { path: 'retry.md', content: 'test' })], pendingCalls: [item], cursor: 0 };
  globalThis.fetch = async () => sse([message('操作已拒绝')]);
  agent.resolveUnknown(task.id, item.eventId, 'retry');
  const run = agent.run(task.id), consent = await pending(task);
  assert.equal(fs.existsSync(path.join(workspacePath, 'retry.md')), false);
  agent.approve(task.id, consent.requestId, false); await run;
  assert.equal(fs.existsSync(path.join(workspacePath, 'retry.md')), false);
  assert.equal(task.events[0].status, 'denied');
});

test('persisted completed tool result resumes after restart without rewriting the file', async () => {
  const root = fs.mkdtempSync(path.join(temporary, 'persisted-'));
  let store = new Store(root), workspace = store.state.workspaces[0];
  const task = { id: 'persisted', title: 'resume', workspaceId: workspace.id, mode: 'default', skillIds: [], messages: [{ id: 'user', role: 'user', content: 'write then resume' }], events: [], artifactPaths: [] };
  store.state.tasks = [task]; store.state.settings.maxSteps = 1;
  const connectors = { getTools: () => [] };
  let agent = createAgent({ store, notify() {}, connectors });
  globalThis.fetch = async () => sse([call('write_file', { path: 'saved.md', content: 'first write' })]);
  const run = agent.run(task.id), consent = await pending(task); agent.approve(task.id, consent.requestId, true); await run;
  assert.equal(task.status, 'failed'); assert.match(task.error, /步数上限/);
  fs.writeFileSync(path.join(workspace.path, 'saved.md'), 'edited after stop');
  store = new Store(root); agent = createAgent({ store, notify() {}, connectors });
  globalThis.fetch = async (_url, options) => {
    const input = JSON.parse(options.body).input;
    assert.ok(input.some(i => i.type === 'function_call_output' && JSON.parse(i.output).path === 'saved.md'));
    return sse([message('done')]);
  };
  await agent.run(task.id);
  assert.equal(store.state.tasks[0].status, 'completed');
  assert.equal(fs.readFileSync(path.join(workspace.path, 'saved.md'), 'utf8'), 'edited after stop');
});

test('a remaining plan prevents a model final answer from completing the task', async () => {
  const { agent, task } = setup(); task.plan = [{ id: 'unfinished', title: '未执行', status: 'pending' }];
  globalThis.fetch = async () => sse([message('我已完成全部工作')]);
  await agent.run(task.id);
  assert.equal(task.status, 'failed'); assert.match(task.error, /计划仍未完成/);
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
