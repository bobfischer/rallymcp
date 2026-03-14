import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { handleSearchUser } = await import('../../src/tools/search-user.js');

describe('searchUser', () => {
  beforeEach(() => { mockFetch.mockReset(); });

  it('returns matching users', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        QueryResult: {
          Results: [{
            ObjectID: 111, UserName: 'bob@eliassen.com',
            DisplayName: 'Bob Fischer', EmailAddress: 'bob@eliassen.com',
            _ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/user/111',
          }],
          TotalResultCount: 1,
        },
      }),
    });

    const result = await handleSearchUser({ query: 'Bob' });
    expect(result).toEqual({
      content: [{
        type: 'text',
        text: JSON.stringify([{
          displayName: 'Bob Fischer', email: 'bob@eliassen.com',
          ref: 'https://rally1.rallydev.com/slm/webservice/v2.0/user/111',
        }], null, 2),
      }],
    });
  });

  it('returns empty array when no users found', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true, json: async () => ({ QueryResult: { Results: [], TotalResultCount: 0 } }),
    });
    const result = await handleSearchUser({ query: 'nonexistent' });
    expect(result).toEqual({ content: [{ type: 'text', text: '[]' }] });
  });
});
