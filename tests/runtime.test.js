import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Store } from '../server/store.js';
import { updatePlan, verifyArtifacts, compactContext } from '../server/runtime.js';

test('plan has stable IDs and only permits pending -> running -> completed', () => {
  let plan = updatePlan([], [{ title: '检查', status: 'running' }, { title: '交付', status: 'pending' }]);
  const [first, second] = plan;
  assert.throws(() => updatePlan(plan, [first, { ...second, status: 'completed' }]), /先进入 running/);
  plan = updatePlan(plan, [{ ...first, status: 'completed' }, second]);
  assert.equal(plan[0].id, first.id);
  assert.throws(() => updatePlan(plan, [{ ...plan[0], status: 'running' }, plan[1]]), /不能倒退/);
  assert.throws(() => updatePlan(plan, [plan[0]]), /不能删除/);
});

test('artifact acceptance checks content and rejects missing and corrupt deliverables', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuddy-acceptance-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.writeFileSync(path.join(root, 'ok.json'), '{"valid":true}');
  fs.writeFileSync(path.join(root, 'bad.json'), '{');
  const result = await verifyArtifacts({ id: 'w', path: root }, ['ok.json', 'bad.json', 'missing.md']);
  assert.equal(result.status, 'failed');
  assert.deepEqual(result.checks.map(c => c.status), ['passed', 'failed', 'failed']);
  assert.match(result.scope, /不代表内容正确/);
});

test('restart marks started side effects unknown and leaves unstarted calls queued', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuddy-store-recovery-')); t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const initial = new Store(root), workspace = initial.state.workspaces[0];
  const task = { id: 't', workspaceId: workspace.id, status: 'running', messages: [], events: [
    { id: 'started', type: 'tool', tool: 'run_shell', status: 'running', started: true },
    { id: 'waiting', type: 'tool', tool: 'write_file', status: 'running', started: false }
  ], runState: { input: [], pendingCalls: [{ eventId: 'started' }, { eventId: 'waiting' }], cursor: 0 } };
  initial.state.tasks.push(task); initial.save();
  const restarted = new Store(root), restored = restarted.state.tasks[0];
  assert.equal(restored.events[0].status, 'unknown');
  assert.equal(restored.events[1].status, 'queued');
  assert.equal(restored.status, 'stopped');
});

test('long context retains original request and compact factual checkpoints within budget', () => {
  const task = { messages: [{ role: 'user', content: 'original goal' }, { role: 'user', content: 'latest request' }], plan: [{ id: 's1', title: 'deliver', status: 'running' }], artifactPaths: ['out.md'], events: [] };
  const input = [{ role: 'user', content: 'original goal' }, ...Array.from({ length: 8 }, (_, i) => ({ role: 'assistant', content: `${i}: ${'x'.repeat(30000)}` }))];
  const result = compactContext(input, task, 50000);
  assert.ok(JSON.stringify(result.input).length < 50000);
  assert.match(result.input[0].content, /original goal/);
  assert.match(result.input[0].content, /out.md/);
  assert.ok(result.omitted > 0);
});
