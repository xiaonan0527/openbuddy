import { useState } from 'react';
import { BarChart3, BookOpen, Code2, FileText, Globe, LayoutTemplate, Lightbulb, Palette, Presentation, Search, Sparkles, Terminal, Workflow } from 'lucide-react';
import { post } from '../api';
import Composer from '../components/Composer';
import { InlineError } from '../components/UI';

const SCENES = {
  work: { label: '办公', icon: Sparkles, title: '把想法，交给行动。', description: '从一份文档到一个复杂项目，你的本地 AI 工作伙伴。', suggestions: [
    { icon: FileText, label: '创作文档', prompt: '请帮我创建一份 Word 文档。先询问我文档的主题、用途和受众，再编写内容并生成 .docx 文件。' },
    { icon: BarChart3, label: '分析数据', prompt: '请分析我提供的数据，梳理关键指标、趋势和异常，并将结论整理成报告。请先列出你需要的数据。' },
    { icon: Presentation, label: '制作 PPT', prompt: '请帮我制作一份演示文稿。先确认主题、受众和页数，规划叙事大纲，再生成 .pptx 文件。' },
    { icon: Search, label: '深度研究', prompt: '请帮我研究一个主题。先询问具体研究问题，列出研究框架，区分事实、推断和待验证事项。' },
    { icon: Lightbulb, label: '策划方案', prompt: '请和我一起制定一个可执行的项目方案。先确认目标、时间和资源，再输出阶段安排和交付物。' },
    { icon: BookOpen, label: '整理资料', prompt: '请查看当前工作空间的文件，整理内容索引，概括每份资料，并生成一份 Markdown 资料目录。先只读分析，不移动原文件。' },
  ] },
  code: { label: '开发', icon: Code2, title: '从一个问题，到一个作品。', description: '理解代码、规划实现、运行验证，把开发过程连在一起。', suggestions: [
    { icon: Code2, label: '日常开发', prompt: '请先查看工作空间的项目结构和说明文档，概括技术栈与当前状态，然后和我确认需要开发的功能。' },
    { icon: Globe, label: '开发网站', prompt: '我想开发一个网站。请先确认网站用途、用户和主要页面，再制定并执行实现方案。' },
    { icon: Terminal, label: '排查问题', prompt: '请帮我排查项目问题。先阅读相关代码和日志，明确复现条件，提出有证据的原因与最小修复方案。' },
    { icon: Workflow, label: '构建 Agent', prompt: '请帮我构建一个 AI Agent。先确认任务目标、输入输出、所需工具和权限边界，再规划实现。' },
    { icon: Sparkles, label: '编写技能', prompt: '请帮我设计一个可复用的 AI 技能。先询问使用场景，再输出名称、描述、工作步骤和完整技能说明。' },
    { icon: FileText, label: '技术文档', prompt: '请阅读当前项目结构，整理一份技术文档，包含架构、模块职责、启动方式和已知限制，引用实际文件。' },
  ] },
  design: { label: '设计', icon: Palette, title: '让灵感，有了形状。', description: '梳理创意、编写设计方案、制作可交付的网页与视觉内容。', suggestions: [
    { icon: Palette, label: '视觉方案', prompt: '请帮我制定一份视觉设计方案。先确认品牌、受众、用途和风格，再输出配色、字体、构图与素材建议。' },
    { icon: Globe, label: '网站设计', prompt: '请为我设计并实现一个有完整交互的网页。先确认内容、页面目标与风格，然后创建可预览的 HTML 文件。' },
    { icon: Presentation, label: 'PPT 设计', prompt: '请帮我策划一套演示文稿的视觉系统，确认主题后，设计结构、配色和版式，并生成 PPT 文件。' },
    { icon: LayoutTemplate, label: '运营海报', prompt: '请帮我设计一张运营海报。先确认活动信息、尺寸比例、品牌和渠道，再制作可预览的 HTML 排版。' },
    { icon: Lightbulb, label: '品牌设计', prompt: '请帮我建立品牌设计方向。先确认品牌定位与用户，再提出名称、视觉关键词、配色与应用示例。' },
    { icon: FileText, label: '图片提示词', prompt: '请帮我编写详细的图片生成提示词。先确认主体、画面用途和风格，再输出构图、光影、材质与限制条件。当前未配置图片生成服务时，请只交付提示词。' },
  ] },
};

export default function Home({ state, navigate, notify, refresh, defaultWorkspaceId, defaultExpertId }) {
  const [scene, setScene] = useState('work');
  const [prompt, setPrompt] = useState('');
  const [workspaceId, setWorkspaceId] = useState(defaultWorkspaceId || state.workspaces[0]?.id || '');
  const [expertId, setExpertId] = useState(defaultExpertId || '');
  const [skillIds, setSkillIds] = useState([]);
  const [mode, setMode] = useState('default');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function create(content) {
    setBusy(true); setError('');
    try { const task = await post('/tasks', { prompt: content, workspaceId, scene, expertId, skillIds, mode }); await refresh(); navigate(`task/${task.id}`); }
    catch (problem) { setError(problem.message); throw problem; }
    finally { setBusy(false); }
  }
  const current = SCENES[scene];
  return <div className="home-page"><div className="home-topline"><span>你的工作空间</span><span className="local-label"><span />本地运行</span></div><section className="home-center"><div className="welcome-mark" aria-hidden="true"><span /><span /><span /><span /></div><h1>{current.title}</h1><p className="home-subtitle">{current.description}</p><div className="scene-tabs" role="tablist" aria-label="任务场景">{Object.entries(SCENES).map(([key, item]) => <button type="button" role="tab" aria-selected={scene === key} className={scene === key ? 'active' : ''} key={key} onClick={() => setScene(key)}><item.icon size={16} />{item.label}</button>)}</div><Composer state={state} value={prompt} onChange={setPrompt} onSubmit={create} workspaceId={workspaceId} setWorkspaceId={setWorkspaceId} expertId={expertId} setExpertId={setExpertId} skillIds={skillIds} setSkillIds={setSkillIds} mode={mode} setMode={setMode} busy={busy} notify={notify} refresh={refresh} /><InlineError>{error}</InlineError><div className="suggestion-grid">{current.suggestions.map(item => <button type="button" key={item.label} className="suggestion" onClick={() => setPrompt(item.prompt)}><item.icon size={18} strokeWidth={1.7} /><span>{item.label}</span></button>)}</div><div className="home-note">任务、文件与记忆保存在本机。AI 请求使用你的模型服务。</div></section><div className="home-bottom"><span>OPENBUDDY · 为专注工作而生</span><button onClick={() => navigate('settings')}>管理模型与偏好 <span>↗</span></button></div></div>;
}
