import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { rallyPost, PROJECT_REF, RALLY_BASE_URL } from '../rally-client.js';

export const createPortfolioItemSchema = {
  type: z.enum(['feature', 'initiative']).describe('Type of portfolio item to create'),
  name: z.string().describe('Name of the portfolio item'),
  description: z.string().optional().describe('Description (HTML supported)'),
  parentRef: z.string().optional().describe('Rally ref of parent Initiative (for features)'),
  ownerRef: z.string().optional().describe('Rally ref of the owner user'),
};

export async function handleCreatePortfolioItem(input: {
  type: string; name: string; description?: string; parentRef?: string; ownerRef?: string;
}) {
  try {
    const typeKey = input.type === 'feature' ? 'Feature' : 'Initiative';
    const body: Record<string, any> = {
      Name: input.name,
      Project: `${RALLY_BASE_URL}/project/${PROJECT_REF}`,
    };
    if (input.description) body.Description = input.description;
    if (input.parentRef) body.Parent = input.parentRef;
    if (input.ownerRef) body.Owner = input.ownerRef;

    const result = await rallyPost(`/portfolioitem/${input.type}`, { [typeKey]: body });
    const obj = result.CreateResult.Object;
    return { content: [{ type: 'text' as const, text: JSON.stringify({ formattedId: obj.FormattedID, objectId: obj.ObjectID, ref: obj._ref }) }] };
  } catch (err: any) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: err.message }) }] };
  }
}

export function registerCreatePortfolioItem(server: McpServer) {
  server.tool('createPortfolioItem', 'Create a Feature or Initiative portfolio item', createPortfolioItemSchema, handleCreatePortfolioItem);
}
