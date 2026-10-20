import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startServer } from '../server/index.js';
import { Store } from '../server/store.js';

test('API lifecycle persists state, enforces local request boundaries and defaults automation to read-only', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuddy-api-'));
  const runtime = await startServer({ dataDir, port: 0 });
  t.after(async () => { await runtime.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.port}`;
  async function call(route, method = 'GET', body) { const res = await fetch(`${base}/api${route}`, { method, headers: { 'Content-Type': 'application/json', 'X-OpenBuddy-Request': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: res.status, body: await res.json() }; }
  const state = (await call('/state')).body; assert.ok(state.skills.length >= 10); assert.ok(state.experts.length >= 5); assert.equal('apiKey' in state.provider, false);
  const crossSite = await fetch(`${base}/api/state`, { headers: { Origin: 'https://untrusted.example' } }); assert.equal(crossSite.status, 403);
  const noMarker = await fetch(`${base}/api/settings`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme: 'dark' }) }); assert.equal(noMarker.status, 403);
  const workspace = (await call('/workspaces', 'POST', { name: '测试项目' })).body; assert.ok(workspace.id);
  const write = await call('/files', 'POST', { workspaceId: workspace.id, path: 'notes/test.md', content: '测试正文' }); assert.equal(write.status, 200);
  const preview = await call(`/preview?workspaceId=${workspace.id}&path=notes/test.md`); assert.equal(preview.body.content, '测试正文');
  assert.equal((await call(`/files?workspaceId=${workspace.id}&path=../`)).status, 400);
  const task = (await call('/tasks', 'POST', { prompt: '不要执行，这是持久化测试', workspaceId: workspace.id, start: false })).body; assert.equal(task.status, 'idle');
  const schedule = (await call('/schedules', 'POST', { name: '日报', prompt: '只读列出当前目录', workspaceId: workspace.id, intervalMinutes: 60, enabled: false, mode: 'default' })).body; assert.equal(schedule.mode, 'readOnly'); assert.equal(schedule.enabled, false);
  const skill = (await call('/skills', 'POST', { name: '自定义技能', instructions: '明确交付格式', category: '办公' })).body; assert.ok(skill.id);
  await call(`/skills/${skill.id}`, 'PATCH', { enabled: false });
  const upload = (await call('/upload', 'POST', { workspaceId: workspace.id, name: 'sample.csv', base64: Buffer.from('a,b\n1,2').toString('base64') })).body; assert.ok(upload.path.startsWith('uploads/'));
  const found = (await call('/search?q=sample')).body; assert.equal(found.library[0].name, 'sample.csv');
  const persisted = new Store(dataDir); assert.equal(persisted.state.tasks[0].id, task.id); assert.equal(persisted.state.skills.find(s => s.id === skill.id).enabled, false);
  await call(`/library/${upload.id}`, 'DELETE'); assert.ok(fs.existsSync(path.join(workspace.path, upload.path)));
  const invalidWorkspace = await call('/workspaces', 'POST', { name: '禁止主目录', path: os.homedir() }); assert.equal(invalidWorkspace.status, 400);
  await call(`/tasks/${task.id}`, 'DELETE'); assert.equal((await call('/state')).body.tasks.length, 0);
});

test('managed model providers store keys locally without exposing them through API or state', async t => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuddy-model-vault-'));
  const runtime = await startServer({ dataDir, port: 0 });
  const originalFetch = globalThis.fetch;
  t.after(async () => { globalThis.fetch = originalFetch; await runtime.close(); fs.rmSync(dataDir, { recursive: true, force: true }); });
  const base = `http://127.0.0.1:${runtime.port}`;
  async function call(route, method = 'GET', body) { const res = await originalFetch(`${base}/api${route}`, { method, headers: { 'Content-Type': 'application/json', 'X-OpenBuddy-Request': '1' }, body: body === undefined ? undefined : JSON.stringify(body) }); return { status: res.status, body: await res.json() }; }
  const secret = 'fixture-domestic-model-key';
  const added = await call('/providers', 'POST', { preset: 'kimi-cn', apiKey: secret, model: 'kimi-test' });
  assert.equal(added.status, 201); assert.equal(JSON.stringify(added.body).includes(secret), false);
  await call(`/providers/${added.body.id}/activate`, 'POST');
  const [state, providers] = await Promise.all([call('/state'), call('/providers')]);
  assert.equal(state.body.provider.protocol, 'chat_completions');
  assert.equal(JSON.stringify(state.body).includes(secret), false); assert.equal(JSON.stringify(providers.body).includes(secret), false);
  assert.equal(providers.body.providers[0].hasApiKey, true);
  assert.equal((fs.statSync(path.join(dataDir, 'model-providers.json')).mode & 0o777), 0o600);
  assert.equal(fs.readFileSync(path.join(dataDir, 'state.json'), 'utf8').includes(secret), false);
  globalThis.fetch = async (url, options) => {
    assert.equal(options.headers.Authorization, `Bearer ${secret}`);
    if (String(url).endsWith('/models')) return new Response(JSON.stringify({ data: [{ id: 'kimi-test' }, { id: 'kimi-other' }] }), { headers: { 'content-type': 'application/json' } });
    assert.match(String(url), /api\.moonshot\.cn\/v1\/chat\/completions$/);
    return new Response('data: {"choices":[{"delta":{"content":"OK"},"finish_reason":"stop"}]}\n\ndata: [DONE]\n\n', { headers: { 'content-type': 'text/event-stream' } });
  };
  const modelList = await call('/providers/models', 'POST', { preset: 'kimi-cn', name: 'Kimi', baseUrl: 'https://api.moonshot.cn/v1', apiKey: secret, model: '' });
  assert.deepEqual(modelList.body.models, ['kimi-test', 'kimi-other']);
  const connection = await call('/provider/test', 'POST', {}); assert.equal(connection.body.ok, true);
  const task = await call('/tasks', 'POST', { prompt: 'pinned provider', start: false });
  assert.equal(task.body.providerId, added.body.id); assert.equal(task.body.model, 'kimi-test');
  await call('/providers/local', 'POST');
  assert.equal(runtime.store.state.tasks.find(item => item.id === task.body.id).providerId, added.body.id);
  const blockedEdit = await call(`/providers/${added.body.id}`, 'PATCH', { baseUrl: 'https://different-provider.example/v1', apiKey: '' });
  assert.equal(blockedEdit.status, 400); assert.match(blockedEdit.body.error, /重新输入/);
  const edit = await call(`/providers/${added.body.id}`, 'PATCH', { name: 'Kimi renamed', model: 'kimi-other', apiKey: '' });
  assert.equal(edit.status, 200); assert.equal(JSON.stringify(edit.body).includes(secret), false);
  assert.equal(new Store(dataDir).modelProviders.providers[0].apiKey, secret);
  await call(`/providers/${added.body.id}`, 'DELETE');
  assert.equal(runtime.store.modelProviders.providers.length, 0);
});
