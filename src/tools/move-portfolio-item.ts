import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { rallyGet, rallyPut } from '../rally-client.js';
import { resolveArtifact } from '../resolve-artifact.js';

const VALID_STATES = ['No Entry', 'Intake', 'Discovering', 'In Progress', 'Measuring', 'Done'] as const;

export const movePortfolioItemSchema = {
  formattedId: z.string().describe('Portfolio item formatted ID, e.g. F6, I1'),
  state: z.enum(VALID_STATES).describe('Target flow state'),
};

export async function handleMovePortfolioItem({ formattedId, state }: { formattedId: string; state: string }) {
  try {
    const artifact = await resolveArtifact(formattedId);
    if (!artifact) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `Artifact not found: ${formattedId}` }) }] };
    }

    const stateResult = await rallyGet('/flowstate', { query: `(Name = "${state}")`, fetch: '_ref' });
    if (stateResult.QueryResult.Results.length === 0) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `Flow state not found: ${state}` }) }] };
    }

    const stateRef = stateResult.QueryResult.Results[0]._ref;
    const typeKey = artifact.type.includes('feature') ? 'Feature' : 'Initiative';

    await rallyPut(`/${artifact.type}/${artifact.objectId}`, { [typeKey]: { FlowState: stateRef } });

    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, formattedId, newState: state }) }] };
  } catch (err: any) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: err.message }) }] };
  }
}

export function registerMovePortfolioItem(server: McpServer) {
  server.tool('movePortfolioItem', 'Move a Feature or Initiative to a named flow state', movePortfolioItemSchema, handleMovePortfolioItem);
}
