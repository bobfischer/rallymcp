import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { handleCreateDependency } = await import('../../src/tools/create-connection.js');

function okJson(body: any) {
  return { ok: true, json: async () => body };
}

describe('createDependency', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('creates a predecessor dependency between two stories', async () => {
    // Resolve source (US135)
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [{ ObjectID: 135, _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/hierarchicalrequirement/135', FormattedID: 'US135' }] } }));
    // Resolve target (US137)
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [{ ObjectID: 137, _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/hierarchicalrequirement/137', FormattedID: 'US137' }] } }));
    // POST Predecessors/add
    mockFetch.mockResolvedValueOnce(okJson({ OperationResult: { Errors: [] } }));
    // Fetch source name
    mockFetch.mockResolvedValueOnce(okJson({ HierarchicalRequirement: { Name: 'Go-To-Market Readiness' } }));
    // Fetch target name
    mockFetch.mockResolvedValueOnce(okJson({ HierarchicalRequirement: { Name: 'Product Catalog Entry' } }));

    const result = await handleCreateDependency({ sourceFormattedId: 'US135', targetFormattedId: 'US137' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.source.formattedId).toBe('US135');
    expect(parsed.predecessor.formattedId).toBe('US137');
    expect(parsed.predecessor.name).toBe('Product Catalog Entry');

    // Verify the Predecessors/add call
    const addCall = mockFetch.mock.calls[2];
    expect(addCall[0]).toContain('/hierarchicalrequirement/135/Predecessors/add');
    const addBody = JSON.parse(addCall[1].body);
    expect(addBody.CollectionInput[0]._ref).toContain('/hierarchicalrequirement/137');
  });

  it('rejects non-story source', async () => {
    // Resolve source as Feature
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [{ ObjectID: 6, _ref: 'ref/6', FormattedID: 'F6' }] } }));
    // Resolve target as Story
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [{ ObjectID: 135, _ref: 'ref/135', FormattedID: 'US135' }] } }));

    const result = await handleCreateDependency({ sourceFormattedId: 'F6', targetFormattedId: 'US135' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('must be a User Story');
  });

  it('returns error when source not found', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [] } }));
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [{ ObjectID: 137, _ref: 'ref/137', FormattedID: 'US137' }] } }));

    const result = await handleCreateDependency({ sourceFormattedId: 'US999', targetFormattedId: 'US137' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('US999');
  });
});
