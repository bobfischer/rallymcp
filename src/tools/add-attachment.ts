import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { rallyPost } from '../rally-client.js';
import { resolveArtifact } from '../resolve-artifact.js';

export const addAttachmentSchema = {
  formattedId: z.string().describe('Artifact to attach to, e.g. F6, US3'),
  filename: z.string().describe('Filename for the attachment'),
  content: z.string().describe('File content as UTF-8 string'),
  contentType: z.string().describe('MIME type, e.g. text/markdown, application/pdf'),
};

export async function handleAddAttachment(input: { formattedId: string; filename: string; content: string; contentType: string; }) {
  try {
    const artifact = await resolveArtifact(input.formattedId);
    if (!artifact) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `Artifact not found: ${input.formattedId}` }) }] };
    }

    const base64Content = Buffer.from(input.content, 'utf-8').toString('base64');
    const contentResult = await rallyPost('/attachmentcontent/create', { AttachmentContent: { Content: base64Content } });
    const contentRef = contentResult.CreateResult.Object._ref;

    const attachmentResult = await rallyPost('/attachment/create', {
      Attachment: { Artifact: artifact.ref, Content: contentRef, Name: input.filename, ContentType: input.contentType, Size: Buffer.byteLength(input.content, 'utf-8') },
    });

    const attachmentObj = attachmentResult.CreateResult.Object;
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, attachmentId: attachmentObj.ObjectID, filename: input.filename }) }] };
  } catch (err: any) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: err.message }) }] };
  }
}

export function registerAddAttachment(server: McpServer) {
  server.tool('addAttachment', 'Attach a file to any Rally artifact', addAttachmentSchema, handleAddAttachment);
}
