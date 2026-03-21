import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { rallyGet, rallyPost } from '../rally-client.js';
import { resolveArtifact } from '../resolve-artifact.js';

export const createDependencySchema = {
  sourceFormattedId: z.string().describe('FormattedID of the story that depends on another (e.g., US135). Must be a User Story.'),
  targetFormattedId: z.string().describe('FormattedID of the story being depended on (e.g., US137). Must be a User Story.'),
};

export async function handleCreateDependency(input: {
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

    if (source.type !== 'hierarchicalrequirement') {
      return json({ success: false, error: `Source must be a User Story, got: ${input.sourceFormattedId}` });
    }
    if (target.type !== 'hierarchicalrequirement') {
      return json({ success: false, error: `Target must be a User Story, got: ${input.targetFormattedId}` });
    }

    // Add target to source's Predecessors collection
    const result = await rallyPost(
      `/hierarchicalrequirement/${source.objectId}/Predecessors/add`,
      { CollectionInput: [{ _ref: target.ref }] },
    );

    const opResult = result.OperationResult;
    if (opResult?.Errors?.length > 0) {
      return json({ success: false, error: opResult.Errors.join('; ') });
    }

    // Fetch names for response
    const [sourceDetail, targetDetail] = await Promise.all([
      rallyGet(`/hierarchicalrequirement/${source.objectId}`, { fetch: 'Name' }),
      rallyGet(`/hierarchicalrequirement/${target.objectId}`, { fetch: 'Name' }),
    ]);

    const sourceName = sourceDetail.HierarchicalRequirement?.Name ?? source.formattedId;
    const targetName = targetDetail.HierarchicalRequirement?.Name ?? target.formattedId;

    return json({
      success: true,
      source: { formattedId: source.formattedId, name: sourceName },
      predecessor: { formattedId: target.formattedId, name: targetName },
    });
  } catch (err: any) {
    return json({ success: false, error: err.message });
  }
}

function json(data: Record<string, any>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

export function registerCreateDependency(server: McpServer) {
  server.tool(
    'createDependency',
    'Create a dependency between two User Stories. The source story depends on the target (predecessor). Rally automatically creates the inverse successor link. Story-to-story only.',
    createDependencySchema,
    handleCreateDependency,
  );
}
