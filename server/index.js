import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { Store, createId, now } from './store.js';
import { createAgent } from './agent.js';
import { publicProvider, requestResponse } from './provider.js';
import { createConnectors } from './connectors.js';
import { readDirectory, readText, writeText, resolveWorkspacePath, previewFile } from './files.js';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
function requiredString(value, name, max = 20000) {
  if (typeof value !== 'string' || !value.trim() || value.length > max) throw new Error(`${name}不能为空且长度必须小于 ${max}`);
  return value.trim();
}
function allowedFields(input, keys) { return Object.fromEntries(keys.filter(k => Object.hasOwn(input, k)).map(k => [k, input[k]])); }
export function createApp({ dataDir = process.env.OPENBUDDY_DATA_DIR || path.join(project, '.data') } = {}) {
  const store = new Store(dataDir);
  const subscribers = new Set();
  const notify = payload => { for (const res of subscribers) res.write(`event: change\ndata: ${JSON.stringify(payload)}\n\n`); };
  const connectors = createConnectors({ store, notify });
  const agent = createAgent({ store, notify, connectors });
  const app = express(); app.disable('x-powered-by');
  app.use('/api', (req, res, next) => {
    const host = req.headers.host || '';
    if (!/^(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?$/.test(host)) return res.status(403).json({ error: '仅允许本机访问' });
    if (req.headers.origin) {
      let origin;
      try { origin = new URL(req.headers.origin); } catch { return res.status(403).json({ error: '无效来源' }); }
      const allowed = new Set([`http://${host}`, 'http://127.0.0.1:5178', 'http://localhost:5178']);
      if (!allowed.has(origin.origin)) return res.status(403).json({ error: '不允许跨站访问本地应用' });
    }
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('X-OpenBuddy-Request') !== '1') return res.status(403).json({ error: '请求缺少本地操作标识' });
    res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cache-Control', 'no-store'); next();
  });
  app.use(express.json({ limit: '15mb' }));
  const getTask = id => { const task = store.state.tasks.find(t => t.id === id); if (!task) throw new Error('任务不存在'); return task; };
  function dispatch(id) { void agent.run(id).catch(() => {}); }
  function createTask(input) {
    const prompt = requiredString(input.prompt, '任务内容', 100000);
    const workspaceId = input.workspaceId || store.state.workspaces[0]?.id; store.workspace(workspaceId);
    const task = { id: createId(), title: (input.title || prompt).slice(0, 70), workspaceId, scene: ['work', 'code', 'design'].includes(input.scene) ? input.scene : 'work', status: 'idle', messages: [{ id: createId(), role: 'user', content: prompt, createdAt: now() }], events: [], artifactPaths: [], createdAt: now(), updatedAt: now(), model: typeof input.model === 'string' ? input.model : '', expertId: input.expertId || '', skillIds: Array.isArray(input.skillIds) ? input.skillIds.filter(x => typeof x === 'string') : [], mode: input.mode === 'readOnly' ? 'readOnly' : 'default', archived: false };
    store.state.tasks.unshift(task); store.log('task', `创建任务：${task.title}`); notify({ type: 'tasks', taskId: task.id });
    if (input.start !== false) dispatch(task.id); return task;
  }
  app.get('/api/health', (req, res) => res.json({ ok: true, app: 'OpenBuddy', version: '1.0.0' }));
  app.get('/api/state', (req, res) => res.json({ ...store.state, provider: publicProvider(store.state.settings) }));
  app.get('/api/events', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream'); res.setHeader('Connection', 'keep-alive'); res.flushHeaders();
    subscribers.add(res); res.write('event: change\ndata: {"type":"connected"}\n\n');
    const heartbeat = setInterval(() => res.write(': ping\n\n'), 20000);
    res.on('close', () => { subscribers.delete(res); clearInterval(heartbeat); });
  });
  app.post('/api/tasks', (req, res) => res.status(201).json(createTask(req.body)));
  app.post('/api/tasks/:id/messages', (req, res) => {
    const task = getTask(req.params.id); if (agent.active(task.id)) return res.status(409).json({ error: '任务正在执行，请先停止或等待完成' });
    task.messages.push({ id: createId(), role: 'user', content: requiredString(req.body.content, '消息', 100000), createdAt: now() }); task.updatedAt = now();
    store.save(); dispatch(task.id); res.json(task);
  });
  app.post('/api/tasks/:id/run', (req, res) => { const task = getTask(req.params.id); if (agent.active(task.id)) return res.status(409).json({ error: '任务已在运行' }); dispatch(task.id); res.json(task); });
  app.post('/api/tasks/:id/stop', (req, res) => { getTask(req.params.id); agent.stop(req.params.id); res.json({ ok: true }); });
  app.post('/api/tasks/:id/approval', (req, res) => {
    getTask(req.params.id); if (typeof req.body.allow !== 'boolean') throw new Error('审批结果无效');
    const result = agent.approve(req.params.id, requiredString(req.body.requestId, '审批编号', 200), req.body.allow);
    if (result === false) return res.status(409).json({ error: '审批已结束或已过期' }); res.json({ ok: true });
  });
  app.patch('/api/tasks/:id', (req, res) => {
    const task = getTask(req.params.id);
    if (req.body.title !== undefined) task.title = requiredString(req.body.title, '任务名', 100);
    if (typeof req.body.archived === 'boolean') task.archived = req.body.archived;
    task.updatedAt = now(); store.save(); notify({ type: 'tasks' }); res.json(task);
  });
  app.delete('/api/tasks/:id', (req, res) => {
    const task = getTask(req.params.id); if (agent.active(task.id)) throw new Error('请先停止运行中的任务');
    store.state.tasks = store.state.tasks.filter(t => t.id !== task.id); store.save(); notify({ type: 'tasks' }); res.json({ ok: true });
  });
  app.post('/api/workspaces', (req, res) => {
    const name = requiredString(req.body.name, '空间名称', 100), id = createId();
    let directory = req.body.path?.trim() || path.join(store.directory, 'workspaces', id);
    if (directory.startsWith('~/')) directory = path.join(os.homedir(), directory.slice(2));
    directory = path.resolve(directory);
    if (directory.split(path.sep).some(p => /^\.(?:codex|ssh|aws|gnupg)$/.test(p)) || directory === os.homedir() || directory === path.parse(directory).root) throw new Error('请选择独立工作目录，不能使用主目录、根目录或凭据目录');
    fs.mkdirSync(directory, { recursive: true }); const workspace = { id, name, path: fs.realpathSync(directory), createdAt: now() }; resolveWorkspacePath(workspace);
    if (store.state.workspaces.some(w => w.path === workspace.path)) throw new Error('这个目录已添加');
    store.state.workspaces.push(workspace); store.log('workspace', `添加工作空间：${name}`); notify({ type: 'workspaces' }); res.status(201).json(workspace);
  });
  app.delete('/api/workspaces/:id', (req, res) => {
    const workspace = store.workspace(req.params.id);
    if (store.state.workspaces.length <= 1 || store.state.tasks.some(t => t.workspaceId === workspace.id) || store.state.schedules.some(s => s.workspaceId === workspace.id)) throw new Error('请保留至少一个空间，并先移除关联任务和定时任务');
    store.state.workspaces = store.state.workspaces.filter(w => w.id !== workspace.id); store.save(); notify({ type: 'workspaces' }); res.json({ ok: true, filesRetained: true });
  });
  app.get('/api/files', async (req, res) => res.json(await readDirectory(store.workspace(req.query.workspaceId), req.query.path || '.')));
  app.get('/api/file', (req, res) => {
    const target = resolveWorkspacePath(store.workspace(req.query.workspaceId), req.query.path);
    const ext = path.extname(target).toLowerCase();
    if (req.query.inline === '1' && ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.pdf'].includes(ext)) { res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox"); return res.sendFile(target); }
    return res.download(target);
  });
  app.get('/api/preview', async (req, res) => res.json(await previewFile(store.workspace(req.query.workspaceId), req.query.path)));
  app.post('/api/files', async (req, res) => {
    const result = await writeText(store.workspace(req.body.workspaceId), req.body.path, req.body.content); store.log('file', `保存文件：${result.path}`); notify({ type: 'files' }); res.json(result);
  });
  app.post('/api/upload', (req, res) => {
    const workspace = store.workspace(req.body.workspaceId);
    const name = path.basename(requiredString(req.body.name, '文件名', 200));
    if (!/^[A-Za-z0-9+/=\s]*$/.test(req.body.base64 || '')) throw new Error('文件内容格式无效');
    const buffer = Buffer.from(req.body.base64 || '', 'base64'); if (!buffer.length || buffer.length > 10 * 1024 * 1024) throw new Error('请上传非空且不超过 10MB 的文件');
    const relative = `uploads/${createId().slice(0, 8)}-${name}`;
    const target = resolveWorkspacePath(workspace, relative, { write: true }); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, buffer, { mode: 0o600, flag: 'wx' });
    const item = { id: createId(), name, path: relative, workspaceId: workspace.id, type: path.extname(name).slice(1) || 'file', size: buffer.length, createdAt: now() };
    store.state.library.unshift(item); store.log('upload', `添加资料：${name}`); notify({ type: 'library' }); res.status(201).json(item);
  });
  app.delete('/api/library/:id', (req, res) => { store.state.library = store.state.library.filter(f => f.id !== req.params.id); store.save(); notify({ type: 'library' }); res.json({ ok: true, filesRetained: true }); });
  for (const collection of ['skills', 'experts']) {
    app.post(`/api/${collection}`, (req, res) => {
      const entry = { ...allowedFields(req.body, ['description', 'category', 'instructions', 'skillIds']), id: createId(), name: requiredString(req.body.name, '名称', 100), builtin: false, enabled: true };
      entry.instructions = requiredString(entry.instructions, '指令内容', 50000); entry.description = String(entry.description || '').slice(0, 1000); entry.category = String(entry.category || '自定义').slice(0, 50);
      store.state[collection].push(entry); store.log(collection, `添加：${entry.name}`); notify({ type: collection }); res.status(201).json(entry);
    });
    app.patch(`/api/${collection}/:id`, (req, res) => {
      const entry = store.state[collection].find(e => e.id === req.params.id); if (!entry) throw new Error('条目不存在');
      const update = allowedFields(req.body, ['name', 'description', 'category', 'instructions', 'enabled', 'skillIds']);
      if (update.name !== undefined) requiredString(update.name, '名称', 100);
      if (update.instructions !== undefined) requiredString(update.instructions, '指令', 50000);
      if (update.enabled !== undefined && typeof update.enabled !== 'boolean') throw new Error('开关无效');
      Object.assign(entry, update); store.save(); notify({ type: collection }); res.json(entry);
    });
    app.delete(`/api/${collection}/:id`, (req, res) => { store.state[collection] = store.state[collection].filter(e => e.id !== req.params.id); store.save(); notify({ type: collection }); res.json({ ok: true }); });
  }
  app.post('/api/connectors', (req, res) => {
    const name = requiredString(req.body.name, '名称', 100), type = req.body.type === 'stdio' ? 'stdio' : 'http';
    const c = { id: createId(), name, type, description: req.body.description || '', status: 'disconnected', tools: [], toolCount: 0 };
    if (type === 'http') { const url = new URL(requiredString(req.body.url, '地址', 2000)); if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || /(?:key|token|secret|password)=/i.test(url.search)) throw new Error('MCP 地址不可包含凭据；请通过本地 stdio 管理认证'); c.url = url.href; }
    else { c.command = requiredString(req.body.command, '命令', 1000); c.args = Array.isArray(req.body.args) ? req.body.args.map(String).slice(0, 50) : []; }
    store.state.connectors.push(c); store.save(); notify({ type: 'connectors' }); res.status(201).json(c);
  });
  app.post('/api/connectors/:id/connect', async (req, res) => res.json(await connectors.connect(req.params.id)));
  app.post('/api/connectors/:id/disconnect', async (req, res) => { await connectors.disconnect(req.params.id); res.json({ ok: true }); });
  app.delete('/api/connectors/:id', async (req, res) => { await connectors.disconnect(req.params.id); store.state.connectors = store.state.connectors.filter(c => c.id !== req.params.id); store.save(); notify({ type: 'connectors' }); res.json({ ok: true }); });
  function scheduleInput(body) {
    const minutes = Number(body.intervalMinutes ?? 60); if (!Number.isFinite(minutes) || minutes < 1 || minutes > 525600) throw new Error('执行间隔应在 1～525600 分钟内');
    const workspaceId = body.workspaceId || store.state.workspaces[0]?.id; store.workspace(workspaceId);
    return { name: requiredString(body.name, '定时任务名', 100), prompt: requiredString(body.prompt, '任务指令'), workspaceId, intervalMinutes: minutes, enabled: body.enabled === true, mode: 'readOnly' };
  }
  app.post('/api/schedules', (req, res) => {
    const entry = { id: createId(), ...scheduleInput(req.body), nextRunAt: new Date(Date.now() + Number(req.body.intervalMinutes || 60) * 60000).toISOString() };
    store.state.schedules.push(entry); store.log('schedule', `创建定时任务：${entry.name}`); notify({ type: 'schedules' }); res.status(201).json(entry);
  });
  app.patch('/api/schedules/:id', (req, res) => {
    const entry = store.state.schedules.find(s => s.id === req.params.id); if (!entry) throw new Error('定时任务不存在');
    const fields = scheduleInput({ ...entry, ...req.body }); Object.assign(entry, fields); entry.nextRunAt = new Date(Date.now() + entry.intervalMinutes * 60000).toISOString(); store.save(); notify({ type: 'schedules' }); res.json(entry);
  });
  function executeSchedule(entry) {
    const task = createTask({ prompt: entry.prompt, title: entry.name, workspaceId: entry.workspaceId, mode: 'readOnly', start: false });
    task.scheduleId = entry.id; entry.lastRunAt = now(); entry.lastTaskId = task.id; entry.nextRunAt = new Date(Date.now() + entry.intervalMinutes * 60000).toISOString(); store.save(); dispatch(task.id); return task;
  }
  app.post('/api/schedules/:id/run', (req, res) => { const entry = store.state.schedules.find(s => s.id === req.params.id); if (!entry) throw new Error('定时任务不存在'); res.json(executeSchedule(entry)); });
  app.delete('/api/schedules/:id', (req, res) => { store.state.schedules = store.state.schedules.filter(s => s.id !== req.params.id); store.save(); notify({ type: 'schedules' }); res.json({ ok: true }); });
  app.patch('/api/settings', (req, res) => {
    const update = allowedFields(req.body, ['theme', 'memory', 'customInstructions', 'model', 'maxSteps']);
    if (update.theme && !['light', 'dark'].includes(update.theme)) throw new Error('主题无效');
    for (const key of ['memory', 'customInstructions', 'model']) if (update[key] !== undefined && (typeof update[key] !== 'string' || update[key].length > 50000)) throw new Error('配置内容无效或过长');
    if (update.maxSteps !== undefined && (!Number.isInteger(Number(update.maxSteps)) || Number(update.maxSteps) < 1 || Number(update.maxSteps) > 40)) throw new Error('步骤上限应在 1～40 之间');
    if (update.maxSteps !== undefined) update.maxSteps = Number(update.maxSteps);
    Object.assign(store.state.settings, update); store.save(); notify({ type: 'settings' }); res.json(store.state.settings);
  });
  app.post('/api/provider/test', async (req, res) => {
    const start = Date.now(); const controller = new AbortController(); const timeout = setTimeout(() => controller.abort(), 90000);
    try { const result = await requestResponse({ input: [{ role: 'user', content: 'Only reply with OK.' }], tools: [], model: store.state.settings.model || undefined, signal: controller.signal, instructions: 'This is a connection test. Reply OK.' }); res.json({ ok: true, model: publicProvider(store.state.settings).model, latencyMs: Date.now() - start, text: result.text }); }
    finally { clearTimeout(timeout); }
  });
  app.get('/api/search', (req, res) => {
    const q = String(req.query.q || '').toLowerCase().slice(0, 200);
    const match = item => `${item.name || item.title || ''} ${item.description || ''}`.toLowerCase().includes(q);
    res.json(Object.fromEntries(['tasks', 'workspaces', 'skills', 'library'].map(k => [k, store.state[k].filter(match).slice(0, 30)])));
  });
  app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));
  app.use(express.static(path.join(project, 'dist')));
  app.get('/{*path}', (req, res) => {
    if (fs.existsSync(path.join(project, 'dist/index.html'))) res.sendFile(path.join(project, 'dist/index.html'));
    else res.status(503).send('请先执行 npm run build，或使用 npm run dev 启动前端。');
  });
  app.use((err, req, res, next) => {
    const text = String(err.message || '操作失败').replace(/Bearer\s+\S+|sk-[\w-]{8,}/gi, '[已隐藏]');
    if (!res.headersSent) res.status(err.status || 400).json({ error: text.slice(0, 800) });
  });
  const timer = setInterval(() => {
    let running = store.state.tasks.filter(t => agent.active(t.id)).length;
    for (const entry of store.state.schedules) {
      if (running >= 2) break;
      if (entry.enabled && new Date(entry.nextRunAt).getTime() <= Date.now() && !store.state.tasks.some(t => t.scheduleId === entry.id && agent.active(t.id))) { executeSchedule(entry); running++; }
    }
  }, 10000); timer.unref();
  return { app, store, agent, connectors, async close() { clearInterval(timer); for (const res of subscribers) res.end(); await agent.close(); await connectors.close(); } };
}
export async function startServer(options = {}) {
  const runtime = createApp(options);
  const port = options.port ?? Number(process.env.OPENBUDDY_PORT || 4318);
  const server = await new Promise((resolve, reject) => { const s = runtime.app.listen(port, '127.0.0.1', () => resolve(s)); s.on('error', reject); });
  return { ...runtime, port: server.address().port, server, async close() { await runtime.close(); await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); } };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const runtime = await startServer(); console.log(`OpenBuddy 已启动：http://127.0.0.1:${runtime.port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => { await runtime.close(); process.exit(0); });
}
