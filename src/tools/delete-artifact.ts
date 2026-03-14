import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { rallyDelete } from '../rally-client.js';
import { resolveArtifact } from '../resolve-artifact.js';

export const deleteArtifactSchema = {
  formattedId: z.string().describe('Formatted ID of artifact to delete, e.g. US6, TA11'),
  confirm: z.boolean().describe('Must be true to execute deletion'),
};

export async function handleDeleteArtifact({ formattedId, confirm }: { formattedId: string; confirm: boolean }) {
  if (!confirm) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: 'confirm must be true to delete' }) }] };
  }
  try {
    const artifact = await resolveArtifact(formattedId);
    if (!artifact) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `Artifact not found: ${formattedId}` }) }] };
    }
    await rallyDelete(`/${artifact.type}/${artifact.objectId}`);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, formattedId, deleted: true }) }] };
  } catch (err: any) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: err.message }) }] };
  }
}

export function registerDeleteArtifact(server: McpServer) {
  server.tool('deleteArtifact', 'Delete a User Story or Task by formatted ID', deleteArtifactSchema, handleDeleteArtifact);
}
