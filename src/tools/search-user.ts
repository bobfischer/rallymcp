import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { rallyGet } from '../rally-client.js';

export const searchUserSchema = {
  query: z.string().describe('Name, display name, or email fragment to search for'),
};

export async function handleSearchUser({ query }: { query: string }) {
  const result = await rallyGet('/user', {
    query: `((EmailAddress contains "${query}") OR (DisplayName contains "${query}"))`,
    fetch: 'ObjectID,UserName,DisplayName,EmailAddress,_ref',
  });

  const users = result.QueryResult.Results.map((u: any) => ({
    displayName: u.DisplayName,
    email: u.EmailAddress,
    ref: u._ref,
  }));

  return {
    content: [{ type: 'text' as const, text: JSON.stringify(users, null, 2) }],
  };
}

export function registerSearchUser(server: McpServer) {
  server.tool('searchUser', 'Look up a Rally user by name or email fragment', searchUserSchema, handleSearchUser);
}
