import { useState } from 'react';
import { CalendarClock, Clock3, History, Pencil, Play, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { formatDate, patch, post, remove } from '../api';
import { Button, Empty, Field, IconButton, InlineError, Modal, PageHeader, SearchInput, Select, Status, Toggle } from '../components/UI';

function ScheduleForm({ item, state, onClose, refresh, notify }) {
  const [form, setForm] = useState({ name: item?.name || '', prompt: item?.prompt || '', workspaceId: item?.workspaceId || state.workspaces[0]?.id || '', intervalMinutes: item?.intervalMinutes || 60, enabled: item?.enabled ?? true });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = (key, value) => setForm(previous => ({ ...previous, [key]: value }));
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const body = { ...form, intervalMinutes: Number(form.intervalMinutes), mode: 'readOnly' }; if (item) await patch(`/schedules/${item.id}`, body); else await post('/schedules', body); await refresh(); notify('定时任务已保存'); onClose(); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  return <Modal title={item ? '编辑定时任务' : '新建定时任务'} onClose={onClose}><form className="form" onSubmit={save}><Field label="任务名称"><input required autoFocus value={form.name} onChange={event => set('name', event.target.value)} placeholder="例如：每日项目进展摘要" /></Field><Field label="执行内容"><textarea required rows={5} value={form.prompt} onChange={event => set('prompt', event.target.value)} placeholder="描述要定期完成的只读分析任务…" /></Field><div className="form-grid"><Field label="执行间隔（分钟）"><input type="number" min="1" max="525600" required value={form.intervalMinutes} onChange={event => set('intervalMinutes', event.target.value)} /></Field><Field label="工作空间"><Select value={form.workspaceId} onChange={event => set('workspaceId', event.target.value)}>{state.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</Select></Field></div><div className="settings-row compact"><div><strong>创建后启用</strong><p>应用后台服务运行时按间隔执行</p></div><Toggle checked={form.enabled} label="创建后启用" onChange={value => set('enabled', value)} /></div><div className="info-banner small"><ShieldCheck size={18} /><p>后台任务使用只读模式，不自动执行文件写入、Shell 命令或外部 MCP 操作。关闭后台服务后暂停调度。</p></div><InlineError>{error}</InlineError><div className="form-actions"><Button variant="secondary" onClick={onClose}>取消</Button><Button type="submit" busy={busy}>保存任务</Button></div></form></Modal>;
}

export default function Schedules({ state, refresh, notify, navigate }) {
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState('tasks');
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');
  const items = state.schedules.filter(item => item.name.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || item.enabled === (filter === 'enabled')));
  const taskIds = state.schedules.map(item => item.lastTaskId).filter(Boolean);
  const runs = state.tasks.filter(task => task.scheduleId || taskIds.includes(task.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  async function run(item) {
    setBusyId(item.id); setError('');
    try { const task = await post(`/schedules/${item.id}/run`); await refresh(); navigate(`task/${task.id}`); }
    catch (problem) { setError(problem.message); }
    finally { setBusyId(''); }
  }
  return <div className="page"><PageHeader title="定时任务" description="把重复的检查，交给规律的执行。"><Button icon={Plus} onClick={() => setEditing({})}>新建定时任务</Button></PageHeader><div className="page-tools"><div className="tabs"><button className={tab === 'tasks' ? 'active' : ''} onClick={() => setTab('tasks')}><CalendarClock size={16} />任务</button><button className={tab === 'runs' ? 'active' : ''} onClick={() => setTab('runs')}><History size={16} />运行记录</button></div><SearchInput value={query} onChange={setQuery} placeholder="搜索定时任务" /></div><InlineError>{error}</InlineError>{tab === 'tasks' ? <><div className="filter-chips schedule-filters">{[['all', '全部'], ['enabled', '已启用'], ['paused', '已暂停']].map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div>{items.length ? <div className="schedule-list">{items.map(item => <article className="schedule-item" key={item.id}><div className="schedule-icon"><Clock3 size={24} strokeWidth={1.5} /></div><div className="schedule-info"><h3>{item.name}</h3><p>{item.prompt}</p><div><span>每 {item.intervalMinutes} 分钟</span><span>{state.workspaces.find(workspace => workspace.id === item.workspaceId)?.name}</span><span>下次：{item.enabled ? formatDate(item.nextRunAt) : '已暂停'}</span></div>{item.lastTaskId && <button className="text-link" onClick={() => navigate(`task/${item.lastTaskId}`)}>查看最近一次运行</button>}</div><div className="schedule-actions"><Toggle checked={item.enabled} label={`${item.enabled ? '暂停' : '启用'} ${item.name}`} onChange={async enabled => { try { await patch(`/schedules/${item.id}`, { enabled }); await refresh(); } catch (problem) { setError(problem.message); } }} /><IconButton icon={Play} label="立即运行" disabled={busyId === item.id} onClick={() => run(item)} /><IconButton icon={Pencil} label="编辑定时任务" onClick={() => setEditing(item)} /><IconButton icon={Trash2} label="删除定时任务" onClick={() => setDeleting(item)} /></div></article>)}</div> : <Empty icon={CalendarClock} title={query ? '没有找到相关任务' : '让好习惯自动发生'} description="定期读取资料、检查项目、整理进展，执行结果会保存在任务中。" action={<Button icon={Plus} onClick={() => setEditing({})}>创建定时任务</Button>} />}</> : runs.length ? <div className="run-list">{runs.map(task => <button key={task.id} onClick={() => navigate(`task/${task.id}`)}><Clock3 size={18} /><span>{task.title}<small>{formatDate(task.createdAt)}</small></span><Status value={task.status} /></button>)}</div> : <Empty icon={History} title="还没有运行记录" description="定时任务执行后，可以在这里查看结果。" />}<div className="info-banner"><ShieldCheck size={20} /><div><strong>后台执行保持只读</strong><p>定时任务使用同一套本地模型配置，只在后台服务运行时调度。不会自动提升权限。</p></div></div>{editing && <ScheduleForm item={editing.id ? editing : null} state={state} onClose={() => setEditing(null)} refresh={refresh} notify={notify} />}{deleting && <Modal title="删除定时任务？" description={`「${deleting.name}」的后续调度将停止，已有任务记录会保留。`} onClose={() => setDeleting(null)}><div className="form"><InlineError>{error}</InlineError><div className="form-actions"><Button variant="secondary" onClick={() => setDeleting(null)}>取消</Button><Button variant="danger" onClick={async () => { try { await remove(`/schedules/${deleting.id}`); await refresh(); setDeleting(null); notify('定时任务已删除'); } catch (problem) { setError(problem.message); } }}>删除任务</Button></div></div></Modal>}</div>;
}
