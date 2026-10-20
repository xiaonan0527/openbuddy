import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { resolveWorkspacePath, readDirectory, writeText, readText, createOffice, previewFile } from '../server/files.js';
import { verifyArtifacts } from '../server/runtime.js';

function temporary(t) { const root = fs.mkdtempSync(path.join(os.tmpdir(), 'openbuddy-files-')); t.after(() => fs.rmSync(root, { recursive: true, force: true })); return { id: 'test', path: root }; }
test('blocks traversal, absolute paths, credential files and symlinks', t => {
  const workspace = temporary(t); fs.symlinkSync(os.homedir(), path.join(workspace.path, 'outside'));
  for (const p of ['../secret', '/etc/passwd', '.env', 'nested/.env.local', 'config.local.toml', '.codex/config.toml', 'outside/file']) assert.throws(() => resolveWorkspacePath(workspace, p));
});
test('atomic UTF-8 writes stay readable and inventory hides unsafe entries', async t => {
  const workspace = temporary(t);
  await writeText(workspace, 'reports/说明.md', '# 工作报告\n真实内容');
  assert.equal(await readText(workspace, 'reports/说明.md'), '# 工作报告\n真实内容');
  fs.writeFileSync(path.join(workspace.path, '.env'), 'not a real secret');
  assert.deepEqual((await readDirectory(workspace)).entries.map(e => e.name), ['reports']);
});
test('a workspace symlink cannot disguise a protected credential root', t => {
  const workspace = temporary(t); const protectedRoot = path.join(workspace.path, '.codex');
  fs.mkdirSync(protectedRoot); fs.symlinkSync(protectedRoot, path.join(workspace.path, 'looks-safe'));
  assert.throws(() => resolveWorkspacePath({ id: 'alias', path: path.join(workspace.path, 'looks-safe') }, '.'), /凭据目录/);
});
test('generates real DOCX and previews content', async t => {
  const workspace = temporary(t); const result = await createOffice(workspace, { format: 'docx', path: 'report.docx', title: '验收报告', sections: [{ heading: '结果', text: '创建成功' }] });
  assert.ok(result.size > 1000); assert.equal(fs.readFileSync(path.join(workspace.path, result.path)).subarray(0, 2).toString(), 'PK');
  const view = await previewFile(workspace, result.path); assert.equal(view.type, 'html'); assert.match(view.html, /创建成功/);
});
test('generates real XLSX with typed rows and preview', async t => {
  const workspace = temporary(t); await createOffice(workspace, { format: 'xlsx', path: 'data.xlsx', title: '经营数据', rows: [['项目', '金额'], ['收入', 120], ['成本', 50]] });
  const view = await previewFile(workspace, 'data.xlsx'); assert.equal(view.type, 'table'); assert.equal(view.rows[1][1], 120);
});
test('generates an editable PPTX ZIP container', async t => {
  const workspace = temporary(t); const result = await createOffice(workspace, { format: 'pptx', path: 'slides.pptx', title: '演示', slides: [{ title: '目标', body: '可以编辑的演示文件' }, { title: '结果', body: '完成生成' }] });
  assert.ok(result.size > 3000); assert.equal(fs.readFileSync(path.join(workspace.path, result.path)).subarray(0, 2).toString(), 'PK');
});
test('does not overwrite workspace root or write mismatched Office format', async t => {
  const workspace = temporary(t); await assert.rejects(writeText(workspace, '.', 'bad')); await assert.rejects(createOffice(workspace, { format: 'docx', path: 'fake.txt' }));
});

test('artifact gate validates all generated Office formats and rejects a corrupted PPTX', async t => {
  const workspace = temporary(t);
  for (const format of ['docx', 'xlsx', 'pptx']) await createOffice(workspace, { format, path: `file.${format}`, title: '验收', rows: [['内容']], sections: [{ text: '内容' }] });
  assert.equal((await verifyArtifacts(workspace, ['file.docx', 'file.xlsx', 'file.pptx'])).status, 'passed');
  fs.writeFileSync(path.join(workspace.path, 'file.pptx'), 'not an Office container');
  assert.equal((await verifyArtifacts(workspace, ['file.pptx'])).status, 'failed');
});
