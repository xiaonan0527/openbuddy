import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'smol-toml';

const project = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// Keep credentials in memory. Neither the state database nor the browser gets a key.
export function loadProvider(settings = {}, { env = process.env, home = os.homedir(), projectDirectory = project } = {}) {
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
  if (protocol !== 'responses') throw new Error('当前实现需要 Responses 协议，请在本机选择支持 Responses 的模型服务');
  const source = explicit ? 'OPENBUDDY_CONFIG_PATH（本地文件）' : local?.source || (environment ? '本机环境变量' : '~/.codex/config.toml（当前所选服务）');
  return { baseUrl: url.toString().replace(/\/+$/, ''), apiKey, model, protocol, source };
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
  const endpoint = provider.baseUrl.endsWith('/responses') ? provider.baseUrl : `${provider.baseUrl}/responses`;
  const body = { model: model || provider.model, input, instructions, stream: true, store: false, include: ['reasoning.encrypted_content'] };
  if (tools.length) { body.tools = tools; body.parallel_tool_calls = false; }
  let response;
  try {
    response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${provider.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180000)]) : AbortSignal.timeout(180000) });
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
