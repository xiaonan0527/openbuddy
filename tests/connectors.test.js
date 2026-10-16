import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { createConnectors } from '../server/connectors.js';

test('MCP uses real HTTP discovery and tool execution, then removes disconnected tools', async t => {
  const app = express(); app.use(express.json());
  app.post('/mcp', async (req, res) => {
    const server = new McpServer({ name: 'test-server', version: '1.0.0' });
    server.registerTool('ping', { description: 'Return a real test result', inputSchema: {} }, async () => ({ content: [{ type: 'text', text: 'openbuddy-pong' }] }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    await server.connect(transport); await transport.handleRequest(req, res, req.body);
    res.on('close', () => { transport.close(); server.close(); });
  });
  const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const connector = { id: 'test-mcp', name: '本地测试', type: 'http', url: `http://127.0.0.1:${server.address().port}/mcp` };
  const manager = createConnectors({ store: { state: { connectors: [connector] }, save() {}, log() {} }, notify() {} });
  t.after(async () => { await manager.close(); await new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }); });
  await manager.connect(connector.id);
  assert.equal(connector.status, 'connected'); assert.equal(connector.toolCount, 1);
  const [tool] = manager.getTools(); assert.ok(tool.name.startsWith('mcp_'));
  const result = await manager.call(tool.name, {}, new AbortController().signal); assert.match(result, /openbuddy-pong/);
  await manager.disconnect(connector.id); assert.equal(manager.getTools().length, 0); assert.equal(connector.status, 'disconnected');
});
