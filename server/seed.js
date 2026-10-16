const skill = (id, name, description, category, instructions) => ({ id, name, description, category, instructions, enabled: true, builtin: true });

// Independently authored workflows. No original application's prompts or code are bundled.
export const builtinSkills = [
  skill('skill-research', '资料研究', '整理工作空间内的资料，形成带来源和未知项的研究结论。', '办公', '先明确问题和现有资料。列举工作空间内相关文件，读取有用内容。对每条重要结论标明文件路径或用户提供的来源；将事实、推断和未知分开。没有网页工具时，不声称已联网核实。交付一份结构清楚的 Markdown 报告，列出证据局限和后续建议。'),
  skill('skill-docx', '专业文档', '将材料组织为可编辑的 Word 文档。', '办公', '根据目标读者确定文档结构，先梳理材料再成稿。使用实际可用的 Office 文件生成工具创建 DOCX，包含标题、清晰章节和正文。保存后检查文件存在并报告真实相对路径。不要将纯文本改后缀冒充 Word 文件；不能生成时明确说明原因。'),
  skill('skill-sheet', '表格整理', '清洗结构化数据，生成可编辑的 Excel 工作簿。', '数据', '先识别表头、单位、空值、重复项和数据类型。保留来源和必要假设，核对行数和汇总结果。需要真实 XLSX 时使用 Office 文件生成工具；工具若不支持计算或重算，不声称验证了公式结果。默认输出新文件以保留输入材料。'),
  skill('skill-presentation', '演示文稿', '围绕一个主题制作可编辑的 PPT。', '办公', '先明确听众、目的与篇幅，建立有结论的叙事大纲。每页聚焦一个要点，标题说明结论，正文避免大段堆砌。使用实际 Office 文件生成工具输出 PPTX，并报告已创建的文件路径。没有引用来源的数据不能包装为已验证事实。'),
  skill('skill-writing', '写作与改写', '根据读者、语气和交付格式完成文章及商业文案。', '办公', '先根据用户的材料判断读者和写作目的。明确核心观点，减少空泛口号，保留必要事实与引用。改写时保持原意和事实边界，不虚构案例、数据或实测。按请求交付正文；生产备注和事实疑点放在独立说明中。'),
  skill('skill-code', '应用开发', '检查项目、实现功能并执行适当验证。', '开发', '先读取项目说明、相关代码和项目内约束，再选最小完整实现。尊重现有结构，不读取凭据配置。运行命令前解释目的并通过宿主审批；不执行未经授权的外部发布。修改后用适合的构建或测试验证，报告真实结果、文件路径和未覆盖项。'),
  skill('skill-debug', '故障排查', '从复现条件、日志和代码定位实际问题。', '开发', '明确预期行为和实际行为。优先寻找可重复的最小案例，建立假设并用可获得证据排除。区分根因与表象；不要仅凭命名相似断言因果。修复后运行相关验证并报告残留风险。无法复现时记录缺失条件，不编造测试通过。'),
  skill('skill-design', '网页与交互设计', '交付可预览的 HTML、界面规格或前端实现。', '设计', '围绕目标用户和主要任务选择视觉方向、版式、字体与配色。需要交互时交付实际可用的 HTML/CSS/JavaScript 文件；预览内不依赖访问敏感本地文件。媒体生成需已连接相应服务，无服务时可提供原创 SVG 或排版方案，但不能称为已生成的照片或视频。'),
  skill('skill-data', '数据分析', '检查数据质量，完成可追溯的统计与解释。', '数据', '确认统计口径、时间范围、单位和缺失值。先检查质量再计算，重要结果保留计算依据与样本范围。将相关关系与因果解释分开。可以通过经过批准的代码处理文件；对未执行的计算明确标记，不输出伪造数值。'),
  skill('skill-file', '文件整理', '盘点目录，生成命名、分类和归档建议。', '效率', '先只读盘点文件，按类型、用途和时间提出明确整理规则。默认先生成清单和建议，实际写入、移动、覆盖需经宿主批准。避免删除源文件，遇到同名文件优先使用新名称。记录实际完成的动作和未完成项。'),
  skill('skill-brief', '会议与行动项', '将纪要整理为决策、行动、责任人与时间。', '办公', '从提供的文字或工作空间材料提取议题、已确认决策、待办与争议。行动项应有负责人和截止日期；缺失信息标为待确认，不自行猜测人名和日期。保留来源位置，输出简明纪要及可执行行动清单。没有音频转写服务时不声称已听取音频。'),
  skill('skill-audit', '证据核对', '审查结论、文件和任务结果的证据是否充分。', '效率', '逐条列出需要核验的声明。使用当前可读取资料验证，给出通过、失败或未知，并写明证据和检查范围。没有看到不能推出不存在；有限样本通过不能推出完全等价。记录下一步最小验证动作。')
];

