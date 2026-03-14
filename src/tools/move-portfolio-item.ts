import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { rallyGet, rallyPut, WORKSPACE_REF, RALLY_BASE_URL } from '../rally-client.js';
import { resolveArtifact } from '../resolve-artifact.js';

export const movePortfolioItemSchema = {
  formattedId: z.string().describe('Portfolio item formatted ID, e.g. F6, I1'),
  state: z.string().describe('Target state name (e.g. No Entry, Intake, Discovering, In Progress, Measuring, Done)'),
};

export async function handleMovePortfolioItem({ formattedId, state }: { formattedId: string; state: string }) {
  try {
    const artifact = await resolveArtifact(formattedId);
    if (!artifact) {
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `Artifact not found: ${formattedId}` }) }] };
    }

    const typeDefName = artifact.type.includes('feature') ? 'Feature' : 'Initiative';

    // Fetch all states in workspace — no query filter, matches the working browser call:
    // /state?workspace=/workspace/843310407671&fetch=ObjectID,Name,_ref
    const stateResult = await rallyGet('/state', {
      workspace: `/workspace/${WORKSPACE_REF}`,
      fetch: 'ObjectID,Name,_ref',
      pagesize: '200',
    });

    const allStates: Array<{ Name: string; _ref: string }> = stateResult.QueryResult.Results;
    const match = allStates.find((s) => s.Name === state);

    if (!match) {
      const names = allStates.map((s) => s.Name);
      return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: `State not found: ${state}`, availableStates: names }) }] };
    }

    // Portfolio items use the "State" field
    await rallyPut(`/${artifact.type}/${artifact.objectId}`, { [typeDefName]: { State: match._ref } });

    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: true, formattedId, newState: state }) }] };
  } catch (err: any) {
    return { content: [{ type: 'text' as const, text: JSON.stringify({ success: false, error: err.message }) }] };
  }
}

export function registerMovePortfolioItem(server: McpServer) {
  server.tool('movePortfolioItem', 'Move a Feature or Initiative to a named flow state', movePortfolioItemSchema, handleMovePortfolioItem);
}
