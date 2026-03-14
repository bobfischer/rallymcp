import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { rallyDelete } from '../rally-client.js';

export const deleteAttachmentSchema = {
  attachmentId: z.string().describe('Rally attachment object ID to delete'),
};

export async function handleDeleteAttachment({ attachmentId }: { attachmentId: string }) {
  try {
    await rallyDelete(`/attachment/${attachmentId}`);
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, deleted: true }) }] };
  } catch (err: any) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: err.message }) }] };
  }
}

export function registerDeleteAttachment(server: McpServer) {
  server.tool('deleteAttachment', 'Remove an attachment from a Rally artifact', deleteAttachmentSchema, handleDeleteAttachment);
}
