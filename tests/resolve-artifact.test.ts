import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { resolveArtifact, parseFormattedId } = await import('../src/resolve-artifact.js');

describe('parseFormattedId', () => {
  it('parses US prefix', () => {
    expect(parseFormattedId('US123')).toEqual({ prefix: 'US', type: 'hierarchicalrequirement' });
  });

  it('parses TA prefix', () => {
    expect(parseFormattedId('TA45')).toEqual({ prefix: 'TA', type: 'task' });
  });

  it('parses F prefix', () => {
    expect(parseFormattedId('F6')).toEqual({ prefix: 'F', type: 'portfolioitem/feature' });
  });

  it('parses I prefix', () => {
    expect(parseFormattedId('I1')).toEqual({ prefix: 'I', type: 'portfolioitem/initiative' });
  });

  it('parses DE prefix', () => {
    expect(parseFormattedId('DE99')).toEqual({ prefix: 'DE', type: 'defect' });
  });

  it('throws on unknown prefix', () => {
    expect(() => parseFormattedId('ZZ5')).toThrow('Unknown artifact prefix: ZZ');
  });
});

describe('resolveArtifact', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('resolves a user story by formatted ID', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        QueryResult: {
          Results: [{
            ObjectID: 12345,
            _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/hierarchicalrequirement/12345',
            FormattedID: 'US6',
          }],
          TotalResultCount: 1,
        },
      }),
    });

    const result = await resolveArtifact('US6');
    expect(result).toEqual({
      type: 'hierarchicalrequirement',
      objectId: 12345,
      ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/hierarchicalrequirement/12345',
      formattedId: 'US6',
    });
  });

  it('returns null when artifact not found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        QueryResult: { Results: [], TotalResultCount: 0 },
      }),
    });

    const result = await resolveArtifact('US999');
    expect(result).toBeNull();
  });
});
