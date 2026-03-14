import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { rallyGet, RALLY_BASE_URL } from '../rally-client.js';

export const getAttachmentSchema = {
  formattedId: z.string().describe('Artifact to read attachments from, e.g. F6'),
  filename: z.string().optional().describe('Specific filename to retrieve. If omitted, lists all attachments.'),
};

export async function handleGetAttachment(input: { formattedId: string; filename?: string }) {
  try {
    const query = input.filename
      ? `((Artifact.FormattedID = "${input.formattedId}") AND (Name = "${input.filename}"))`
      : `(Artifact.FormattedID = "${input.formattedId}")`;

    const result = await rallyGet('/attachment', { query, fetch: 'Name,ContentType,Size,ObjectID,Content,_ref' });
    const attachments = result.QueryResult.Results;

    if (!input.filename) {
      const list = attachments.map((a: any) => ({ filename: a.Name, contentType: a.ContentType, size: a.Size, ref: a._ref }));
      return { content: [{ type: 'text' as const, text: JSON.stringify(list, null, 2) }] };
    }

    if (attachments.length === 0) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `Attachment not found: ${input.filename} on ${input.formattedId}` }) }] };
    }

    const attachment = attachments[0];
    const contentRef = attachment.Content._ref;
    const contentResult = await rallyGet(contentRef.replace(RALLY_BASE_URL, ''), {});
    const base64 = contentResult.AttachmentContent.Content;
    const decoded = Buffer.from(base64, 'base64').toString('utf-8');

    return { content: [{ type: 'text' as const, text: JSON.stringify({ filename: attachment.Name, contentType: attachment.ContentType, content: decoded }) }] };
  } catch (err: any) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: err.message }) }] };
  }
}

export function registerGetAttachment(server: McpServer) {
  server.tool('getAttachment', 'Retrieve attachments from a Rally artifact', getAttachmentSchema, handleGetAttachment);
}
