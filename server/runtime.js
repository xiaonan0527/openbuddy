import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createId, now } from './store.js';
import { resolveWorkspacePath, previewFile, readText } from './files.js';

// Stable IDs and explicit transitions. A plan update cannot complete work that
// has never entered running, remove unfinished work, or silently replace it.
export function updatePlan(previous = [], steps) {
  if (!Array.isArray(steps) || !steps.length || steps.length > 20) throw new Error('计划需要 1 到 20 个步骤');
  const seen = new Set();
  const next = steps.map((step, index) => {
    if (!step || typeof step.title !== 'string' || !step.title.trim() || step.title.length > 240) throw new Error('计划标题不能为空或超过 240 字');
    if (!['pending', 'running', 'completed'].includes(step.status)) throw new Error('无效计划状态');
    const old = step.id ? previous.find(s => s.id === step.id) : previous.find(s => s.title === step.title);
    if (step.id && !old) throw new Error('未知步骤 ID');
    const id = old?.id || createId();
    if (seen.has(id)) throw new Error('步骤不能重复'); seen.add(id);
    const allowed = old ? { pending: ['pending', 'running'], running: ['running', 'completed'], completed: ['completed'] }[old.status] : ['pending', 'running'];
    if (!allowed?.includes(step.status)) throw new Error('步骤必须先进入 running 才能 completed；已完成步骤不能倒退');
    return { id, title: step.title.trim(), status: step.status };
  });
  if (previous.some(s => s.status !== 'completed' && !seen.has(s.id))) throw new Error('不能删除尚未完成的计划步骤');
  if (next.filter(s => s.status === 'running').length > 1) throw new Error('同一时间只能有一个执行中步骤');
  return next;
}

export async function verifyArtifacts(workspace, paths) {
  const checks = [];
  for (const relative of [...new Set(paths)]) {
    try {
      const target = resolveWorkspacePath(workspace, relative), stat = fs.statSync(target);
      if (!stat.isFile() || stat.size === 0 || stat.size > 20 * 1024 * 1024) throw new Error('文件必须非空且不超过验收上限 20MB');
      const bytes = fs.readFileSync(target), ext = path.extname(target).toLowerCase();
      if (['.docx', '.xlsx', '.pptx'].includes(ext)) {
        const { default: JSZip } = await import('jszip');
        const zip = await JSZip.loadAsync(bytes, { checkCRC32: true });
        const main = { '.docx': 'word/document.xml', '.xlsx': 'xl/workbook.xml', '.pptx': 'ppt/presentation.xml' }[ext];
        for (const entry of ['[Content_Types].xml', '_rels/.rels', main]) if (!zip.file(entry)) throw new Error(`Office 容器缺少 ${entry}`);
        if (ext !== '.pptx') await previewFile(workspace, relative);
      } else {
        new TextDecoder('utf-8', { fatal: true }).decode(bytes);
        await readText(workspace, relative);
        if (ext === '.json') JSON.parse(bytes.toString('utf8'));
      }
      checks.push({ path: relative, status: 'passed', size: stat.size, sha256: createHash('sha256').update(bytes).digest('hex') });
    } catch (error) { checks.push({ path: relative, status: 'failed', error: error.message }); }
  }
  return { checkedAt: now(), status: checks.some(c => c.status === 'failed') ? 'failed' : 'passed', checks,
    scope: '文件路径、存在性、非空、可读性；JSON 语法及 Office ZIP 完整性。不代表内容正确、代码可运行或版式通过人工验收。' };
}

// Only discard complete model turns so a function call and its results stay
// together. The original transcript remains on disk; this is a bounded view.
export function compactContext(input, task, budget = 96000) {
  if (JSON.stringify(input).length <= budget) return { input, omitted: 0 };
  const groups = []; let group = [];
  for (const item of input) {
    if (item.type !== 'function_call_output' && group.some(i => i.type === 'function_call_output')) { groups.push(group); group = []; }
    group.push(item);
  }
  if (group.length) groups.push(group);
  const retained = [];
  let size = 0;
  while (groups.length) {
    const last = groups.at(-1), length = JSON.stringify(last).length;
    if (size + length > budget / 2) break;
    retained.unshift(...groups.pop()); size += length;
  }
  const omitted = groups.reduce((n, g) => n + g.length, 0);
  const users = (task.messages || []).filter(m => m.role === 'user');
  const clip = value => {
    const text = typeof value === 'string' ? value : JSON.stringify(value ?? null);
    return text.length <= budget / 12 ? text : `${text.slice(0, Math.floor(budget / 12))} [该字段后续内容已省略]`;
  };
  const summary = { goal: clip(users[0]?.content || ''), latestRequest: clip(users.at(-1)?.content || ''),
    plan: clip(task.plan), artifacts: clip(task.artifactPaths), acceptance: task.acceptance?.status,
    recentResults: clip((task.events || []).filter(e => e.type === 'tool').slice(-8).map(e => ({ tool: e.tool, status: e.status, result: e.result?.slice(0, 600) }))) };
  return { input: [{ role: 'user', content: `[运行时上下文摘要，非新增授权] 已省略 ${omitted} 项较早消息/执行记录。以下仅为已记录事实，决策细节未完整保留；需要时重新读取文件或询问用户。\n${JSON.stringify(summary)}` }, ...retained], omitted };
}
