import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { handleMovePortfolioItem } = await import('../../src/tools/move-portfolio-item.js');

describe('movePortfolioItem', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('moves a feature to a new state', async () => {
    // resolveArtifact GET
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [{ ObjectID: 100, _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/portfolioitem/feature/100', FormattedID: 'F6' }], TotalResultCount: 1 } }) });
    // /state GET (all workspace states)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [{ Name: 'No Entry', _ref: '/state/50', ObjectID: 50 }, { Name: 'In Progress', _ref: '/state/843310409243', ObjectID: 843310409243 }, { Name: 'Done', _ref: '/state/60', ObjectID: 60 }], TotalResultCount: 3 } }) });
    // PUT
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ OperationResult: { Object: { FormattedID: 'F6' }, Errors: [] } }) });

    const result = await handleMovePortfolioItem({ formattedId: 'F6', state: 'In Progress' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.formattedId).toBe('F6');
    expect(parsed.newState).toBe('In Progress');

    // Verify PUT uses State field with correct ref
    const [, putOpts] = mockFetch.mock.calls[2];
    const putBody = JSON.parse(putOpts.body);
    expect(putBody.Feature.State).toBe('/state/843310409243');
    expect(putBody.Feature.FlowState).toBeUndefined();
  });

  it('returns error when artifact not found', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [], TotalResultCount: 0 } }) });
    const result = await handleMovePortfolioItem({ formattedId: 'F999', state: 'Done' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('not found');
  });

  it('returns error with available states when state not found', async () => {
    // resolveArtifact GET
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [{ ObjectID: 100, _ref: 'ref', FormattedID: 'F6' }], TotalResultCount: 1 } }) });
    // /state GET (all workspace states)
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [{ Name: 'No Entry', _ref: '/state/50', ObjectID: 50 }, { Name: 'Done', _ref: '/state/60', ObjectID: 60 }], TotalResultCount: 2 } }) });

    const result = await handleMovePortfolioItem({ formattedId: 'F6', state: 'Bogus' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('State not found');
    expect(parsed.availableStates).toEqual(['No Entry', 'Done']);
  });
});
