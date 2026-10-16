import { useState } from 'react';
import { ArrowUpRight, FileText, Folder, FolderOpen, HardDrive, Plus } from 'lucide-react';
import { formatDate, post } from '../api';
import Files from '../components/Files';
import { Button, Empty, Field, InlineError, Modal, PageHeader, SearchInput } from '../components/UI';

export default function Workspaces({ state, refresh, notify, navigate, onPreview }) {
  const [selected, setSelected] = useState(state.workspaces[0]?.id);
  const [query, setQuery] = useState('');
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState('');
  const [path, setPath] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const workspace = state.workspaces.find(item => item.id === selected);
  async function create(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { const item = await post('/workspaces', { name, ...(path.trim() ? { path: path.trim() } : {}) }); await refresh(); setSelected(item.id); setCreating(false); setName(''); setPath(''); notify('工作空间已创建'); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  return <div className="page"><PageHeader title="工作空间" description="给项目一个位置，让文件与任务井井有条。"><Button icon={Plus} onClick={() => setCreating(true)}>新建空间</Button></PageHeader><div className="workspace-layout"><div className="workspace-list"><SearchInput value={query} onChange={setQuery} placeholder="搜索工作空间" />{state.workspaces.filter(item => item.name.toLowerCase().includes(query.toLowerCase())).map(item => <button key={item.id} className={`workspace-item ${selected === item.id ? 'active' : ''}`} onClick={() => setSelected(item.id)}><span className="workspace-item-icon"><Folder size={22} /></span><span><strong>{item.name}</strong><small>{state.tasks.filter(task => task.workspaceId === item.id).length} 个任务</small></span></button>)}</div>{workspace ? <section className="workspace-detail"><div className="workspace-detail-heading"><div><span className="section-label">当前空间</span><h2>{workspace.name}</h2><p><HardDrive size={13} />{workspace.path}</p></div><Button variant="secondary" icon={Plus} onClick={() => navigate(`home?workspace=${workspace.id}`)}>在此新建任务</Button></div><Files workspaceId={workspace.id} onPreview={path => onPreview(workspace.id, path)} notify={notify} refresh={refresh} /><div className="workspace-tasks"><h3>相关任务</h3>{state.tasks.filter(task => task.workspaceId === workspace.id && !task.archived).slice(0, 8).map(task => <button key={task.id} onClick={() => navigate(`task/${task.id}`)}><FileText size={16} /><span>{task.title}</span><time>{formatDate(task.updatedAt)}</time><ArrowUpRight size={14} /></button>)}{!state.tasks.some(task => task.workspaceId === workspace.id) && <p className="muted">这个空间还没有任务。</p>}</div></section> : <Empty icon={FolderOpen} title="选择一个工作空间" description="浏览项目文件和相关任务。" />}</div>{creating && <Modal title="新建工作空间" description="将一个本地目录作为独立的工作区域。" onClose={() => setCreating(false)}><form className="form" onSubmit={create}><Field label="空间名称"><input required autoFocus value={name} onChange={event => setName(event.target.value)} placeholder="例如：产品研究" /></Field><Field label="本地目录（可选）" hint="留空将在应用数据目录下创建。已有目录使用绝对路径。"><input value={path} onChange={event => setPath(event.target.value)} placeholder="~/Documents/项目" /></Field><InlineError>{error}</InlineError><div className="form-actions"><Button variant="secondary" onClick={() => setCreating(false)}>取消</Button><Button type="submit" busy={busy}>创建空间</Button></div></form></Modal>}</div>;
}
