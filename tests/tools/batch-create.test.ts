import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

process.env.RALLY_API_KEY = 'test-api-key';
process.env.RALLY_WORKSPACE_REF = '843310407671';
process.env.RALLY_PROJECT_REF = '844308252829';

const { handleBatchCreate } = await import('../../src/tools/batch-create.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a mock Rally CreateResult response. */
function createResult(type: string, fid: string, oid: number, name: string) {
  return {
    ok: true,
    json: async () => ({
      CreateResult: {
        Object: {
          FormattedID: fid,
          ObjectID: oid,
          _ref: `https://rally1.rallydev.com/slm/webservice/v2.0/${type}/${oid}`,
          Name: name,
        },
        Errors: [],
      },
    }),
  };
}

/** Build a mock Rally QueryResult (for resolveArtifact). */
function queryResult(type: string, fid: string, oid: number) {
  return {
    ok: true,
    json: async () => ({
      QueryResult: {
        Results: [
          {
            ObjectID: oid,
            FormattedID: fid,
            _ref: `https://rally1.rallydev.com/slm/webservice/v2.0/${type}/${oid}`,
          },
        ],
        TotalResultCount: 1,
      },
    }),
  };
}

function emptyQuery() {
  return {
    ok: true,
    json: async () => ({
      QueryResult: { Results: [], TotalResultCount: 0 },
    }),
  };
}

function parseResult(result: any) {
  return JSON.parse(result.content[0].text);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('batchCreate', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('creates full tree: Initiative → Feature → Stories → Tasks', async () => {
    // 1. resolveArtifact — lookup Initiative I6
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/initiative', 'I6', 600));
    // 2. createFeature
    mockFetch.mockResolvedValueOnce(createResult('portfolioitem/feature', 'F14', 1400, 'AI Coaching'));
    // 3. createStory — Story 1
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US28', 2800, 'Product Deck'));
    // 4. createStory — Story 2
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US29', 2900, 'Training'));
    // 5. createTask — Task under Story 1
    mockFetch.mockResolvedValueOnce(createResult('task', 'TA100', 10000, 'Define'));
    // 6. createTask — Task under Story 2
    mockFetch.mockResolvedValueOnce(createResult('task', 'TA101', 10001, 'Schedule'));

    const result = await handleBatchCreate({
      parentRef: 'I6',
      name: 'AI Coaching',
      description: 'Coaching product',
      children: [
        { name: 'Product Deck', children: [{ name: 'Define' }] },
        { name: 'Training', children: [{ name: 'Schedule' }] },
      ],
    });

    const parsed = parseResult(result);
    expect(parsed.created.type).toBe('Feature');
    expect(parsed.created.formattedId).toBe('F14');
    expect(parsed.created.children).toHaveLength(2);
    expect(parsed.created.children[0].type).toBe('UserStory');
    expect(parsed.created.children[0].children).toHaveLength(1);
    expect(parsed.created.children[0].children[0].type).toBe('Task');
  });

  it('creates Stories + Tasks under an existing Feature', async () => {
    // resolveArtifact — lookup Feature F13
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/feature', 'F13', 1300));
    // createStory
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US30', 3000, 'SOW'));
    // createTask × 5 (template expansion)
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce(createResult('task', `TA${200 + i}`, 20000 + i, `Task ${i}`));
    }

    const result = await handleBatchCreate({
      parentRef: 'F13',
      children: [
        { name: 'SOW', template: 'artifact' },
      ],
    });

    const parsed = parseResult(result);
    expect(parsed.created.type).toBe('Feature');
    expect(parsed.created.children).toHaveLength(1);
    // artifact template expands to 5 tasks
    expect(parsed.created.children[0].children).toHaveLength(5);
  });

  it('creates a single Story with name under a Feature parent', async () => {
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/feature', 'F13', 1300));
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US31', 3100, 'SOW Template'));
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce(createResult('task', `TA${300 + i}`, 30000 + i, `Task ${i}`));
    }

    const result = await handleBatchCreate({
      parentRef: 'F13',
      name: 'SOW Template',
      description: 'Reusable SOW',
      children: [
        { name: 'Define' },
        { name: 'Draft' },
        { name: 'Review' },
        { name: 'Finalize' },
        { name: 'Publish' },
      ],
    });

    const parsed = parseResult(result);
    // single-story mode returns the story as created root
    expect(parsed.created.type).toBe('UserStory');
    expect(parsed.created.formattedId).toBe('US31');
    expect(parsed.created.children).toHaveLength(5);
  });

  it('creates Tasks under a User Story parent', async () => {
    mockFetch.mockResolvedValueOnce(queryResult('hierarchicalrequirement', 'US10', 1000));
    mockFetch.mockResolvedValueOnce(createResult('task', 'TA400', 40000, 'Task A'));
    mockFetch.mockResolvedValueOnce(createResult('task', 'TA401', 40001, 'Task B'));

    const result = await handleBatchCreate({
      parentRef: 'US10',
      children: [
        { name: 'Task A' },
        { name: 'Task B' },
      ],
    });

    const parsed = parseResult(result);
    expect(parsed.created.type).toBe('UserStory');
    expect(parsed.created.children).toHaveLength(2);
    expect(parsed.created.children[0].type).toBe('Task');
  });

  it('expands artifact template into 5 tasks', async () => {
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/feature', 'F1', 100));
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US50', 5000, 'Deck'));
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce(createResult('task', `TA${500 + i}`, 50000 + i, `T ${i}`));
    }

    const result = await handleBatchCreate({
      parentRef: 'F1',
      children: [{ name: 'Deck', template: 'artifact' }],
    });

    const parsed = parseResult(result);
    expect(parsed.created.children[0].children).toHaveLength(5);
  });

  it('rejects template + children on the same child', async () => {
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/feature', 'F1', 100));

    const result = await handleBatchCreate({
      parentRef: 'F1',
      children: [
        { name: 'Bad', template: 'artifact', children: [{ name: 'Extra' }] },
      ],
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('mutually exclusive');
  });

  it('returns error when parent not found', async () => {
    mockFetch.mockResolvedValueOnce(emptyQuery());

    const result = await handleBatchCreate({
      parentRef: 'I999',
      name: 'Ghost',
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('not found');
  });

  it('collects partial failures in errors array', async () => {
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/feature', 'F1', 100));
    // Story 1 succeeds
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US60', 6000, 'Good'));
    // Story 2 fails
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        CreateResult: { Object: null, Errors: ['Rally API timeout'] },
      }),
    });

    const result = await handleBatchCreate({
      parentRef: 'F1',
      children: [
        { name: 'Good' },
        { name: 'Bad' },
      ],
    });

    const parsed = parseResult(result);
    expect(parsed.created.children).toHaveLength(1);
    expect(parsed.errors).toHaveLength(1);
    expect(parsed.errors[0].name).toBe('Bad');
    expect(parsed.errors[0].error).toContain('Rally API timeout');
  });

  it('requires name when parentRef is an Initiative', async () => {
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/initiative', 'I1', 10));

    const result = await handleBatchCreate({
      parentRef: 'I1',
      children: [{ name: 'Story' }],
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('name is required');
  });

  it('rejects unsupported parent types', async () => {
    mockFetch.mockResolvedValueOnce(queryResult('task', 'TA1', 10));

    const result = await handleBatchCreate({
      parentRef: 'TA1',
      name: 'Subtask',
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Unsupported parent type');
  });
});
