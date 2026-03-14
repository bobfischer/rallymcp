import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { registerSearchUser } from './tools/search-user.js';
import { registerMovePortfolioItem } from './tools/move-portfolio-item.js';
import { registerCreatePortfolioItem } from './tools/create-portfolio-item.js';
import { registerDeleteArtifact } from './tools/delete-artifact.js';
import { registerAddAttachment } from './tools/add-attachment.js';
import { registerGetAttachment } from './tools/get-attachment.js';
import { registerDeleteAttachment } from './tools/delete-attachment.js';

function createServer(): McpServer {
  const server = new McpServer({
    name: 'eliassen-rally',
    version: '1.0.0',
  });

  registerSearchUser(server);
  registerMovePortfolioItem(server);
  registerCreatePortfolioItem(server);
  registerDeleteArtifact(server);
  registerAddAttachment(server);
  registerGetAttachment(server);
  registerDeleteAttachment(server);

  return server;
}

const app = express();
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', server: 'eliassen-rally-mcp' });
});

// MCP endpoint — new server + transport per request (stateless mode)
app.post('/mcp', async (req, res) => {
  try {
    const server = createServer();
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
    res.on('close', () => {
      transport.close();
      server.close();
    });
  } catch (error) {
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
});

// Reject GET/DELETE on /mcp (stateless — no SSE streams or session cleanup)
app.get('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed. Use POST.' },
    id: null,
  });
});

app.delete('/mcp', (_req, res) => {
  res.status(405).json({
    jsonrpc: '2.0',
    error: { code: -32000, message: 'Method not allowed.' },
    id: null,
  });
});

const PORT = process.env.PORT || 3000;
app.listen(Number(PORT), '127.0.0.1', () => {
  console.log(`Eliassen Rally MCP server listening on 127.0.0.1:${PORT}`);
});
