import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { rallyGet, rallyPost } from '../rally-client.js';
import { resolveArtifact } from '../resolve-artifact.js';

export const createConnectionSchema = {
  sourceFormattedId: z.string().describe('FormattedID of the first artifact (e.g., US135, TA420, F6)'),
  targetFormattedId: z.string().describe('FormattedID of the second artifact (e.g., US134, F7)'),
};

export async function handleCreateConnection(input: {
  sourceFormattedId: string;
  targetFormattedId: string;
}) {
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

    // Fetch names for response
    const [sourceDetail, targetDetail] = await Promise.all([
      rallyGet(`/${source.type}/${source.objectId}`, { fetch: 'Name' }),
      rallyGet(`/${target.type}/${target.objectId}`, { fetch: 'Name' }),
    ]);

    const sourceName = sourceDetail[Object.keys(sourceDetail)[0]]?.Name ?? source.formattedId;
    const targetName = targetDetail[Object.keys(targetDetail)[0]]?.Name ?? target.formattedId;

    const result = await rallyPost('/connection/create?fetch=_ref,Artifact,ConnectedTo', {
      Connection: {
        Artifact: source.ref,
        ConnectedTo: target.ref,
      },
    });

    const cr = result.CreateResult;
    if (cr?.Errors?.length > 0) {
      return json({ success: false, error: cr.Errors.join('; ') });
    }

    const obj = cr?.Object;
    if (!obj) {
      return json({ success: false, error: 'Unexpected response', response: result });
    }

    return json({
      source: { formattedId: source.formattedId, name: sourceName },
      target: { formattedId: target.formattedId, name: targetName },
      connectionRef: obj._ref,
    });
  } catch (err: any) {
    return json({ success: false, error: err.message });
  }
}

function json(data: Record<string, any>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

export function registerCreateConnection(server: McpServer) {
  server.tool(
    'createConnection',
    'Create a bidirectional connection between two Rally artifacts. Works across any artifact types — story to story, task to story, feature to story, etc.',
    createConnectionSchema,
    handleCreateConnection,
  );
}
