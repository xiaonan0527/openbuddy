import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

export function createConnectors({ store, notify }) {
  const sessions = new Map();
  const tools = new Map();
  async function disconnect(id) {
    const session = sessions.get(id); sessions.delete(id);
    for (const [name, tool] of tools) if (tool.connectorId === id) tools.delete(name);
    await session?.close().catch(() => {});
    const connector = store.state.connectors.find(c => c.id === id);
    if (connector) { connector.status = 'disconnected'; connector.toolCount = 0; connector.tools = []; store.save(); notify({ type: 'connectors' }); }
  }
  async function connect(id) {
    const connector = store.state.connectors.find(c => c.id === id);
    if (!connector) throw new Error('连接器不存在');
    await disconnect(id);
    connector.status = 'connecting'; connector.error = ''; store.save(); notify({ type: 'connectors' });
    const client = new Client({ name: 'openbuddy-local', version: '1.0.0' });
    let transport;
    try {
      if (connector.type === 'http') {
        const url = new URL(connector.url);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('请使用不含凭据的 HTTP(S) MCP 地址');
        transport = new StreamableHTTPClientTransport(url);
      } else {
        if (!connector.command || !Array.isArray(connector.args)) throw new Error('请填写命令及参数');
        // A connector process receives a minimal environment, never the API key environment.
        transport = new StdioClientTransport({ command: connector.command, args: connector.args, env: { PATH: process.env.PATH || '/usr/bin:/bin', HOME: store.directory, LANG: 'en_US.UTF-8', TMPDIR: process.env.TMPDIR || '/tmp' }, cwd: store.directory, stderr: 'ignore' });
      }
      await client.connect(transport, { timeout: 20000 });
      const collected = []; let cursor;
      for (let page = 0; page < 10; page++) {
        const list = await client.listTools(cursor ? { cursor } : {}); collected.push(...list.tools); cursor = list.nextCursor;
        if (!cursor) break;
      }
      sessions.set(id, client);
      connector.tools = collected.map(tool => ({ name: tool.name, description: tool.description || '' }));
      connector.toolCount = collected.length; connector.status = 'connected';
      collected.forEach((tool, i) => {
        const name = `mcp_${id.replaceAll('-', '').slice(0, 10)}_${i}`;
        tools.set(name, { connectorId: id, originalName: tool.name, definition: { type: 'function', name, description: `[${connector.name}] ${tool.description || tool.name}`.slice(0, 3000), parameters: tool.inputSchema || { type: 'object', properties: {} }, strict: false } });
      });
      store.log('connector', `已连接 ${connector.name}（${collected.length} 个工具）`); notify({ type: 'connectors' });
      return connector;
    } catch (error) {
      await client.close().catch(() => {}); await transport?.close().catch(() => {});
      connector.status = 'error'; connector.error = error.message?.includes('401') ? '此服务需要授权，请在服务方完成认证。当前仅支持无凭据 MCP 或本地 stdio。' : '连接失败，请检查地址、命令、服务状态和协议。';
      store.save(); notify({ type: 'connectors' }); throw new Error(connector.error);
    }
  }
  return {
    connect, disconnect,
    getTools: () => [...tools.values()].map(t => t.definition),
    async call(name, args, signal) {
      const tool = tools.get(name), client = tool && sessions.get(tool.connectorId);
      if (!client) throw new Error('MCP 连接已断开');
      const result = await client.callTool({ name: tool.originalName, arguments: args }, undefined, { signal, timeout: 60000 });
      return JSON.stringify(result).slice(0, 50000);
    },
    async close() { await Promise.allSettled([...sessions.keys()].map(disconnect)); }
  };
}
