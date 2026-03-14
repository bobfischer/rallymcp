import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { handleGetAttachment } = await import('../../src/tools/get-attachment.js');

describe('getAttachment', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('lists all attachments when no filename given', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({
      QueryResult: { Results: [
        { Name: 'brief.md', ContentType: 'text/markdown', Size: 100, _ref: 'ref/att/1', ObjectID: 1 },
        { Name: 'notes.txt', ContentType: 'text/plain', Size: 50, _ref: 'ref/att/2', ObjectID: 2 },
      ], TotalResultCount: 2 },
    }) });

    const result = await handleGetAttachment({ formattedId: 'F6' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].filename).toBe('brief.md');
  });

  it('retrieves content of specific attachment by filename', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({
      QueryResult: { Results: [
        { Name: 'brief.md', ContentType: 'text/markdown', Size: 20, _ref: 'ref/att/1', ObjectID: 1, Content: { _ref: 'ref/attcontent/1' } },
      ], TotalResultCount: 1 },
    }) });
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({
      AttachmentContent: { Content: Buffer.from('# My Brief').toString('base64') },
    }) });

    const result = await handleGetAttachment({ formattedId: 'F6', filename: 'brief.md' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.filename).toBe('brief.md');
    expect(parsed.content).toBe('# My Brief');
  });

  it('returns error when specific file not found', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ QueryResult: { Results: [], TotalResultCount: 0 } }) });
    const result = await handleGetAttachment({ formattedId: 'F6', filename: 'missing.md' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
  });
});
