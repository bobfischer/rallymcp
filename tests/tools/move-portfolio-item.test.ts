import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { handleMovePortfolioItem } = await import('../../src/tools/move-portfolio-item.js');

describe('movePortfolioItem', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('moves a feature to a new flow state', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [{ ObjectID: 100, _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/portfolioitem/feature/100', FormattedID: 'F6' }], TotalResultCount: 1 } }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [{ _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/flowstate/55' }], TotalResultCount: 1 } }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ OperationResult: { SecurityToken: 'tok' } }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ OperationResult: { Object: { FormattedID: 'F6' }, Errors: [] } }) });

    const result = await handleMovePortfolioItem({ formattedId: 'F6', state: 'Discovering' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.formattedId).toBe('F6');
    expect(parsed.newState).toBe('Discovering');
  });

  it('returns error when artifact not found', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [], TotalResultCount: 0 } }) });
    const result = await handleMovePortfolioItem({ formattedId: 'F999', state: 'Done' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('not found');
  });

  it('returns error when flow state not found', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [{ ObjectID: 100, _ref: 'ref', FormattedID: 'F6' }], TotalResultCount: 1 } }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [], TotalResultCount: 0 } }) });
    const result = await handleMovePortfolioItem({ formattedId: 'F6', state: 'Bogus' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Flow state not found');
  });
});
