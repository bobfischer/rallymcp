import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { handleCreateConnection } = await import('../../src/tools/create-connection.js');

function okJson(body: any) {
  return { ok: true, json: async () => body };
}

describe('createConnection', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('creates a connection between two artifacts', async () => {
    // Resolve source (US135)
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [{ ObjectID: 135, _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/hierarchicalrequirement/135', FormattedID: 'US135' }] } }));
    // Resolve target (US137)
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [{ ObjectID: 137, _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/hierarchicalrequirement/137', FormattedID: 'US137' }] } }));
    // Fetch source name
    mockFetch.mockResolvedValueOnce(okJson({ HierarchicalRequirement: { Name: 'Go-To-Market Readiness' } }));
    // Fetch target name
    mockFetch.mockResolvedValueOnce(okJson({ HierarchicalRequirement: { Name: 'Product Catalog Entry' } }));
    // POST connection create
    mockFetch.mockResolvedValueOnce(okJson({ CreateResult: { Errors: [], Object: { _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/connection/999' } } }));

    const result = await handleCreateConnection({ sourceFormattedId: 'US135', targetFormattedId: 'US137' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.source.formattedId).toBe('US135');
    expect(parsed.source.name).toBe('Go-To-Market Readiness');
    expect(parsed.target.formattedId).toBe('US137');
    expect(parsed.target.name).toBe('Product Catalog Entry');
    expect(parsed.connectionRef).toContain('/connection/999');
  });

  it('returns error when source not found', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [] } }));
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [{ ObjectID: 137, _ref: 'ref/137', FormattedID: 'US137' }] } }));

    const result = await handleCreateConnection({ sourceFormattedId: 'US999', targetFormattedId: 'US137' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('US999');
  });

  it('returns error when Rally rejects the connection', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [{ ObjectID: 135, _ref: 'ref/135', FormattedID: 'US135' }] } }));
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [{ ObjectID: 137, _ref: 'ref/137', FormattedID: 'US137' }] } }));
    mockFetch.mockResolvedValueOnce(okJson({ HierarchicalRequirement: { Name: 'Source' } }));
    mockFetch.mockResolvedValueOnce(okJson({ HierarchicalRequirement: { Name: 'Target' } }));
    mockFetch.mockResolvedValueOnce(okJson({ CreateResult: { Errors: ['Connection already exists'] } }));

    const result = await handleCreateConnection({ sourceFormattedId: 'US135', targetFormattedId: 'US137' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('already exists');
  });
});
