import { useRef, useState } from 'react';
import { ArrowDownToLine, ArrowUpFromLine, File, FileImage, FileSpreadsheet, FileText, FolderOpen, LibraryBig } from 'lucide-react';
import { fileUrl, formatDate, formatSize, uploadFile } from '../api';
import { Button, Empty, IconButton, InlineError, PageHeader, SearchInput, Select } from '../components/UI';

function fileKind(path = '') { if (/\.(png|jpe?g|gif|webp|svg)$/i.test(path)) return 'image'; if (/\.(xlsx?|csv|tsv)$/i.test(path)) return 'sheet'; return 'document'; }
export default function Library({ state, refresh, notify, onPreview }) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('all');
  const [workspaceId, setWorkspaceId] = useState(state.workspaces[0]?.id || '');
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);
  const generated = state.tasks.flatMap(task => (task.artifactPaths || []).map(path => ({ id: `${task.id}-${path}`, name: path.split('/').pop(), path, workspaceId: task.workspaceId, type: 'generated', createdAt: task.updatedAt, size: 0 })));
  const seen = new Set();
  const all = [...state.library, ...generated].filter(item => { const key = `${item.workspaceId}:${item.path}`; if (seen.has(key)) return false; seen.add(key); return true; });
  const items = all.filter(item => `${item.name} ${item.path}`.toLowerCase().includes(query.toLowerCase()) && (filter === 'all' || filter === fileKind(item.name))).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  async function upload(event) {
    setUploading(true); setError('');
    try { const files = Array.from(event.target.files || []); for (const file of files) await uploadFile(file, workspaceId); await refresh(); notify(`${files.length} 个文件已加入资料库`); }
    catch (problem) { setError(problem.message); }
    finally { setUploading(false); event.target.value = ''; }
  }
  return <div className="page"><PageHeader title="资料库" description="上传的资料与生成的成果，在这里相遇。"><div className="upload-controls"><Select value={workspaceId} onChange={event => setWorkspaceId(event.target.value)} aria-label="上传到工作空间">{state.workspaces.map(workspace => <option key={workspace.id} value={workspace.id}>{workspace.name}</option>)}</Select><input type="file" multiple hidden ref={input} onChange={upload} /><Button icon={ArrowUpFromLine} busy={uploading} onClick={() => input.current?.click()}>上传文件</Button></div></PageHeader><div className="page-tools"><div className="filter-chips">{[['all', '全部文件'], ['document', '文档'], ['sheet', '表格'], ['image', '图片']].map(([id, label]) => <button key={id} className={filter === id ? 'active' : ''} onClick={() => setFilter(id)}>{label}</button>)}</div><SearchInput value={query} onChange={setQuery} placeholder="搜索文件" /></div><InlineError>{error}</InlineError>{items.length ? <div className="library-table"><div className="table-heading"><span>文件名称</span><span>工作空间</span><span>大小</span><span>添加时间</span><span /></div>{items.map(item => { const kind = fileKind(item.name); const Icon = kind === 'image' ? FileImage : kind === 'sheet' ? FileSpreadsheet : FileText; return <div className="library-row" key={item.id}><button className="library-name" onClick={() => onPreview(item.workspaceId, item.path)}><span className={`file-type-icon ${kind}`}><Icon size={22} strokeWidth={1.6} /></span><span><strong>{item.name}</strong><small>{item.path}</small></span></button><span className="workspace-cell"><FolderOpen size={14} />{state.workspaces.find(workspace => workspace.id === item.workspaceId)?.name}</span><span className="muted">{item.type === 'generated' ? '任务产物' : formatSize(item.size)}</span><time>{formatDate(item.createdAt)}</time><a href={fileUrl(item.workspaceId, item.path)} download className="icon-button" title="下载文件" aria-label={`下载 ${item.name}`}><ArrowDownToLine size={16} /></a></div>; })}</div> : <Empty icon={LibraryBig} title={query ? '没有找到相关文件' : '从第一份资料开始'} description={query ? '换一个关键词或文件分类试试。' : '上传研究资料、表格或图片，在任务中引用，让 AI 读懂你的上下文。'} action={!query && <Button icon={ArrowUpFromLine} busy={uploading} onClick={() => input.current?.click()}>上传文件</Button>} />}</div>;
}
