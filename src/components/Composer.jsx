import { useRef, useState } from 'react';
import { ArrowUp, Check, Folder, Paperclip, Shield, Sparkles, Square, X } from 'lucide-react';
import { uploadFile } from '../api';
import { IconButton, InlineError, Select } from './UI';

export default function Composer({ state, value, onChange, onSubmit, workspaceId, setWorkspaceId, expertId, setExpertId, skillIds = [], setSkillIds, mode, setMode, busy, running, onStop, placeholder, compact = false, notify, refresh }) {
  const input = useRef(null);
  const textarea = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [attachments, setAttachments] = useState([]);
  const [showSkills, setShowSkills] = useState(false);
  const skills = (state.skills || []).filter(skill => skill.enabled);
  async function upload(event) {
    setError(''); setUploading(true);
    try {
      const files = Array.from(event.target.files || []);
      for (const file of files) {
        const item = await uploadFile(file, workspaceId);
        setAttachments(previous => [...previous, item]);
      }
      refresh?.();
      notify?.(`${files.length} 个附件已加入工作空间`);
    } catch (problem) { setError(problem.message); }
    finally { setUploading(false); event.target.value = ''; }
  }
  async function send() {
    if ((!value.trim() && !attachments.length) || busy || running) return;
    const context = attachments.length ? `\n\n附件（工作空间相对路径）：\n${attachments.map(item => `- ${item.path}`).join('\n')}` : '';
    try { await onSubmit(`${value.trim()}${context}`); setAttachments([]); }
    catch { /* The page owns submission feedback. */ }
  }
  return <div className={`composer-wrap ${compact ? 'composer-compact' : ''}`}><div className={`composer ${busy ? 'composer-busy' : ''}`}><textarea ref={textarea} value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder || '描述你的任务，让想法开始发生…'} aria-label="任务内容" onKeyDown={event => { if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} rows={compact ? 2 : 3} />{attachments.length > 0 && <div className="attachments">{attachments.map((item, index) => <span key={`${item.id}-${index}`}><Paperclip size={13} />{item.name}<IconButton icon={X} label={`移除附件 ${item.name}`} onClick={() => setAttachments(previous => previous.filter((_, i) => i !== index))} /></span>)}</div>}<div className="composer-toolbar"><div className="composer-tools"><input hidden type="file" multiple ref={input} onChange={upload} /><IconButton icon={Paperclip} label="添加附件" disabled={uploading || running} onClick={() => input.current?.click()} /><span className="toolbar-divider" />{setExpertId && <Select value={expertId || ''} onChange={event => setExpertId(event.target.value)} aria-label="选择专家"><option value="">通用助手</option>{(state.experts || []).map(expert => <option key={expert.id} value={expert.id}>{expert.name}</option>)}</Select>}{setSkillIds && <div className="skills-picker-wrap"><button className={`text-tool ${skillIds.length ? 'selected' : ''}`} onClick={() => setShowSkills(!showSkills)} type="button"><Sparkles size={15} />技能{skillIds.length ? ` ${skillIds.length}` : ''}</button>{showSkills && <><button className="popover-dismiss" aria-label="关闭技能菜单" onClick={() => setShowSkills(false)} /><div className="skills-popover"><div className="popover-title">本次任务使用的技能</div>{skills.length ? skills.map(skill => <button type="button" key={skill.id} onClick={() => setSkillIds(skillIds.includes(skill.id) ? skillIds.filter(id => id !== skill.id) : [...skillIds, skill.id])}><span className={`checkbox ${skillIds.includes(skill.id) ? 'checked' : ''}`}>{skillIds.includes(skill.id) && <Check size={11} />}</span><span>{skill.name}</span></button>) : <p className="muted">还没有启用的技能</p>}</div></>}</div>}</div><div className="composer-submit">{uploading && <small>上传中…</small>}{running ? <button type="button" className="send-button stop-button" onClick={onStop} title="停止执行" aria-label="停止执行"><Square size={15} fill="currentColor" /></button> : <button type="button" className="send-button" onClick={send} disabled={busy || uploading || (!value.trim() && !attachments.length)} title="发送任务" aria-label="发送任务"><ArrowUp size={20} /></button>}</div></div></div><div className="composer-footer"><div><Folder size={14} />{setWorkspaceId ? <Select value={workspaceId || ''} onChange={event => setWorkspaceId(event.target.value)} aria-label="选择工作空间">{state.workspaces.map(workspace => <option value={workspace.id} key={workspace.id}>{workspace.name}</option>)}</Select> : <span>{state.workspaces.find(workspace => workspace.id === workspaceId)?.name || '工作空间'}</span>}{setMode && <><span className="dot-divider" /><Shield size={13} /><Select value={mode} onChange={event => setMode(event.target.value)} aria-label="执行权限"><option value="default">标准权限</option><option value="readOnly">只读模式</option></Select></>}</div><span>{state.settings.model || state.provider?.model || '当前模型'}</span></div><InlineError>{error}</InlineError></div>;
}
