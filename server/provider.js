import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PROVIDER_PRESETS = [
  { id: 'zhipu', name: '智谱开放平台', baseUrl: 'https://open.bigmodel.cn/api/paas/v4', docsUrl: 'https://open.bigmodel.cn/dev/api', models: ['glm-5.3', 'glm-5.3-flash', 'glm-5.2'], protocol: 'chat_completions' },
  { id: 'kimi-cn', name: 'Kimi 中国版', baseUrl: 'https://api.moonshot.cn/v1', docsUrl: 'https://platform.moonshot.cn/docs/api/chat', models: ['kimi-k3', 'kimi-k2.6', 'kimi-k2.5'], protocol: 'chat_completions' },
  { id: 'minimax-cn', name: 'MiniMax 中国版', baseUrl: 'https://api.minimax.cn/v1', docsUrl: 'https://platform.minimaxi.com/docs/api-reference/text-openai-api', models: ['MiniMax-M3', 'MiniMax-M2.7', 'MiniMax-M2.5'], protocol: 'chat_completions' },
  { id: 'deepseek', name: 'DeepSeek', baseUrl: 'https://api.deepseek.com', docsUrl: 'https://api-docs.deepseek.com/', models: ['deepseek-flash', 'deepseek-v4-pro'], protocol: 'chat_completions' },
  { id: 'custom', name: '自定义 OpenAI 兼容服务', baseUrl: '', docsUrl: '', protocol: 'chat_completions' }
];

