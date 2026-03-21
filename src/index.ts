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
import { registerBatchCreate } from './tools/batch-create.js';
import { registerCreateDependency } from './tools/create-connection.js';
import { registerDeleteDependency } from './tools/delete-connection.js';

const TOOL_REGISTRATIONS = [
  registerSearchUser,
  registerMovePortfolioItem,
  registerCreatePortfolioItem,
  registerDeleteArtifact,
  registerAddAttachment,
  registerGetAttachment,
  registerDeleteAttachment,
  registerBatchCreate,
  registerCreateDependency,
  registerDeleteDependency,
] as const;

function createServer(): McpServer {
  const server = new McpServer({
    name: 'eliassen-rally',
    version: '1.0.0',
  });

  for (const register of TOOL_REGISTRATIONS) {
    register(server);
  }

  return server;
}

const app = express();
app.use(express.json());

// Optional bearer token auth — enforced only when MCP_AUTH_TOKEN is set
const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;
if (AUTH_TOKEN) {
  app.use('/mcp', (req, res, next) => {
    const header = req.headers.authorization;
    if (header !== `Bearer ${AUTH_TOKEN}`) {
      res.status(401).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Unauthorized' },
        id: null,
      });
      return;
    }
    next();
  });
}

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
const HOST = process.env.HOST || '127.0.0.1';
app.listen(Number(PORT), HOST, () => {
  console.log(`Eliassen Rally MCP server listening on ${HOST}:${PORT}`);
  if (AUTH_TOKEN) console.log('Bearer token auth enabled');
  const toolNames = TOOL_REGISTRATIONS.map((fn) =>
    fn.name.replace(/^register/, '').replace(/^./, (c) => c.toLowerCase()),
  );
  console.log(`Tools (${toolNames.length}): ${toolNames.join(', ')}`);
});