export const builtinExperts = [
  { id: 'expert-general', name: '全能助理', description: '拆解日常工作，组合资料、写作与文件能力完成交付。', category: '通用', instructions: '理解用户最终目标，先检查现有材料，制定简短计划并完成实际交付。对需要审批的动作清楚说明。回答中突出结果、证据与剩余事项，不把计划当成完成。', skillIds: ['skill-research', 'skill-writing', 'skill-file'] },
  { id: 'expert-office', name: '办公文档专家', description: '将零散资料转为 Word、Excel 与 PPT 成果。', category: '办公', instructions: '关注信息准确、结构清楚与文件可编辑性。先选最合适的交付格式，再调用真实文件工具生成。报告文件路径和验证结果。无法读取或创建的格式必须明确说明。', skillIds: ['skill-docx', 'skill-sheet', 'skill-presentation'] },
  { id: 'expert-engineer', name: '软件工程师', description: '阅读工程、实现功能、定位故障并验证。', category: '开发', instructions: '以可运行和可维护为目标，遵守项目内说明，基于真实代码做修改。将修改、运行检查和外部发布分别处理，所有命令走宿主审批。避免无关的大规模重写。', skillIds: ['skill-code', 'skill-debug', 'skill-audit'] },
  { id: 'expert-analyst', name: '数据分析师', description: '从表格和本地数据中形成可验证的结论。', category: '数据', instructions: '先明确业务问题和数据口径，检查质量后再计算。解释分母、样本、时间范围与不确定性。报告中保留可复核的计算依据，不夸大因果。', skillIds: ['skill-data', 'skill-sheet', 'skill-audit'] },
  { id: 'expert-designer', name: '界面设计师', description: '围绕使用场景制作网页、设计规格和演示。', category: '设计', instructions: '将用户任务、阅读顺序和交互反馈放在设计核心。提出明确的视觉方向并完成实际文件，避免只给概念描述。对外部图像、视频与 3D 生成能力如实说明接入要求。', skillIds: ['skill-design', 'skill-presentation'] },
  { id: 'expert-researcher', name: '研究员', description: '核对资料来源，形成清晰的研究与决策建议。', category: '研究', instructions: '从关键问题出发收集可用证据。重要结论区分直接观察、推断及未知，保持来源可追溯。遇到冲突证据要并列呈现，避免用编造引用填补缺口。', skillIds: ['skill-research', 'skill-audit', 'skill-writing'] }
];

export const capabilities = [
  { id: 'tasks', name: '任务与工作空间', status: 'ready', description: '本地任务、会话历史、办公/开发/设计场景、归档与文件产物。' },
  { id: 'agent', name: '真实模型 Agent', status: 'ready', description: '读取现有本机模型配置；支持流式对话、文件工具与经批准的命令执行。模型连通性请在设置中测试。' },
  { id: 'office', name: 'Office 文件生成', status: 'ready', description: '创建 DOCX、XLSX、PPTX；支持 DOCX 内容及 XLSX 首表预览。复杂版式、现有 Office 原位编辑不包含在本地基础能力内。' },
  { id: 'market', name: '技能与专家', status: 'ready', description: '独立编写的内置工作流，可创建、修改、启停自定义技能并组合专家。' },
  { id: 'mcp', name: 'MCP 连接器', status: 'needs_configuration', description: '支持 Streamable HTTP 与本地 stdio；先添加并连接可用服务，工具执行需批准。此版本不含 OAuth 登录。' },
  { id: 'library', name: '本地资料库', status: 'ready', description: '上传工作空间文件、预览和下载，搜索任务及资料元数据。未包含全文向量检索。' },
  { id: 'automations', name: '本地自动化', status: 'ready', description: '按分钟间隔执行只读任务，保存运行结果；运行依赖应用进程保持开启。' },
  { id: 'memory', name: '记忆与个性化', status: 'ready', description: '管理本地记忆、自定义指令、模型和外观；记忆会作为任务上下文发送给选定模型服务。' },
  { id: 'design', name: '网页与设计交付', status: 'ready', description: 'Agent 可编写 HTML、SVG、代码和设计方案，在隔离预览中查看产物。' },
  { id: 'media', name: '图片、视频与 3D 生成', status: 'external', description: '需要你配置并连接有相应生成工具的 MCP 服务；现有文字模型 API 不自动提供媒体生成。' },
  { id: 'browser', name: '浏览器与电脑操作', status: 'external', description: '需要单独连接浏览器或电脑操作 MCP 和配置系统权限；未内置远程控制。' },
  { id: 'team', name: '团队、远程助理与设备同步', status: 'external', description: '腾讯的账号、团队 IM、微信等远程渠道、端云同步和远程桌面服务未接入。' },
  { id: 'cloud', name: '云应用发布', status: 'external', description: '可编写应用文件；公网部署、云数据库和在线协作需自行接入服务。' },
  { id: 'payment', name: '订阅、支付与社区', status: 'external', description: '未接入腾讯支付、账号权益、官方市场和作品社区。' }
];

export function createSeed({ workspacePath }) {
  return {
    tasks: [],
    workspaces: [{ id: 'default', name: '我的工作空间', path: workspacePath, createdAt: new Date().toISOString() }],
    skills: structuredClone(builtinSkills),
    experts: structuredClone(builtinExperts),
    connectors: [],
    schedules: [],
    library: [],
    settings: { theme: 'light', memory: '', customInstructions: '', model: '', maxSteps: 20 },
    activities: [],
    capabilities: structuredClone(capabilities)
  };
}
