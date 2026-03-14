import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { handleDeleteArtifact } = await import('../../src/tools/delete-artifact.js');

describe('deleteArtifact', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('rejects when confirm is false', async () => {
    const result = await handleDeleteArtifact({ formattedId: 'US6', confirm: false });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('confirm must be true');
  });

  it('deletes a user story when confirmed', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [{ ObjectID: 500, _ref: 'ref/500', FormattedID: 'US6' }], TotalResultCount: 1 } }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ OperationResult: { SecurityToken: 'tok' } }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ OperationResult: { Errors: [] } }) });

    const result = await handleDeleteArtifact({ formattedId: 'US6', confirm: true });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.formattedId).toBe('US6');
    expect(parsed.deleted).toBe(true);
  });

  it('returns error when artifact not found', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [], TotalResultCount: 0 } }) });
    const result = await handleDeleteArtifact({ formattedId: 'US999', confirm: true });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('not found');
  });
});
