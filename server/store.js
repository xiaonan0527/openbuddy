import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { createSeed } from './seed.js';
export const createId = () => randomUUID();
export const now = () => new Date().toISOString();
export class Store {
  constructor(directory) {
    this.directory = path.resolve(directory);
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    this.file = path.join(this.directory, 'state.json');
    const workspacePath = path.join(this.directory, 'workspaces/default');
    fs.mkdirSync(workspacePath, { recursive: true, mode: 0o700 });
    if (fs.existsSync(this.file)) {
      // Never replace an unreadable/corrupt database with an empty one.
      this.state = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!Array.isArray(this.state.tasks) || !Array.isArray(this.state.workspaces)) throw new Error('本地数据格式无效，请从备份恢复');
      const seed = createSeed({ workspacePath });
      for (const key of Object.keys(seed)) if (!(key in this.state)) this.state[key] = seed[key];
      this.state.capabilities = seed.capabilities;
      for (const task of this.state.tasks) for (const step of task.plan || []) step.id ||= createId();
      for (const task of this.state.tasks) if (['running', 'awaiting_approval'].includes(task.status)) {
        task.status = 'stopped'; task.error = '应用重启，任务已停止。可以重新发送消息继续。';
        const partial = task.messages?.find(m => m.id === task.runState?.streamingMessageId);
        if (partial) partial.interrupted = true;
        for (const event of task.events || []) if (event.type === 'approval' && event.status === 'pending') event.status = 'denied';
        for (const event of task.events || []) if (event.type === 'tool' && event.status === 'running') {
          event.status = event.started !== false ? 'unknown' : 'queued';
          event.message = `${event.tool || '工具'}：${event.started !== false ? '应用重启时执行结果未知，请检查后选择重试或跳过。' : '操作尚未开始，继续执行时重新审批。'}`;
        }
      }
      this.state.connectors.forEach(c => { c.status = 'disconnected'; c.toolCount = 0; c.tools = []; });
    } else this.state = createSeed({ workspacePath });
    this.save();
  }
  save() {
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(this.state, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
  log(type, message) {
    this.state.activities.unshift({ id: createId(), createdAt: now(), type, message });
    this.state.activities = this.state.activities.slice(0, 300); this.save();
  }
  workspace(id) {
    const workspace = this.state.workspaces.find(w => w.id === id);
    if (!workspace) throw new Error('工作空间不存在');
    return workspace;
  }
}
