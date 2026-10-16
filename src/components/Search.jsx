import { useEffect, useState } from 'react';
import { ArrowUpRight, FileText, Folder, LoaderCircle, MessageSquare, Search as SearchIcon, Sparkles } from 'lucide-react';
import { api } from '../api';
import { Empty, InlineError, Modal, SearchInput } from './UI';

export default function Search({ onClose, navigate, onPreview }) {
  const [query, setQuery] = useState('');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!query.trim()) { setData(null); return; }
    let alive = true;
    setLoading(true); setError('');
    const timer = setTimeout(async () => {
      try { const value = await api(`/search?q=${encodeURIComponent(query)}`); if (alive) setData(value); }
      catch (problem) { if (alive) setError(problem.message); }
      finally { if (alive) setLoading(false); }
    }, 240);
    return () => { alive = false; clearTimeout(timer); };
  }, [query]);
  const groups = data ? [
    { label: '任务', items: data.tasks || [], icon: MessageSquare, open: item => navigate(`task/${item.id}`), description: item => item.messages?.[0]?.content?.slice(0, 90) },
    { label: '资料', items: data.library || [], icon: FileText, open: item => onPreview(item.workspaceId, item.path), description: item => item.path },
    { label: '工作空间', items: data.workspaces || [], icon: Folder, open: () => navigate('workspaces'), description: item => item.path },
    { label: '技能', items: data.skills || [], icon: Sparkles, open: () => navigate('market'), description: item => item.description },
  ] : [];
  return <Modal title="搜索工作空间" onClose={onClose} wide><div className="global-search"><SearchInput value={query} onChange={setQuery} placeholder="搜索任务、资料、空间与技能…" autoFocus /><InlineError>{error}</InlineError>{loading ? <div className="loading"><LoaderCircle className="spin" size={20} />搜索中…</div> : data ? groups.some(group => group.items.length) ? <div className="search-results">{groups.filter(group => group.items.length).map(group => <section key={group.label}><h3>{group.label}<span>{group.items.length}</span></h3>{group.items.slice(0, 12).map(item => <button key={item.id} onClick={() => { onClose(); group.open(item); }}><group.icon size={18} /><span><strong>{item.title || item.name}</strong><small>{group.description(item)}</small></span><ArrowUpRight size={15} /></button>)}</section>)}</div> : <Empty icon={SearchIcon} title="没有找到相关内容" description="换一个关键词试试。" /> : <div className="search-hint"><SearchIcon size={28} strokeWidth={1.2} /><p>输入关键词，找到过去的想法与成果。</p><span><kbd>Esc</kbd> 关闭搜索</span></div>}</div></Modal>;
}
