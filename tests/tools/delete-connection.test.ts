import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { handleDeleteDependency } = await import('../../src/tools/delete-connection.js');

function okJson(body: any) {
  return { ok: true, json: async () => body };
}

describe('deleteDependency', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('rejects when confirm is false', async () => {
    const result = await handleDeleteDependency({ sourceFormattedId: 'US135', targetFormattedId: 'US137', confirm: false });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('confirm must be true');
  });

  it('removes a predecessor dependency', async () => {
    // Resolve source
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [{ ObjectID: 135, _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/hierarchicalrequirement/135', FormattedID: 'US135' }] } }));
    // Resolve target
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [{ ObjectID: 137, _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/hierarchicalrequirement/137', FormattedID: 'US137' }] } }));
    // POST Predecessors/remove
    mockFetch.mockResolvedValueOnce(okJson({ OperationResult: { Errors: [] } }));
    // Fetch source name
    mockFetch.mockResolvedValueOnce(okJson({ HierarchicalRequirement: { Name: 'Go-To-Market Readiness' } }));
    // Fetch target name
    mockFetch.mockResolvedValueOnce(okJson({ HierarchicalRequirement: { Name: 'Product Catalog Entry' } }));

    const result = await handleDeleteDependency({ sourceFormattedId: 'US135', targetFormattedId: 'US137', confirm: true });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.deleted).toBe(true);
    expect(parsed.source.formattedId).toBe('US135');
    expect(parsed.predecessor.formattedId).toBe('US137');

    // Verify the Predecessors/remove call
    const removeCall = mockFetch.mock.calls[2];
    expect(removeCall[0]).toContain('/hierarchicalrequirement/135/Predecessors/remove');
  });

  it('returns error when artifact not found', async () => {
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [] } }));
    mockFetch.mockResolvedValueOnce(okJson({ QueryResult: { Results: [{ ObjectID: 137, _ref: 'ref/137', FormattedID: 'US137' }] } }));

    const result = await handleDeleteDependency({ sourceFormattedId: 'US999', targetFormattedId: 'US137', confirm: true });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('US999');
  });
});
