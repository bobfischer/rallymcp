import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { rallyGet, rallyPost, rallyPut, rallyDelete, RALLY_BASE_URL } = await import('../src/rally-client.js');

describe('Rally Client', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  describe('rallyGet', () => {
    it('sends GET with ZSESSIONID header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ QueryResult: { Results: [{ Name: 'Test' }], TotalResultCount: 1 } }),
      });

      const result = await rallyGet('/user', { query: '(DisplayName contains "Bob")' });

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/slm/webservice/v2.0/user');
      expect(url).toContain('query=');
      expect(opts.headers['ZSESSIONID']).toBe('test-api-key');
      expect(opts.method).toBe('GET');
      expect(result).toEqual({ QueryResult: { Results: [{ Name: 'Test' }], TotalResultCount: 1 } });
    });

    it('throws on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Unauthorized',
      });

      await expect(rallyGet('/user', {})).rejects.toThrow('Rally API error: 401');
    });
  });

  describe('rallyPost', () => {
    it('POSTs directly with API key auth', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ CreateResult: { Object: { ObjectID: 1 } } }),
      });

      const result = await rallyPost('/portfolioitem/feature', { Feature: { Name: 'Test' } });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [postUrl, postOpts] = mockFetch.mock.calls[0];
      expect(postUrl).toContain('/slm/webservice/v2.0/portfolioitem/feature');
      expect(postOpts.method).toBe('POST');
      expect(postOpts.headers['ZSESSIONID']).toBe('test-api-key');
      expect(JSON.parse(postOpts.body)).toEqual({ Feature: { Name: 'Test' } });
    });
  });

  describe('rallyPut', () => {
    it('PUTs directly with API key auth', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ OperationResult: { Object: { ObjectID: 1 }, Errors: [] } }),
      });

      const result = await rallyPut('/portfolioitem/feature/100', { Feature: { FlowState: 'ref' } });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [putUrl, putOpts] = mockFetch.mock.calls[0];
      expect(putUrl).toContain('/slm/webservice/v2.0/portfolioitem/feature/100');
      expect(putOpts.method).toBe('PUT');
      expect(putOpts.headers['ZSESSIONID']).toBe('test-api-key');
    });
  });

  describe('rallyDelete', () => {
    it('DELETEs directly with API key auth', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ OperationResult: { Errors: [] } }),
      });

      const result = await rallyDelete('/hierarchicalrequirement/12345');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [delUrl, delOpts] = mockFetch.mock.calls[0];
      expect(delUrl).toContain('/slm/webservice/v2.0/hierarchicalrequirement/12345');
      expect(delOpts.method).toBe('DELETE');
      expect(delOpts.headers['ZSESSIONID']).toBe('test-api-key');
    });
  });
});
