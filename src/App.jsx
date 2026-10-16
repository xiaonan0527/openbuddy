import { useCallback, useEffect, useState } from 'react';
import { ArrowUpRight, Bot, CalendarClock, ChevronDown, ChevronRight, Command, FolderOpen, LibraryBig, LoaderCircle, Menu, MessageSquare, PanelLeftClose, PanelLeftOpen, Plus, Search as SearchIcon, Settings as SettingsIcon, Sparkles, X } from 'lucide-react';
import { useWorkspace } from './useWorkspace';
import { Button, IconButton, InlineError, Toast } from './components/UI';
import Search from './components/Search';
import { Preview } from './components/Files';
import Home from './pages/Home';
import Chat from './pages/Chat';
import Tasks from './pages/Tasks';
import Market from './pages/Market';
import Workspaces from './pages/Workspaces';
import Schedules from './pages/Schedules';
import Library from './pages/Library';
import Settings from './pages/Settings';
import Assistants from './pages/Assistants';

const NAV = [
  { route: 'assistants', label: '助理', icon: Bot },
  { route: 'market', label: '专家 · 技能 · 连接器', icon: Sparkles },
  { route: 'schedules', label: '定时任务', icon: CalendarClock },
  { route: 'library', label: '资料库', icon: LibraryBig },
];

function getRoute() { return window.location.hash.replace(/^#\/?/, '') || 'home'; }

export default function App() {
  const { state, error, connected, refresh } = useWorkspace();
  const [route, setRoute] = useState(getRoute);
  const [search, setSearch] = useState(false);
  const [preview, setPreview] = useState(null);
  const [toast, setToast] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [showRecent, setShowRecent] = useState(true);
  const notify = useCallback(message => setToast(message), []);
  const closeToast = useCallback(() => setToast(''), []);
  const navigate = useCallback(path => { window.location.hash = path; setRoute(path); setMobileOpen(false); }, []);
  const onPreview = useCallback((workspaceId, path) => setPreview({ workspaceId, path }), []);
  useEffect(() => {
    function hash() { setRoute(getRoute()); }
    function key(event) { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); setSearch(value => !value); } }
    window.addEventListener('hashchange', hash); window.addEventListener('keydown', key);
    return () => { window.removeEventListener('hashchange', hash); window.removeEventListener('keydown', key); };
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = state?.settings?.theme || 'light'; }, [state?.settings?.theme]);
  if (!state) return <div className="boot-screen"><div className="brand-mark large">O<span /></div><h1>OpenBuddy</h1>{error ? <><InlineError>{error}</InlineError><p>请确认本地后台服务已经启动。</p><Button onClick={refresh}>重新连接</Button></> : <><LoaderCircle className="spin" size={24} /><p>正在准备你的工作空间…</p></>}</div>;
  const [path, queryString] = route.split('?');
  const query = new URLSearchParams(queryString || '');
  const section = path.split('/')[0];
  const recent = [...state.tasks].filter(task => !task.archived).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 12);
  const common = { state, refresh, notify, navigate, onPreview };
  let content;
  if (section === 'task') content = <Chat {...common} taskId={path.slice(5)} key={path} />;
  else if (section === 'tasks') content = <Tasks {...common} />;
  else if (section === 'market') content = <Market {...common} />;
  else if (section === 'workspaces') content = <Workspaces {...common} />;
  else if (section === 'schedules') content = <Schedules {...common} />;
  else if (section === 'library') content = <Library {...common} />;
  else if (section === 'settings') content = <Settings {...common} initialTab={query.get('tab')} key={route} />;
  else if (section === 'assistants') content = <Assistants {...common} />;
  else content = <Home {...common} defaultWorkspaceId={query.get('workspace')} defaultExpertId={query.get('expert')} key={route} />;
  return <div className={`app-shell ${collapsed ? 'sidebar-collapsed' : ''} ${mobileOpen ? 'mobile-sidebar-open' : ''}`}><div className="mobile-topbar"><button className="brand" onClick={() => navigate('home')}><span className="brand-mark">O<span /></span><strong>OpenBuddy</strong></button><IconButton icon={Menu} label="展开导航" onClick={() => setMobileOpen(true)} /></div>{mobileOpen && <button className="sidebar-scrim" aria-label="关闭导航" onClick={() => setMobileOpen(false)} />}<aside className="sidebar"><div className="sidebar-top"><button className="brand" onClick={() => navigate('home')} title="OpenBuddy 首页"><span className="brand-mark">O<span /></span><strong>OpenBuddy</strong></button><IconButton icon={collapsed ? PanelLeftOpen : PanelLeftClose} label={collapsed ? '展开侧栏' : '收起侧栏'} className="sidebar-collapse" onClick={() => setCollapsed(!collapsed)} /><IconButton icon={X} label="关闭导航" className="sidebar-mobile-close" onClick={() => setMobileOpen(false)} /></div><div className="sidebar-actions"><button className={`new-task ${section === 'home' ? 'active' : ''}`} onClick={() => navigate('home')} title="新建任务"><Plus size={19} /><span>新建任务</span></button><button className="sidebar-search" onClick={() => setSearch(true)} title="搜索 ⌘K"><SearchIcon size={17} /><span>搜索</span><kbd>⌘ K</kbd></button></div><nav className="main-nav" aria-label="主导航">{NAV.map(item => <button className={section === item.route ? 'active' : ''} key={item.route} onClick={() => navigate(item.route)} title={item.label}><item.icon size={18} strokeWidth={1.65} /><span>{item.label}</span>{item.route === 'assistants' && <small>本地</small>}</button>)}</nav><div className="sidebar-section-nav"><button onClick={() => navigate('tasks')} className={section === 'tasks' || section === 'task' ? 'active' : ''} title="全部任务"><MessageSquare size={17} /><span>任务</span><span className="nav-count">{state.tasks.filter(task => !task.archived).length}</span></button><button onClick={() => navigate('workspaces')} className={section === 'workspaces' ? 'active' : ''} title="工作空间"><FolderOpen size={17} /><span>空间</span><span className="nav-count">{state.workspaces.length}</span></button></div><div className="sidebar-recents"><button className="recents-heading" onClick={() => setShowRecent(!showRecent)}><span>最近任务</span>{showRecent ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</button>{showRecent && <div className="recent-list">{recent.length ? recent.map(task => <button key={task.id} onClick={() => navigate(`task/${task.id}`)} className={path === `task/${task.id}` ? 'active' : ''} title={task.title}><span className={`recent-status ${task.status}`} /><span>{task.title}</span></button>) : <div className="no-recents">你的任务将出现在这里</div>}</div>}</div><div className="sidebar-bottom"><button className={`profile-button ${section === 'settings' ? 'active' : ''}`} onClick={() => navigate('settings')} title="设置"><span className="profile-avatar">我</span><span><strong>本地工作空间</strong><small><i className={connected ? 'online' : ''} />{connected ? '已连接' : '连接中'}</small></span><SettingsIcon size={17} /></button><div className="sidebar-version"><span>OpenBuddy 1.0</span><span>LOCAL</span></div></div></aside><main className="main-content">{error && <div className="connection-banner"><InlineError>{error}</InlineError><button onClick={refresh}>重试</button></div>}{content}</main>{search && <Search onClose={() => setSearch(false)} navigate={navigate} onPreview={onPreview} />}{preview && <Preview {...preview} onClose={() => setPreview(null)} notify={notify} refresh={refresh} />}<Toast message={toast} onClose={closeToast} /></div>;
}
