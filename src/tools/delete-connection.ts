import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { rallyGet, rallyPost } from '../rally-client.js';
import { resolveArtifact } from '../resolve-artifact.js';

export const deleteDependencySchema = {
  sourceFormattedId: z.string().describe('FormattedID of the story that has the dependency (e.g., US135)'),
  targetFormattedId: z.string().describe('FormattedID of the predecessor story to remove (e.g., US137)'),
  confirm: z.boolean().describe('Must be true to execute deletion'),
};

export async function handleDeleteDependency(input: {
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

    if (source.type !== 'hierarchicalrequirement') {
      return json({ success: false, error: `Source must be a User Story, got: ${input.sourceFormattedId}` });
    }
    if (target.type !== 'hierarchicalrequirement') {
      return json({ success: false, error: `Target must be a User Story, got: ${input.targetFormattedId}` });
    }

    // Remove target from source's Predecessors collection
    const result = await rallyPost(
      `/hierarchicalrequirement/${source.objectId}/Predecessors/remove`,
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
      deleted: true,
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

export function registerDeleteDependency(server: McpServer) {
  server.tool(
    'deleteDependency',
    'Remove a dependency between two User Stories. Removes the target from the source\'s Predecessors collection. Rally automatically removes the inverse successor link.',
    deleteDependencySchema,
    handleDeleteDependency,
  );
}
