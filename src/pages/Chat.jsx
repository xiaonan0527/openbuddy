import { useEffect, useRef, useState } from 'react';
import { Archive, ArrowLeft, Check, ChevronDown, ChevronRight, Copy, FileText, Folder, LoaderCircle, PanelRightClose, PanelRightOpen, Pencil, Play, ShieldAlert, Square, Trash2, X } from 'lucide-react';
import { formatDate, patch, post, remove } from '../api';
import Composer from '../components/Composer';
import Markdown from '../components/Markdown';
import Files from '../components/Files';
import { Button, Empty, Field, IconButton, InlineError, Modal, Status } from '../components/UI';

function Approval({ event, task, refresh, notify }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function answer(allow) {
    setBusy(true);
    try { await post(`/tasks/${task.id}/approval`, { requestId: event.requestId, allow }); await refresh(); notify(allow ? '已批准本次操作' : '已拒绝本次操作'); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  return <div className="approval-card"><div className="approval-heading"><ShieldAlert size={21} /><div><strong>需要你的批准</strong><p>{event.message || '智能体请求执行以下操作'}</p></div></div><pre>{event.tool}{'\n'}{typeof event.args === 'string' ? event.args : JSON.stringify(event.args, null, 2)}</pre><p className="approval-hint">请确认命令、文件路径和外部服务后再批准。本次批准仅对这一操作有效。</p><InlineError>{error}</InlineError><div className="approval-actions"><Button variant="secondary" busy={busy} onClick={() => answer(false)} icon={X}>拒绝</Button><Button busy={busy} onClick={() => answer(true)} icon={Check}>批准执行</Button></div></div>;
}

function Events({ events = [] }) {
  const [expanded, setExpanded] = useState(false);
  const relevant = events.filter(event => event.type !== 'approval' || event.status !== 'pending');
  if (!relevant.length) return null;
  return <div className="event-feed"><button className="event-toggle" onClick={() => setExpanded(!expanded)}>{expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}执行过程 <span>{relevant.length}</span></button>{expanded && <div className="event-entries">{relevant.map((event, index) => <div className={`event-entry ${event.type === 'error' ? 'event-error' : ''}`} key={event.id || index}><span className="event-point" /><div><span>{event.tool && <code>{event.tool}</code>}{event.message}</span><time>{formatDate(event.createdAt)}</time>{event.args && <details><summary>查看参数</summary><pre>{typeof event.args === 'string' ? event.args : JSON.stringify(event.args, null, 2)}</pre></details>}</div></div>)}</div>}</div>;
}

export default function Chat({ state, taskId, navigate, notify, refresh, onPreview }) {
  const task = state.tasks.find(item => item.id === taskId);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showFiles, setShowFiles] = useState(window.innerWidth > 1150);
  const [rename, setRename] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [deleting, setDeleting] = useState(false);
  const end = useRef(null);
  const scroll = useRef(null);
  const follow = useRef(true);
  useEffect(() => { follow.current = true; setValue(''); setError(''); }, [taskId]);
  useEffect(() => { if (follow.current) end.current?.scrollIntoView({ behavior: 'instant', block: 'end' }); }, [task?.messages?.map(message => message.content).join(''), task?.events?.length, task?.status]);
  if (!task) return <Empty icon={FileText} title="任务不存在" description="任务可能已经删除。" action={<Button onClick={() => navigate('home')}>返回新建任务</Button>} />;
  const running = task.status === 'running' || task.status === 'awaiting_approval';
  const pending = (task.events || []).filter(event => event.type === 'approval' && event.status === 'pending');
  async function action(path, body = {}) {
    setError('');
    try { await post(`/tasks/${task.id}/${path}`, body); await refresh(); }
    catch (problem) { setError(problem.message); }
  }
  async function send(content) {
    setBusy(true); setError('');
    try { await post(`/tasks/${task.id}/messages`, { content }); setValue(''); follow.current = true; await refresh(); }
    catch (problem) { setError(problem.message); throw problem; }
    finally { setBusy(false); }
  }
  async function changeTitle(event) {
    event.preventDefault(); setBusy(true);
    try { await patch(`/tasks/${task.id}`, { title: newTitle.trim() }); setRename(false); await refresh(); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  async function deleteTask() {
    setBusy(true);
    try { await remove(`/tasks/${task.id}`); await refresh(); navigate('home'); notify('任务已删除'); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  return <div className="chat-page"><header className="chat-header"><div className="chat-title"><IconButton icon={ArrowLeft} label="返回" onClick={() => navigate('tasks')} /><div><button onClick={() => { setNewTitle(task.title); setRename(true); }}>{task.title}<Pencil size={12} /></button><span>{state.workspaces.find(item => item.id === task.workspaceId)?.name} <span>·</span> {task.model || state.provider?.model}</span></div></div><div className="chat-header-actions"><Status value={task.status} /><IconButton icon={Archive} label={task.archived ? '取消归档' : '归档任务'} onClick={async () => { try { await patch(`/tasks/${task.id}`, { archived: !task.archived }); await refresh(); notify(task.archived ? '任务已恢复' : '任务已归档'); } catch (problem) { setError(problem.message); } }} /><IconButton icon={Trash2} label="删除任务" onClick={() => setDeleting(true)} /><IconButton icon={showFiles ? PanelRightClose : PanelRightOpen} label={showFiles ? '收起文件面板' : '打开文件面板'} onClick={() => setShowFiles(!showFiles)} /></div></header><div className="chat-layout"><div className="chat-main"><div className="chat-scroll" ref={scroll} onScroll={() => { const element = scroll.current; follow.current = element.scrollHeight - element.scrollTop - element.clientHeight < 120; }}><div className="messages">{(task.messages || []).map(message => <article className={`message message-${message.role}`} key={message.id}><div className="message-author">{message.role === 'user' ? <span className="user-avatar">我</span> : <span className="assistant-avatar">O</span>}<span>{message.role === 'user' ? '你' : 'OpenBuddy'}</span><time>{formatDate(message.createdAt)}</time><IconButton icon={Copy} label="复制消息" onClick={async () => { try { await navigator.clipboard.writeText(message.content); notify('消息已复制'); } catch { notify('浏览器未允许复制，请手动选择文本'); } }} /></div><div className="message-content"><Markdown>{message.content}</Markdown></div></article>)}<Events events={task.events} />{pending.map(event => <Approval key={event.requestId} event={event} task={task} refresh={refresh} notify={notify} />)}{task.status === 'running' && <div className="thinking"><LoaderCircle size={17} className="spin" /><span>正在思考与执行</span><span className="thinking-dots">···</span></div>}{task.error && <InlineError>{task.error}</InlineError>}{task.artifactPaths?.length > 0 && <div className="artifact-list"><div className="artifact-heading"><Folder size={15} />任务产物</div>{task.artifactPaths.map(path => <button key={path} onClick={() => onPreview(task.workspaceId, path)}><FileText size={18} /><span>{path.split('/').pop()}<small>{path}</small></span><ChevronRight size={15} /></button>)}</div>}{['failed', 'stopped', 'idle'].includes(task.status) && <div className="resume-row"><Button variant="secondary" icon={Play} onClick={() => action('run')}>继续执行</Button></div>}<div ref={end} /></div></div><div className="chat-composer"><InlineError>{error}</InlineError><Composer state={state} value={value} onChange={setValue} onSubmit={send} workspaceId={task.workspaceId} mode={task.mode} busy={busy} running={running} onStop={() => action('stop')} placeholder={running ? '任务正在进行，你可以先准备下一条消息…' : '继续描述你的想法…'} compact notify={notify} refresh={refresh} /><div className="composer-disclaimer">AI 可能出错，请检查重要结果。文件与命令操作会按权限请求批准。</div></div></div>{showFiles && <aside className="chat-files"><Files workspaceId={task.workspaceId} onPreview={path => onPreview(task.workspaceId, path)} refresh={refresh} notify={notify} /></aside>}</div>{rename && <Modal title="重命名任务" onClose={() => setRename(false)}><form className="form" onSubmit={changeTitle}><Field label="任务名称"><input autoFocus value={newTitle} onChange={event => setNewTitle(event.target.value)} required maxLength={120} /></Field><InlineError>{error}</InlineError><div className="form-actions"><Button variant="secondary" onClick={() => setRename(false)}>取消</Button><Button type="submit" busy={busy}>保存</Button></div></form></Modal>}{deleting && <Modal title="删除这个任务？" description="删除后将移除任务对话和执行记录，工作空间中的文件会保留。" onClose={() => setDeleting(false)}><div className="form"><InlineError>{error}</InlineError><div className="form-actions"><Button variant="secondary" onClick={() => setDeleting(false)}>取消</Button><Button variant="danger" busy={busy} onClick={deleteTask}>删除任务</Button></div></div></Modal>}</div>;
}
