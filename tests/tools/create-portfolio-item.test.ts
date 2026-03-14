import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { handleCreatePortfolioItem } = await import('../../src/tools/create-portfolio-item.js');

describe('createPortfolioItem', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('creates a feature with all fields', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ OperationResult: { SecurityToken: 'tok' } }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ CreateResult: { Object: { FormattedID: 'F10', ObjectID: 200, _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/portfolioitem/feature/200' }, Errors: [] } }) });

    const result = await handleCreatePortfolioItem({ type: 'feature', name: 'Test Feature', description: 'A description', parentRef: '/portfolioitem/initiative/50', ownerRef: '/user/111' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.formattedId).toBe('F10');
    expect(parsed.objectId).toBe(200);

    const postBody = JSON.parse(mockFetch.mock.calls[1][1].body);
    expect(postBody.Feature.Name).toBe('Test Feature');
    expect(postBody.Feature.Description).toBe('A description');
    expect(postBody.Feature.Parent).toBe('/portfolioitem/initiative/50');
    expect(postBody.Feature.Owner).toBe('/user/111');
  });

  it('creates an initiative with minimal fields', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ OperationResult: { SecurityToken: 'tok' } }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ CreateResult: { Object: { FormattedID: 'I5', ObjectID: 300, _ref: 'ref/300' }, Errors: [] } }) });

    const result = await handleCreatePortfolioItem({ type: 'initiative', name: 'Test Initiative' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.formattedId).toBe('I5');
  });
});
