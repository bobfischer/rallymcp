import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { handleAddAttachment } = await import('../../src/tools/add-attachment.js');

describe('addAttachment', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('creates attachment content then links it to artifact', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [{ ObjectID: 100, _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/portfolioitem/feature/100', FormattedID: 'F6' }], TotalResultCount: 1 } }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ OperationResult: { SecurityToken: 'tok1' } }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ CreateResult: { Object: { _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/attachmentcontent/900' }, Errors: [] } }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ OperationResult: { SecurityToken: 'tok2' } }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ CreateResult: { Object: { ObjectID: 901, _ref: 'ref/901' }, Errors: [] } }) });

    const result = await handleAddAttachment({ formattedId: 'F6', filename: 'brief.md', content: '# Brief\nContent here', contentType: 'text/markdown' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.attachmentId).toBe(901);
    expect(parsed.filename).toBe('brief.md');
  });

  it('returns error when artifact not found', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [], TotalResultCount: 0 } }) });
    const result = await handleAddAttachment({ formattedId: 'F999', filename: 'test.md', content: 'test', contentType: 'text/markdown' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
  });
});
