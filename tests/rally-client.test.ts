import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { rallyGet, rallyPost, rallyPut, rallyDelete, getSecurityToken, RALLY_BASE_URL } = await import('../src/rally-client.js');

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

  describe('getSecurityToken', () => {
    it('fetches and returns security token', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ OperationResult: { SecurityToken: 'abc123' } }),
      });

      const token = await getSecurityToken();
      expect(token).toBe('abc123');

      const [url, opts] = mockFetch.mock.calls[0];
      expect(url).toContain('/security/authorize');
      expect(opts.headers['ZSESSIONID']).toBe('test-api-key');
    });
  });

  describe('rallyPost', () => {
    it('fetches token then POSTs with key param', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ OperationResult: { SecurityToken: 'tok123' } }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ CreateResult: { Object: { ObjectID: 1 } } }),
      });

      const result = await rallyPost('/portfolioitem/feature', { Feature: { Name: 'Test' } });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [postUrl, postOpts] = mockFetch.mock.calls[1];
      expect(postUrl).toContain('key=tok123');
      expect(postOpts.method).toBe('POST');
      expect(JSON.parse(postOpts.body)).toEqual({ Feature: { Name: 'Test' } });
    });
  });

  describe('rallyPut', () => {
    it('fetches token then PUTs with key param', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ OperationResult: { SecurityToken: 'tok789' } }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ OperationResult: { Object: { ObjectID: 1 }, Errors: [] } }),
      });

      const result = await rallyPut('/portfolioitem/feature/100', { Feature: { FlowState: 'ref' } });

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [putUrl, putOpts] = mockFetch.mock.calls[1];
      expect(putUrl).toContain('key=tok789');
      expect(putOpts.method).toBe('PUT');
    });
  });

  describe('rallyDelete', () => {
    it('fetches token then DELETEs with key param', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ OperationResult: { SecurityToken: 'tok456' } }),
      });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ OperationResult: { Errors: [] } }),
      });

      const result = await rallyDelete('/hierarchicalrequirement/12345');

      const [delUrl, delOpts] = mockFetch.mock.calls[1];
      expect(delUrl).toContain('key=tok456');
      expect(delOpts.method).toBe('DELETE');
    });
  });
});