// Keep credentials in memory. Neither the state database nor the browser gets a key.
export function loadProvider(settings = {}, { env = process.env, home = os.homedir(), projectDirectory = project, providerConfig, providerId = providerConfig?.activeId } = {}) {
  const managed = providerConfig?.providers?.find(item => item.id === providerId);
  if (providerId && !managed) throw new Error('此任务使用的模型配置已删除，请重新添加配置并新建任务');
  if (managed) return { baseUrl: managed.baseUrl.replace(/\/+$/, ''), apiKey: managed.apiKey, model: managed.model, protocol: managed.protocol, source: `本机模型配置 · ${managed.name}`, providerId: managed.id, preset: managed.preset };
  const directory = env.CODEX_HOME || path.join(home, '.codex');
  const explicit = env.OPENBUDDY_CONFIG_PATH;
  const candidates = [
    { file: path.join(projectDirectory, 'config.local.toml'), source: '项目 config.local.toml' },
    { file: path.join(home, '.config', 'openbuddy', 'config.toml'), source: '~/.config/openbuddy/config.toml' }
  ];
  const local = candidates.find(candidate => fs.existsSync(candidate.file));
  const environment = !explicit && !local && ['OPENBUDDY_API_KEY', 'OPENAI_API_KEY', 'OPENBUDDY_BASE_URL', 'OPENAI_BASE_URL', 'OPENBUDDY_MODEL', 'OPENAI_MODEL'].some(key => env[key]);
  const configFile = explicit || local?.file || path.join(directory, 'config.toml');
  const codexFallback = !explicit && !local && !environment;
  let config = {};
  if (explicit && !fs.existsSync(configFile)) throw new Error('OPENBUDDY_CONFIG_PATH 指定的配置文件不存在');
  if (!environment && fs.existsSync(configFile)) {
    try { config = parse(fs.readFileSync(configFile, 'utf8')); }
    catch { throw new Error('无法读取本机模型配置，请检查 TOML 格式'); }
  }
  const selected = config.model_providers?.[config.model_provider] || {};
  const rawBaseUrl = selected.base_url || env.OPENBUDDY_BASE_URL || env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
  // Never use credentials from an unrelated Codex account for a custom endpoint.
  let auth = {};
  if (codexFallback && !selected.env_key && rawBaseUrl.replace(/\/+$/, '') === 'https://api.openai.com/v1' && fs.existsSync(path.join(directory, 'auth.json'))) {
    try { auth = JSON.parse(fs.readFileSync(path.join(directory, 'auth.json'), 'utf8')); } catch { /* A selected provider may not need this file. */ }
  }
  const apiKey = selected.experimental_bearer_token || (selected.env_key ? env[selected.env_key] : env.OPENBUDDY_API_KEY || env.OPENAI_API_KEY || auth.OPENAI_API_KEY);
  let url;
  try { url = new URL(rawBaseUrl); } catch { throw new Error('本机模型 API 地址格式无效'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new Error('API 地址必须是无内嵌凭据的 HTTP(S) 地址');
  if (!apiKey || /^(?:YOUR_API_KEY|REPLACE_ME)$/i.test(apiKey)) throw new Error('本机所选模型服务没有可用 API Key。请配置本地文件或环境变量。');
  const model = settings.model || config.model || env.OPENBUDDY_MODEL || env.OPENAI_MODEL || 'gpt-4.1';
  if (/^(?:YOUR_MODEL_ID|REPLACE_ME)$/i.test(model) || url.hostname === 'api.example.com') throw new Error('请将配置模板中的 API 地址、模型和密钥替换为自己的值');
  const protocol = selected.wire_api || 'responses';
  if (!['responses', 'chat_completions', 'chat'].includes(protocol)) throw new Error('协议仅支持 responses 或 chat_completions');
  const source = explicit ? 'OPENBUDDY_CONFIG_PATH（本地文件）' : local?.source || (environment ? '本机环境变量' : '~/.codex/config.toml（当前所选服务）');
  return { baseUrl: url.toString().replace(/\/+$/, ''), apiKey, model, protocol: protocol === 'chat' ? 'chat_completions' : protocol, source };
}

export function redactSecrets(value, secrets = []) {
  let result = String(value ?? '');
  for (const secret of secrets.filter(s => typeof s === 'string' && s.length > 3)) result = result.split(secret).join('[已隐藏凭据]');
  return result.replace(/\b(?:sk|Bearer)[-_ ][A-Za-z0-9_.-]{15,}/gi, '[已隐藏凭据]');
}

export function publicProvider(settings = {}, options) {
  try {
    const { baseUrl, model, protocol, source } = loadProvider(settings, options);
    return { baseUrl, model, protocol, source, configured: true };
  } catch (error) { return { configured: false, protocol: 'responses', source: '本机模型配置', error: error.message }; }
}

function responseText(output = []) {
  return output.filter(item => item.type === 'message').flatMap(item => item.content || []).filter(item => item.type === 'output_text' || item.type === 'refusal').map(item => item.text || item.refusal || '').join('');
}

export async function requestResponse({ input, tools = [], model, signal, instructions = '', onDelta, settings, provider: suppliedProvider }) {
  const provider = suppliedProvider || loadProvider({ ...settings, ...(model ? { model } : {}) });
  if (provider.protocol === 'chat_completions') return requestChatCompletion({ provider, input, tools, model: model || provider.model, signal, instructions, onDelta });
  const endpoint = provider.baseUrl.endsWith('/responses') ? provider.baseUrl : `${provider.baseUrl}/responses`;
  const body = { model: model || provider.model, input, instructions, stream: true, store: false, include: ['reasoning.encrypted_content'] };
  if (tools.length) { body.tools = tools; body.parallel_tool_calls = false; }
  let response;
  try {
    response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' }, redirect: 'error', body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000) });
  } catch (error) {
    if (signal?.aborted) throw signal.reason || new Error('任务已停止');
    throw new Error(redactSecrets(`模型连接失败：${error.name === 'TimeoutError' ? '请求超时' : error.message}`, [provider.apiKey]));
  }
  if (!response.ok) {
    const raw = (await response.text()).slice(0, 2000);
    let explanation;
    try { const parsed = JSON.parse(raw); explanation = parsed.error?.message || parsed.message; } catch { /* Non JSON gateway response */ }
    throw new Error(redactSecrets(`模型服务返回 HTTP ${response.status}：${explanation || '请检查地址、模型权限和服务状态'}`, [provider.apiKey]));
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const data = await response.json();
    if (data.error) throw new Error(redactSecrets(data.error.message || '模型返回错误', [provider.apiKey]));
    const text = responseText(data.output); onDelta?.(text);
    return { output: data.output || [], text, usage: data.usage };
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', final, streamed = '', failure;
  const output = new Map();
  function handle(block) {
    const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data || data === '[DONE]') return;
    let event; try { event = JSON.parse(data); } catch { return; }
    if (event.type === 'response.output_text.delta') { streamed += event.delta || ''; onDelta?.(event.delta || ''); }
    if (event.type === 'response.output_item.done' && event.item) output.set(event.output_index ?? output.size, event.item);
    if (event.type === 'response.completed') final = event.response;
    if (event.type === 'response.failed' || event.type === 'error') failure = event.response?.error?.message || event.message || '模型响应失败';
    if (event.type === 'response.incomplete') failure = `模型响应不完整：${event.response?.incomplete_details?.reason || '输出中断'}`;
  }
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) { handle(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); }
    }
    buffer += decoder.decode(); if (buffer.trim()) handle(buffer);
  } finally { reader.releaseLock(); }
  if (failure) throw new Error(redactSecrets(failure, [provider.apiKey]));
  const finalOutput = final?.output || [...output.entries()].sort(([a], [b]) => a - b).map(([, item]) => item);
  // An interrupted event stream must not be recorded as a successful task.
  if (!final) throw new Error('模型连接已中断，没有收到完整响应');
  return { output: finalOutput, text: responseText(finalOutput) || streamed, usage: final?.usage };
}

