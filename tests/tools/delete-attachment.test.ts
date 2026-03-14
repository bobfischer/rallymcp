import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { handleDeleteAttachment } = await import('../../src/tools/delete-attachment.js');

describe('deleteAttachment', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('deletes an attachment by ID', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => ({ OperationResult: { Errors: [] } }) });

    const result = await handleDeleteAttachment({ attachmentId: '901' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(true);
    expect(parsed.deleted).toBe(true);
  });

  it('returns error on failure', async () => {
    mockFetch.mockResolvedValueOnce({ ok: false, status: 404, statusText: 'Not Found', text: async () => 'Not found' });

    const result = await handleDeleteAttachment({ attachmentId: '999' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.success).toBe(false);
  });
});
