import { useEffect, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ChevronRight, Code2, File, FileText, Folder, LoaderCircle, Plus, RefreshCw, Save, X } from 'lucide-react';
import { api, fileUrl, post, formatSize } from '../api';
import { Button, Empty, Field, IconButton, InlineError, Modal } from './UI';
import Markdown from './Markdown';

export function Preview({ workspaceId, path, onClose, notify, refresh }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    let alive = true;
    setData(null); setError(''); setEditing(false);
    api(`/preview?${new URLSearchParams({ workspaceId, path })}`).then(value => { if (alive) { setData(value); setContent(value.content || ''); } }).catch(problem => { if (alive) setError(problem.message); });
    return () => { alive = false; };
  }, [workspaceId, path]);
  async function save() {
    setSaving(true);
    try { await post('/files', { workspaceId, path, content }); setData({ ...data, content }); setEditing(false); notify?.('文件已保存'); refresh?.(); }
    catch (problem) { setError(problem.message); }
    finally { setSaving(false); }
  }
  const isMarkdown = /\.md$/i.test(path);
  return <Modal title={path.split('/').pop()} description={path} onClose={onClose} wide><div className="preview-toolbar"><span className="muted">{data?.type ? `${data.type.toUpperCase()} 预览` : '正在读取文件'}</span><div>{data?.type === 'text' && <Button variant="secondary" icon={editing ? X : Code2} onClick={() => setEditing(!editing)}>{editing ? '取消编辑' : '编辑文本'}</Button>}{editing && <Button busy={saving} icon={Save} onClick={save}>保存</Button>}<a className="button button-secondary" href={fileUrl(workspaceId, path)} download><ArrowDownToLine size={15} />下载</a></div></div><InlineError>{error}</InlineError><div className="file-preview">{!data && !error ? <div className="loading"><LoaderCircle className="spin" size={22} />正在读取…</div> : editing ? <textarea className="code-editor" value={content} onChange={event => setContent(event.target.value)} spellCheck={false} aria-label="文件内容" /> : data?.type === 'html' ? <iframe title="HTML 文件预览" sandbox="" srcDoc={data.html || data.content || ''} /> : data?.type === 'image' ? <img src={data.url} alt={path.split('/').pop()} /> : data?.type === 'pdf' ? <iframe title="PDF 文件预览" src={data.url} /> : data?.type === 'table' ? <div className="table-scroll"><table><thead><tr>{(data.columns || []).map((cell, index) => <th key={index}>{typeof cell === 'object' ? cell.name || cell.key : cell}</th>)}</tr></thead><tbody>{(data.rows || []).map((row, index) => <tr key={index}>{(Array.isArray(row) ? row : Object.values(row)).map((cell, i) => <td key={i}>{String(cell ?? '')}</td>)}</tr>)}</tbody></table></div> : data?.type === 'text' ? isMarkdown ? <Markdown>{data.content}</Markdown> : <pre className="text-preview">{data.content}</pre> : data ? <Empty icon={File} title="此文件支持下载后打开" description="当前格式暂无内嵌预览。" /> : null}</div></Modal>;
}

export default function Files({ workspaceId, onPreview, notify, refresh }) {
  const [path, setPath] = useState('');
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [newFile, setNewFile] = useState(false);
  const [filename, setFilename] = useState('笔记.md');
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  useEffect(() => { setPath(''); }, [workspaceId]);
  useEffect(() => {
    if (!workspaceId) return;
    let alive = true;
    setData(null); setError('');
    api(`/files?${new URLSearchParams({ workspaceId, path })}`).then(value => { if (alive) setData(value); }).catch(problem => { if (alive) setError(problem.message); });
    return () => { alive = false; };
  }, [workspaceId, path, revision]);
  async function create(event) {
    event.preventDefault(); setSaving(true);
    try { const relative = [path, filename].filter(Boolean).join('/'); await post('/files', { workspaceId, path: relative, content: '' }); setNewFile(false); setRevision(value => value + 1); refresh?.(); notify?.('文件已创建'); onPreview(relative); }
    catch (problem) { setError(problem.message); }
    finally { setSaving(false); }
  }
  return <div className="file-browser"><div className="file-browser-header"><span><Folder size={16} />工作空间文件</span><div><IconButton icon={Plus} label="新建文本文件" onClick={() => setNewFile(true)} /><IconButton icon={RefreshCw} label="刷新文件" onClick={() => setRevision(value => value + 1)} /></div></div><div className="breadcrumbs">{path && <IconButton icon={ArrowLeft} label="上一级" onClick={() => setPath(path.split('/').slice(0, -1).join('/'))} />}<button onClick={() => setPath('')}>根目录</button>{path.split('/').filter(Boolean).map((name, index, all) => <span key={index}><ChevronRight size={12} /><button onClick={() => setPath(all.slice(0, index + 1).join('/'))}>{name}</button></span>)}</div><InlineError>{error}</InlineError>{!data && !error ? <div className="loading"><LoaderCircle className="spin" size={18} /></div> : data?.entries?.length ? <div className="file-list">{[...data.entries].sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1)).map(entry => <button key={entry.path} className="file-row" onClick={() => entry.type === 'directory' ? setPath(entry.path) : onPreview(entry.path)}>{entry.type === 'directory' ? <Folder size={17} className="folder-icon" /> : <FileText size={17} />}<span>{entry.name}</span>{entry.type === 'directory' ? <ChevronRight size={13} /> : <small>{formatSize(entry.size)}</small>}</button>)}</div> : !error ? <Empty icon={Folder} title="这里还是空的" description="生成的文件和上传的附件会显示在这里。" /> : null}{newFile && <Modal title="新建文件" onClose={() => setNewFile(false)}><form className="form" onSubmit={create}><Field label="文件名" hint="使用相对于当前目录的文件名，例如 研究笔记.md"><input autoFocus value={filename} onChange={event => setFilename(event.target.value)} required /></Field><InlineError>{error}</InlineError><div className="form-actions"><Button variant="secondary" onClick={() => setNewFile(false)}>取消</Button><Button type="submit" busy={saving}>创建文件</Button></div></form></Modal>}</div>;
}