function endpoint(baseUrl, suffix) {
  return baseUrl.replace(/\/$/, '').replace(/\/(?:chat\/completions|responses)$/i, '') + suffix;
}
function chatMessages(input, instructions) {
  const messages = [];
  if (instructions) messages.push({ role: 'system', content: instructions });
  const items = input || [];
  for (let index = 0; index < items.length; index++) {
    const item = items[index];
    if (item.type === 'function_call_output') messages.push({ role: 'tool', tool_call_id: item.call_id, content: String(item.output ?? '') });
    else if (item.type === 'function_call') {
      const toolCalls = [];
      while (items[index]?.type === 'function_call') { const call = items[index++]; toolCalls.push({ id: call.call_id, type: 'function', function: { name: call.name, arguments: call.arguments || '{}' } }); }
      index--;
      messages.push({ role: 'assistant', content: null, tool_calls: toolCalls });
    }
    else if (item.type === 'message') {
      const content = (item.content || []).filter(part => part.type === 'input_text' || part.type === 'output_text' || part.type === 'text').map(part => part.text || '').join('');
      const message = { role: item.role || 'assistant', content };
      if (item.reasoning_content) message.reasoning_content = item.reasoning_content;
      if (item.tool_calls) message.tool_calls = item.tool_calls;
      if (items[index + 1]?.type === 'function_call') {
        message.tool_calls = [];
        while (items[index + 1]?.type === 'function_call') { const call = items[++index]; message.tool_calls.push({ id: call.call_id, type: 'function', function: { name: call.name, arguments: call.arguments || '{}' } }); }
        message.content ||= null;
      }
      messages.push(message);
    } else if (item.role && typeof item.content === 'string') messages.push({ role: item.role, content: item.content });
  }
  return messages;
}
function chatTools(tools) {
  return tools.map(item => ({ type: 'function', function: { name: item.name, description: item.description, parameters: item.parameters } }));
}
function normalizeChatMessage(message = {}) {
  const content = typeof message.content === 'string' ? message.content : '';
  return { type: 'message', role: 'assistant', content: content ? [{ type: 'output_text', text: content }] : [], ...(message.reasoning_content ? { reasoning_content: message.reasoning_content } : {}) };
}
async function requestChatCompletion({ provider, input, tools, model, signal, instructions, onDelta }) {
  const body = { model, messages: chatMessages(input, instructions), stream: true };
  if (provider.preset === 'minimax-cn') body.reasoning_split = true;
  if (tools.length) { body.tools = chatTools(tools); body.tool_choice = 'auto'; }
  let response;
  try {
    response = await fetch(endpoint(provider.baseUrl, '/chat/completions'), { method: 'POST', headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' }, redirect: 'error', body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000) });
  } catch (error) {
    if (signal?.aborted) throw signal.reason || new Error('任务已停止');
    throw new Error(redactSecrets(`模型连接失败：${error.name === 'TimeoutError' ? '请求超时' : error.message}`, [provider.apiKey]));
  }
  if (!response.ok) {
    const raw = (await response.text()).slice(0, 2000); let explanation;
    try { const parsed = JSON.parse(raw); explanation = parsed.error?.message || parsed.message; } catch { /* Non JSON gateway response. */ }
    throw new Error(redactSecrets(`模型服务返回 HTTP ${response.status}：${explanation || '请检查地址、模型权限和服务状态'}`, [provider.apiKey]));
  }
  if (!response.headers.get('content-type')?.includes('text/event-stream')) {
    const data = await response.json();
    if (data.error) throw new Error(redactSecrets(data.error.message || '模型返回错误', [provider.apiKey]));
    const choice = data.choices?.[0], message = choice?.message;
    if (!message || !['stop', 'tool_calls'].includes(choice.finish_reason || 'stop')) throw new Error(`模型响应不完整：${choice?.finish_reason || '没有消息'}`);
    if (!message.content && !message.tool_calls?.length) throw new Error('模型没有返回正文或工具调用');
    onDelta?.(message.content || '');
    return { output: [normalizeChatMessage(message), ...(message.tool_calls || []).map(call => ({ type: 'function_call', call_id: call.id, name: call.function?.name, arguments: call.function?.arguments || '{}' }))], text: message.content || '', usage: data.usage ? { input_tokens: data.usage.prompt_tokens || 0, output_tokens: data.usage.completion_tokens || 0 } : undefined };
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', streamed = '', reasoning = '', failure, finished = false, usage;
  const calls = new Map();
  function handle(block) {
    const data = block.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trimStart()).join('\n');
    if (!data) return;
    if (data === '[DONE]') return;
    let chunk; try { chunk = JSON.parse(data); } catch { return; }
    if (chunk.error) { failure = chunk.error.message || '模型响应失败'; return; }
    if (chunk.usage) usage = { input_tokens: chunk.usage.prompt_tokens || 0, output_tokens: chunk.usage.completion_tokens || 0 };
    const delta = chunk.choices?.[0]?.delta || {};
    if (delta.content) { streamed += delta.content; onDelta?.(delta.content); }
    if (delta.reasoning_content) reasoning += delta.reasoning_content;
    for (const part of delta.tool_calls || []) {
      const call = calls.get(part.index) || { id: '', name: '', arguments: '' };
      if (part.id) call.id = part.id;
      if (part.function?.name) call.name += part.function.name;
      if (part.function?.arguments) call.arguments += part.function.arguments;
      calls.set(part.index, call);
    }
    const reason = chunk.choices?.[0]?.finish_reason;
    if (reason) { finished = true; if (!['stop', 'tool_calls'].includes(reason)) failure = `模型响应不完整：${reason}`; }
  }
  try {
    while (true) {
      const { value, done } = await reader.read(); if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n'); let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) { handle(buffer.slice(0, boundary)); buffer = buffer.slice(boundary + 2); }
    }
    buffer += decoder.decode(); if (buffer.trim()) handle(buffer);
  } finally { reader.releaseLock(); }
  if (failure) throw new Error(redactSecrets(failure, [provider.apiKey]));
  if (!finished) throw new Error('模型连接已中断，没有收到完整响应');
  if ([...calls.values()].some(call => !call.id || !call.name)) throw new Error('模型工具调用不完整：缺少调用 ID 或名称');
  if (!streamed && !calls.size) throw new Error('模型没有返回正文或工具调用');
  const output = [normalizeChatMessage({ content: streamed, reasoning_content: reasoning }), ...[...calls.values()].filter(c => c.id && c.name).map(call => ({ type: 'function_call', call_id: call.id, name: call.name, arguments: call.arguments || '{}' }))];
  return { output, text: streamed, usage };
}

export function publicManagedProviders(config = {}) {
  return { activeId: config.activeId || null, providers: (config.providers || []).map(({ apiKey, ...item }) => ({ ...item, hasApiKey: Boolean(apiKey) })) };
}
