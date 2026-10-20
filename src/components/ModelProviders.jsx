import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Cpu, Eye, EyeOff, ExternalLink, LockKeyhole, Pencil, Plus, RefreshCw, Trash2, Wifi } from 'lucide-react';
import { api, patch, post, remove } from '../api';
import { Button, Field, IconButton, InlineError, Modal, Status } from './UI';

function initialForm(preset) {
  return { preset: preset?.id || 'custom', name: preset?.name || '', baseUrl: preset?.baseUrl || '', apiKey: '', model: preset?.models?.[0] || '', protocol: preset?.protocol || 'chat_completions' };
}

function ProviderEditor({ catalog, profile, onClose, onSaved }) {
  const [form, setForm] = useState(() => profile ? { ...profile, apiKey: '' } : initialForm(catalog[0]));
  const [busy, setBusy] = useState(''), [error, setError] = useState(''), [result, setResult] = useState(null);
  const [showKey, setShowKey] = useState(false), [models, setModels] = useState([]);
  const controller = useRef(null);
  useEffect(() => { const value = new AbortController(); controller.current = value; return () => value.abort(); }, []);
  const preset = catalog.find(item => item.id === form.preset);
  const suggestions = [...new Set([...models, ...(preset?.models || [])])];
  function change(name, value) { setForm(previous => ({ ...previous, [name]: value })); setResult(null); setError(''); }
  function choosePreset(id) {
    const next = initialForm(catalog.find(item => item.id === id));
    setForm(previous => ({ ...next, ...(previous.id ? { id: previous.id } : {}) }));
    setModels([]); setResult(null); setError('');
  }
  async function request(action) {
    setBusy(action); setError(''); setResult(null);
    try {
      if (action === 'models') {
        const data = await api('/providers/models', { method: 'POST', body: form, signal: controller.current.signal });
        setModels(data.models); if (!data.models.length) setError('服务没有返回模型，请手动输入模型 ID。');
      } else if (action === 'test') {
        setResult(await api('/providers/test', { method: 'POST', body: form, signal: controller.current.signal }));
      } else {
        const added = form.id ? await patch(`/providers/${form.id}`, form) : await post('/providers', form);
        await post(`/providers/${added.id}/activate`); await onSaved(added);
      }
    } catch (problem) { if (!controller.current.signal.aborted) setError(problem.message); }
    finally { setBusy(''); }
  }
  return <Modal title={profile ? '编辑模型' : '添加模型'} description="选择供应商并填写模型配置。密钥仅在本机保存，请求时用于认证所选服务。" onClose={onClose} wide>
    <form className="provider-form" onSubmit={event => { event.preventDefault(); request('save'); }}>
      <fieldset disabled={Boolean(busy)}>
        <div className="provider-label-row"><label htmlFor="model-provider">供应商</label>{preset?.docsUrl && <a href={preset.docsUrl} target="_blank" rel="noreferrer">查看文档 <ExternalLink size={14} /></a>}</div>
        <select id="model-provider" aria-label="供应商" value={form.preset} onChange={event => choosePreset(event.target.value)}>{catalog.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select>
        <Field label="显示名称"><input value={form.name} onChange={event => change('name', event.target.value)} maxLength={80} required placeholder="例如：工作用 Kimi" /></Field>
        <Field label="API 地址" hint="填写 Base URL；普通 API 与 Coding Plan 的地址和密钥可能不同，请以供应商文档为准。"><input type="url" aria-label="API 地址" value={form.baseUrl} onChange={event => { change('baseUrl', event.target.value); setModels([]); }} required placeholder="https://api.example.com/v1" /></Field>
        <div className="field"><label htmlFor="model-key">API Key</label><div className="provider-key-row"><input id="model-key" aria-label="API Key" type={showKey ? 'text' : 'password'} autoComplete="new-password" value={form.apiKey} onChange={event => change('apiKey', event.target.value)} required={!profile} placeholder={profile ? '留空保留已保存的密钥' : '输入该供应商的 API Key'} /><IconButton icon={showKey ? EyeOff : Eye} label={showKey ? '隐藏密钥' : '显示密钥'} onClick={() => setShowKey(previous => !previous)} /></div>{profile && <small>已有密钥不会回显。更换地址或供应商时，请重新输入密钥。</small>}</div>
        <div className="field"><label htmlFor="model-id">模型名称 / ID</label><div className="provider-model-row"><input id="model-id" aria-label="模型 ID" list="provider-model-list" value={form.model} onChange={event => change('model', event.target.value)} required maxLength={200} placeholder="输入或选择模型 ID" /><Button variant="secondary" icon={RefreshCw} busy={busy === 'models'} onClick={() => request('models')}>读取列表</Button></div><datalist id="provider-model-list">{suggestions.map(model => <option key={model} value={model} />)}</datalist><small>可手动输入，也可读取供应商列表。预设名称不保证账号有访问权限。</small></div>
        <Field label="接口协议"><select aria-label="接口协议" value={form.protocol} onChange={event => change('protocol', event.target.value)}><option value="chat_completions">OpenAI Chat Completions 兼容</option><option value="responses">OpenAI Responses</option></select></Field>
      </fieldset>
      <InlineError>{error}</InlineError>
      {result?.ok && <div className="success-message" role="status"><CheckCircle2 size={17} />连接成功 · {result.model} · {result.latencyMs} ms</div>}
      <p className="small-note">连接测试发送一次简短模型请求，按服务商规则计费；此测试不代表工具调用能力已验证。</p>
      <div className="form-actions"><Button variant="secondary" onClick={() => request('test')} disabled={Boolean(busy)} icon={Wifi}>测试连接</Button><Button variant="secondary" onClick={onClose} disabled={busy === 'save'}>取消</Button><Button type="submit" busy={busy === 'save'} disabled={Boolean(busy)}>保存并切换</Button></div>
    </form>
  </Modal>;
}

export default function ModelProviders({ state, refresh, notify }) {
  const [catalog, setCatalog] = useState([]), [saved, setSaved] = useState({ providers: [], activeId: null });
  const [editor, setEditor] = useState(null), [deleting, setDeleting] = useState(null);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [result, setResult] = useState(null);
  const [legacyModel, setLegacyModel] = useState(state.settings.model || state.provider?.model || '');
  async function load() { const [providers, presets] = await Promise.all([api('/providers'), api('/providers/catalog')]); setSaved(providers); setCatalog(presets); }
  useEffect(() => { let current = true; Promise.all([api('/providers'), api('/providers/catalog')]).then(([providers, presets]) => { if (current) { setSaved(providers); setCatalog(presets); } }).catch(problem => { if (current) setError(problem.message); }); return () => { current = false; }; }, []);
  async function activate(provider) {
    setBusy(true); setError(''); setResult(null);
    try { await post(provider ? `/providers/${provider.id}/activate` : '/providers/local'); await Promise.all([load(), refresh()]); notify(provider ? `当前模型已切换到 ${provider.name}` : '已切换到现有本机配置'); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  async function testCurrent() {
    setBusy(true); setError(''); setResult(null);
    try { setResult(await post('/provider/test')); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  async function changeModel(event) {
    event.preventDefault(); setBusy(true); setError('');
    try { await patch('/settings', { model: legacyModel.trim() }); await refresh(); notify('默认模型已更新'); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  async function deleteProvider() {
    setBusy(true); setError('');
    try { await remove(`/providers/${deleting.id}`); setDeleting(null); await Promise.all([load(), refresh()]); notify('模型配置已删除'); }
    catch (problem) { setError(problem.message); }
    finally { setBusy(false); }
  }
  const active = saved.providers.find(item => item.id === saved.activeId);
  return <>
    <div className="settings-section"><div className="model-section-heading"><div><h2>模型服务</h2><p>使用自己的模型账号，随时切换你的工作伙伴。</p></div><Button icon={Plus} disabled={!catalog.length || busy} onClick={() => { setEditor({}); setError(''); }}>添加模型</Button></div>
      <div className="provider-card"><div className="provider-icon"><Cpu size={25} /></div><div><h3>{active?.name || state.provider?.model || '尚未检测到模型'}</h3><p>{active ? `${active.model} · ${active.baseUrl}` : state.provider?.baseUrl || '添加供应商，或配置本机模型服务'}</p></div><Status value={state.provider?.configured ? 'ready' : 'needs_configuration'} /></div>
      <dl className="definition-list"><div><dt>配置来源</dt><dd>{state.provider?.source || '现有本机配置'}</dd></div><div><dt>协议</dt><dd>{state.provider?.protocol === 'chat_completions' ? 'OpenAI Chat Completions 兼容' : state.provider?.protocol || 'Responses'}</dd></div><div><dt>密钥</dt><dd><LockKeyhole size={13} />{state.provider?.configured ? '已配置；保存后不回显' : '尚未配置'}</dd></div></dl>
      <div className="provider-actions"><Button icon={Wifi} busy={busy} variant="secondary" onClick={testCurrent}>测试当前连接</Button>{active && <Button variant="secondary" disabled={busy} onClick={() => activate(null)}>使用现有本机配置</Button>}</div>
      {result?.ok && <div className="success-message" role="status"><CheckCircle2 size={17} />连接成功 · {result.model} · {result.latencyMs} ms</div>}
      <InlineError>{error}</InlineError>{state.provider?.error && <InlineError>{state.provider.error}</InlineError>}
      <p className="small-note">切换默认模型适用于新任务。已有任务继续使用创建时的供应商与模型。测试连接会消耗一次简短请求的额度。</p>
    </div>
    <div className="settings-section"><h2>已添加的模型</h2><p>支持智谱、Kimi 中国版、MiniMax 中国版、DeepSeek，也可添加自定义兼容地址。</p>
      <div className="saved-provider-list">{saved.providers.map(provider => <article key={provider.id} className={provider.id === saved.activeId ? 'active' : ''}><div><strong>{provider.name}</strong><span>{provider.model}</span><span>{provider.baseUrl}</span></div><div className="provider-actions">{provider.id === saved.activeId ? <Status value="ready" text="当前默认" /> : <Button variant="secondary" disabled={busy} onClick={() => activate(provider)}>设为默认</Button>}<Button variant="secondary" icon={Pencil} disabled={busy} onClick={() => { setEditor(provider); setError(''); }}>编辑</Button><IconButton icon={Trash2} label={`删除 ${provider.name}`} disabled={busy} onClick={() => setDeleting(provider)} /></div></article>)}</div>
      {!saved.providers.length && <div className="model-empty"><Cpu size={24} /><p>还没有添加模型服务</p><span>点击“添加模型”，选择供应商并填入 API Key。</span></div>}
    </div>
    {!active && <div className="settings-section"><h2>本机配置的默认模型</h2><form onSubmit={changeModel}><Field label="模型 ID" hint="留空使用配置文件中的默认模型。"><input value={legacyModel} onChange={event => setLegacyModel(event.target.value)} placeholder={state.provider?.model || '使用本机默认模型'} /></Field><Button busy={busy} type="submit">保存模型</Button></form></div>}
    {editor && <ProviderEditor catalog={catalog} profile={editor.id ? editor : null} onClose={() => setEditor(null)} onSaved={async added => { await Promise.all([load(), refresh()]); setEditor(null); setResult(null); notify(`已保存并切换到 ${added.name}`); }} />}
    {deleting && <Modal title="删除模型配置？" description={`将删除 ${deleting.name} 的本机密钥与配置。关联的历史任务会保留，但需要此配置的任务将无法续跑。`} onClose={() => setDeleting(null)}><InlineError>{error}</InlineError><div className="form-actions"><Button variant="secondary" onClick={() => setDeleting(null)}>取消</Button><Button variant="danger" busy={busy} onClick={deleteProvider}>删除配置</Button></div></Modal>}
  </>;
}
