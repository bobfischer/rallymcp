import { rallyGet } from './rally-client.js';

const PREFIX_MAP: Record<string, string> = {
  US: 'hierarchicalrequirement',
  TA: 'task',
  F: 'portfolioitem/feature',
  I: 'portfolioitem/initiative',
  DE: 'defect',
};

export function parseFormattedId(formattedId: string): { prefix: string; type: string } {
  const match = formattedId.match(/^([A-Z]+)\d+$/);
  if (!match) throw new Error(`Invalid formatted ID: ${formattedId}`);

  const prefix = match[1];
  const type = PREFIX_MAP[prefix];
  if (!type) throw new Error(`Unknown artifact prefix: ${prefix}`);

  return { prefix, type };
}

export async function resolveArtifact(formattedId: string): Promise<{
  type: string;
  objectId: number;
  ref: string;
  formattedId: string;
} | null> {
  const { type } = parseFormattedId(formattedId);

  const result = await rallyGet(`/${type}`, {
    query: `(FormattedID = "${formattedId}")`,
    fetch: 'ObjectID,FormattedID,_ref',
  });

  const results = result.QueryResult.Results;
  if (results.length === 0) return null;

  const artifact = results[0];
  return {
    type,
    objectId: artifact.ObjectID,
    ref: artifact._ref,
    formattedId: artifact.FormattedID,
  };
}
