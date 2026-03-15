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

function userQuery(email: string, ref: string) {
  return {
    ok: true,
    json: async () => ({
      QueryResult: { Results: [{ _ref: ref }], TotalResultCount: 1 },
    }),
  };
}

function tagQuery(ref: string) {
  return {
    ok: true,
    json: async () => ({
      QueryResult: { Results: [{ _ref: ref }], TotalResultCount: 1 },
    }),
  };
}

function tagCreate(name: string, ref: string) {
  return {
    ok: true,
    json: async () => ({
      CreateResult: { Object: { _ref: ref, Name: name }, Errors: [] },
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
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/initiative', 'I6', 600));
    mockFetch.mockResolvedValueOnce(createResult('portfolioitem/feature', 'F14', 1400, 'AI Coaching'));
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US28', 2800, 'Product Deck'));
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US29', 2900, 'Training'));
    mockFetch.mockResolvedValueOnce(createResult('task', 'TA100', 10000, 'Define'));
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
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/feature', 'F13', 1300));
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US30', 3000, 'SOW'));
    for (let i = 0; i < 5; i++) {
      mockFetch.mockResolvedValueOnce(createResult('task', `TA${200 + i}`, 20000 + i, `Task ${i}`));
    }

    const result = await handleBatchCreate({
      parentRef: 'F13',
      children: [{ name: 'SOW', template: 'artifact' }],
    });

    const parsed = parseResult(result);
    expect(parsed.created.type).toBe('Feature');
    expect(parsed.created.children).toHaveLength(1);
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
      children: [{ name: 'Task A' }, { name: 'Task B' }],
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
      children: [{ name: 'Bad', template: 'artifact', children: [{ name: 'Extra' }] }],
    });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('mutually exclusive');
  });

  it('returns error when parent not found', async () => {
    mockFetch.mockResolvedValueOnce(emptyQuery());

    const result = await handleBatchCreate({ parentRef: 'I999', name: 'Ghost' });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('not found');
  });

  it('collects partial failures in errors array', async () => {
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/feature', 'F1', 100));
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US60', 6000, 'Good'));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ CreateResult: { Object: null, Errors: ['Rally API timeout'] } }),
    });

    const result = await handleBatchCreate({
      parentRef: 'F1',
      children: [{ name: 'Good' }, { name: 'Bad' }],
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

    const result = await handleBatchCreate({ parentRef: 'TA1', name: 'Subtask' });

    const parsed = parseResult(result);
    expect(parsed.success).toBe(false);
    expect(parsed.error).toContain('Unsupported parent type');
  });

  // ----- Owner & Tags tests -----

  it('resolves owner email and sets Owner on story and tasks', async () => {
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/feature', 'F1', 100));
    // user lookup for owner
    mockFetch.mockResolvedValueOnce(userQuery('KLindbloom@eliassen.com', '/user/111'));
    // createStory
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US70', 7000, 'Deck'));
    // createTask (inherits owner)
    mockFetch.mockResolvedValueOnce(createResult('task', 'TA700', 70000, 'Define'));

    const result = await handleBatchCreate({
      parentRef: 'F1',
      children: [{
        name: 'Deck',
        owner: 'KLindbloom@eliassen.com',
        children: [{ name: 'Define' }],
      }],
    });

    const parsed = parseResult(result);
    const story = parsed.created.children[0];
    expect(story.owner).toBe('KLindbloom@eliassen.com');
    expect(story.children[0].owner).toBe('KLindbloom@eliassen.com');

    // Verify Owner was passed to Rally in story create body
    const storyCall = mockFetch.mock.calls[2];
    const storyBody = JSON.parse(storyCall[1].body);
    expect(storyBody.HierarchicalRequirement.Owner).toBe('/user/111');

    // Verify Owner was passed to Rally in task create body
    const taskCall = mockFetch.mock.calls[3];
    const taskBody = JSON.parse(taskCall[1].body);
    expect(taskBody.Task.Owner).toBe('/user/111');
  });

  it('task-level owner overrides story default', async () => {
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/feature', 'F1', 100));
    // user lookup for story owner
    mockFetch.mockResolvedValueOnce(userQuery('KLindbloom@eliassen.com', '/user/111'));
    // createStory
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US71', 7100, 'Training'));
    // user lookup for task owner
    mockFetch.mockResolvedValueOnce(userQuery('KKappes@eliassen.com', '/user/222'));
    // createTask
    mockFetch.mockResolvedValueOnce(createResult('task', 'TA710', 71000, 'Deliver'));

    const result = await handleBatchCreate({
      parentRef: 'F1',
      children: [{
        name: 'Training',
        owner: 'KLindbloom@eliassen.com',
        children: [{ name: 'Deliver', owner: 'KKappes@eliassen.com' }],
      }],
    });

    const parsed = parseResult(result);
    expect(parsed.created.children[0].owner).toBe('KLindbloom@eliassen.com');
    expect(parsed.created.children[0].children[0].owner).toBe('KKappes@eliassen.com');

    const taskCall = mockFetch.mock.calls[4];
    const taskBody = JSON.parse(taskCall[1].body);
    expect(taskBody.Task.Owner).toBe('/user/222');
  });

  it('caches user lookups — same email resolved once', async () => {
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/feature', 'F1', 100));
    // single user lookup
    mockFetch.mockResolvedValueOnce(userQuery('KLindbloom@eliassen.com', '/user/111'));
    // createStory 1
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US72', 7200, 'S1'));
    // createStory 2
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US73', 7300, 'S2'));

    const result = await handleBatchCreate({
      parentRef: 'F1',
      children: [
        { name: 'S1', owner: 'KLindbloom@eliassen.com' },
        { name: 'S2', owner: 'KLindbloom@eliassen.com' },
      ],
    });

    const parsed = parseResult(result);
    expect(parsed.created.children[0].owner).toBe('KLindbloom@eliassen.com');
    expect(parsed.created.children[1].owner).toBe('KLindbloom@eliassen.com');

    // Only one user query should have been made
    const userCalls = mockFetch.mock.calls.filter(([url]: [string]) => url.includes('/user'));
    expect(userCalls).toHaveLength(1);
  });

  it('warns on unknown owner and creates artifact unowned', async () => {
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/feature', 'F1', 100));
    // user lookup returns empty
    mockFetch.mockResolvedValueOnce(emptyQuery());
    // createStory (no Owner set)
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US74', 7400, 'Orphan'));

    const result = await handleBatchCreate({
      parentRef: 'F1',
      children: [{ name: 'Orphan', owner: 'nobody@eliassen.com' }],
    });

    const parsed = parseResult(result);
    expect(parsed.created.children[0].owner).toBeUndefined();
    expect(parsed.warnings).toHaveLength(1);
    expect(parsed.warnings[0].field).toBe('owner');
    expect(parsed.warnings[0].value).toBe('nobody@eliassen.com');
  });

  it('resolves tags and applies to story', async () => {
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/feature', 'F1', 100));
    // tag lookup — exists
    mockFetch.mockResolvedValueOnce(tagQuery('/tag/500'));
    // tag lookup — not found, then auto-created
    mockFetch.mockResolvedValueOnce(emptyQuery());
    mockFetch.mockResolvedValueOnce(tagCreate('artifact', '/tag/501'));
    // createStory
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US75', 7500, 'Deck'));

    const result = await handleBatchCreate({
      parentRef: 'F1',
      children: [{
        name: 'Deck',
        tags: ['pkg:product-deck', 'artifact'],
      }],
    });

    const parsed = parseResult(result);
    expect(parsed.created.children[0].tags).toEqual(['pkg:product-deck', 'artifact']);

    // Verify Tags were passed to Rally
    const storyCall = mockFetch.mock.calls[4];
    const storyBody = JSON.parse(storyCall[1].body);
    expect(storyBody.HierarchicalRequirement.Tags).toEqual([
      { _ref: '/tag/500' },
      { _ref: '/tag/501' },
    ]);
  });

  it('caches tag lookups — same tag resolved once', async () => {
    mockFetch.mockResolvedValueOnce(queryResult('portfolioitem/feature', 'F1', 100));
    // single tag lookup
    mockFetch.mockResolvedValueOnce(tagQuery('/tag/500'));
    // createStory 1
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US76', 7600, 'S1'));
    // createStory 2
    mockFetch.mockResolvedValueOnce(createResult('hierarchicalrequirement', 'US77', 7700, 'S2'));

    const result = await handleBatchCreate({
      parentRef: 'F1',
      children: [
        { name: 'S1', tags: ['pkg:deck'] },
        { name: 'S2', tags: ['pkg:deck'] },
      ],
    });

    const parsed = parseResult(result);
    expect(parsed.created.children[0].tags).toEqual(['pkg:deck']);
    expect(parsed.created.children[1].tags).toEqual(['pkg:deck']);

    const tagCalls = mockFetch.mock.calls.filter(([url]: [string]) => url.includes('/tag'));
    expect(tagCalls).toHaveLength(1);
  });
});
