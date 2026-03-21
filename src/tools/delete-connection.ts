import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { rallyGet, rallyDelete } from '../rally-client.js';
import { resolveArtifact } from '../resolve-artifact.js';

export const deleteConnectionSchema = {
  sourceFormattedId: z.string().describe('FormattedID of one artifact in the connection'),
  targetFormattedId: z.string().describe('FormattedID of the other artifact in the connection'),
  confirm: z.boolean().describe('Must be true to execute deletion'),
};

export async function handleDeleteConnection(input: {
  sourceFormattedId: string;
  targetFormattedId: string;
  confirm: boolean;
}) {
  if (!input.confirm) {
    return json({ success: false, error: 'confirm must be true to delete' });
  }

  try {
    const [source, target] = await Promise.all([
      resolveArtifact(input.sourceFormattedId),
      resolveArtifact(input.targetFormattedId),
    ]);

    if (!source) {
      return json({ success: false, error: `Artifact not found: ${input.sourceFormattedId}` });
    }
    if (!target) {
      return json({ success: false, error: `Artifact not found: ${input.targetFormattedId}` });
    }

    // Find the connection by querying the source artifact's connections
    const connResult = await rallyGet(`/${source.type}/${source.objectId}/connections`, {
      fetch: '_ref,ConnectedTo',
    });

    const connections = connResult.QueryResult?.Results ?? [];
    const match = connections.find((c: any) => {
      const connectedRef = c.ConnectedTo?._ref;
      return connectedRef && connectedRef.includes(`/${target.objectId}`);
    });

    if (!match) {
      return json({ success: false, error: `No connection found between ${input.sourceFormattedId} and ${input.targetFormattedId}` });
    }

    // Extract the connection ObjectID from _ref to build the delete path
    const connRef: string = match._ref;
    const connOidMatch = connRef.match(/\/connection\/(\d+)$/);
    if (!connOidMatch) {
      return json({ success: false, error: `Could not parse connection ref: ${connRef}` });
    }

    await rallyDelete(`/connection/${connOidMatch[1]}`);

    // Fetch names for response
    const [sourceDetail, targetDetail] = await Promise.all([
      rallyGet(`/${source.type}/${source.objectId}`, { fetch: 'Name' }),
      rallyGet(`/${target.type}/${target.objectId}`, { fetch: 'Name' }),
    ]);

    const sourceName = sourceDetail[Object.keys(sourceDetail)[0]]?.Name ?? source.formattedId;
    const targetName = targetDetail[Object.keys(targetDetail)[0]]?.Name ?? target.formattedId;

    return json({
      deleted: true,
      source: { formattedId: source.formattedId, name: sourceName },
      target: { formattedId: target.formattedId, name: targetName },
    });
  } catch (err: any) {
    return json({ success: false, error: err.message });
  }
}

function json(data: Record<string, any>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

export function registerDeleteConnection(server: McpServer) {
  server.tool(
    'deleteConnection',
    'Remove a connection between two Rally artifacts. Finds and deletes the connection linking the two specified artifacts.',
    deleteConnectionSchema,
    handleDeleteConnection,
  );
}
