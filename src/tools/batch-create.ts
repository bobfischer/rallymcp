import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { rallyGet, rallyPost, PROJECT_REF, RALLY_BASE_URL, withRetry } from '../rally-client.js';
import { resolveArtifact } from '../resolve-artifact.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Child {
  name: string;
  description?: string;
  template?: string;
  children?: Child[];
  fieldMap?: Record<string, any>;
  owner?: string;
  tags?: string[];
}

interface CreatedArtifact {
  formattedId: string;
  name: string;
  ref: string;
  type: string;
  owner?: string;
  tags?: string[];
  children?: CreatedArtifact[];
}

interface BatchError {
  name: string;
  intendedParent: string;
  error: string;
}

interface BatchWarning {
  field: string;
  value: string;
  error: string;
}

// ---------------------------------------------------------------------------
// Lookup caches (per-call)
// ---------------------------------------------------------------------------

class LookupCache {
  private userCache = new Map<string, string | null>(); // email → ref or null
  private tagCache = new Map<string, string>();          // tag name → ref
  warnings: BatchWarning[] = [];

  async resolveOwner(email: string): Promise<string | undefined> {
    const lower = email.toLowerCase();
    if (this.userCache.has(lower)) {
      const cached = this.userCache.get(lower)!;
      return cached ?? undefined;
    }

    try {
      const result = await rallyGet('/user', {
        query: `(EmailAddress = "${email}")`,
        fetch: '_ref',
      });
      if (result.QueryResult.Results.length > 0) {
        const ref = result.QueryResult.Results[0]._ref;
        this.userCache.set(lower, ref);
        return ref;
      }
    } catch { /* fall through */ }

    this.userCache.set(lower, null);
    this.warnings.push({ field: 'owner', value: email, error: 'User not found — artifact created unowned' });
    return undefined;
  }

  async resolveTag(name: string): Promise<string> {
    if (this.tagCache.has(name)) {
      return this.tagCache.get(name)!;
    }

    // Look up existing tag
    const result = await rallyGet('/tag', {
      query: `(Name = "${name}")`,
      fetch: '_ref',
    });
    if (result.QueryResult.Results.length > 0) {
      const ref = result.QueryResult.Results[0]._ref;
      this.tagCache.set(name, ref);
      return ref;
    }

    // Auto-create tag
    const createResult = await rallyPost('/tag/create?fetch=_ref,Name', {
      Tag: { Name: name },
    });
    const cr = createResult.CreateResult;
    if (cr?.Errors?.length > 0) throw new Error(`Tag create failed: ${cr.Errors.join('; ')}`);
    const ref = cr.Object._ref;
    this.tagCache.set(name, ref);
    return ref;
  }

  async resolveTags(names: string[]): Promise<Array<{ _ref: string }>> {
    const refs: Array<{ _ref: string }> = [];
    for (const name of names) {
      try {
        const ref = await this.resolveTag(name);
        refs.push({ _ref: ref });
      } catch (err: any) {
        this.warnings.push({ field: 'tags', value: name, error: err.message });
      }
    }
    return refs;
  }
}

// ---------------------------------------------------------------------------
// Templates
// ---------------------------------------------------------------------------

const TEMPLATES: Record<string, Child[]> = {
  artifact: [
    { name: 'Define — Confirm persona(s), key message, and internal users' },
    { name: 'Draft — Create v1; get async feedback from AE or Solution Seller' },
    { name: 'Review — Walkthrough with Marketing + Solution Seller + delivery lead' },
    { name: 'Finalize — Update artifact; get sign-off; confirm \'would use this\'' },
    { name: 'Publish — Post to enablement with usage guidance' },
  ],
  training_delivery: [
    { name: 'Schedule session' },
    { name: 'Assign facilitators and roles' },
    { name: 'Deliver training' },
    { name: 'Collect feedback' },
    { name: 'Incorporate feedback into materials' },
  ],
};

// ---------------------------------------------------------------------------
// Rally creation helpers
// ---------------------------------------------------------------------------

const projectRef = () => `${RALLY_BASE_URL}/project/${PROJECT_REF}`;

async function createFeature(
  name: string,
  description: string | undefined,
  parentRef: string,
  fieldMap?: Record<string, any>,
): Promise<CreatedArtifact> {
  const body: Record<string, any> = {
    Name: name,
    Project: projectRef(),
    Parent: parentRef,
    ...fieldMap,
  };
  if (description) body.Description = description;

  const result = await withRetry(() => rallyPost(
    '/portfolioitem/feature/create?fetch=FormattedID,ObjectID,_ref,Name',
    { Feature: body },
  ));
  const cr = result.CreateResult;
  if (cr?.Errors?.length > 0) throw new Error(cr.Errors.join('; '));
  const obj = cr?.Object;
  if (!obj) throw new Error('Unexpected response creating Feature');
  return { formattedId: obj.FormattedID, name: obj.Name, ref: obj._ref, type: 'Feature' };
}

async function createStory(
  name: string,
  description: string | undefined,
  featureRef: string,
  extras?: Record<string, any>,
): Promise<CreatedArtifact> {
  const body: Record<string, any> = {
    Name: name,
    Project: projectRef(),
    PortfolioItem: featureRef,
    ...extras,
  };
  if (description) body.Description = description;

  const result = await withRetry(() => rallyPost(
    '/hierarchicalrequirement/create?fetch=FormattedID,ObjectID,_ref,Name',
    { HierarchicalRequirement: body },
  ));
  const cr = result.CreateResult;
  if (cr?.Errors?.length > 0) throw new Error(cr.Errors.join('; '));
  const obj = cr?.Object;
  if (!obj) throw new Error('Unexpected response creating User Story');
  return { formattedId: obj.FormattedID, name: obj.Name, ref: obj._ref, type: 'UserStory' };
}

async function createTask(
  name: string,
  description: string | undefined,
  storyRef: string,
  extras?: Record<string, any>,
): Promise<CreatedArtifact> {
  const body: Record<string, any> = {
    Name: name,
    Project: projectRef(),
    WorkProduct: storyRef,
    ...extras,
  };
  if (description) body.Description = description;

  const result = await withRetry(() => rallyPost(
    '/task/create?fetch=FormattedID,ObjectID,_ref,Name',
    { Task: body },
  ));
  const cr = result.CreateResult;
  if (cr?.Errors?.length > 0) throw new Error(cr.Errors.join('; '));
  const obj = cr?.Object;
  if (!obj) throw new Error('Unexpected response creating Task');
  return { formattedId: obj.FormattedID, name: obj.Name, ref: obj._ref, type: 'Task' };
}

// ---------------------------------------------------------------------------
// Child expansion (template → children)
// ---------------------------------------------------------------------------

function expandChildren(children: Child[]): Child[] {
  return children.map((child) => {
    if (child.template && child.children) {
      throw new Error(`"${child.name}": template and children are mutually exclusive`);
    }
    if (child.template) {
      const tpl = TEMPLATES[child.template];
      if (!tpl) throw new Error(`Unknown template: ${child.template}`);
      return { ...child, children: tpl, template: undefined };
    }
    return child;
  });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleBatchCreate(input: {
  parentRef: string;
  name?: string;
  description?: string;
  children?: Child[];
}) {
  const errors: BatchError[] = [];
  const cache = new LookupCache();

  try {
    // 1. Resolve parent
    const parent = await resolveArtifact(input.parentRef);
    if (!parent) {
      return jsonResult({ success: false, error: `Parent not found: ${input.parentRef}` });
    }

    const parentType = parent.type; // e.g. "portfolioitem/initiative", "portfolioitem/feature", "hierarchicalrequirement"

    // 2. Determine execution path based on parent type
    if (parentType === 'portfolioitem/initiative') {
      // Initiative → create Feature → Stories → Tasks
      if (!input.name) {
        return jsonResult({ success: false, error: 'name is required when parentRef is an Initiative' });
      }

      const feature = await createFeature(input.name, input.description, parent.ref);
      const storyChildren = expandChildren(input.children ?? []);
      feature.children = await createStoriesAndTasks(storyChildren, feature.ref, errors, cache);
      return jsonResult({ created: feature, ...warnings(cache), ...(errors.length ? { errors } : {}) });

    } else if (parentType === 'portfolioitem/feature') {
      // Feature → create Stories → Tasks
      if (input.name) {
        // Single top-level story being created
        const topChild: Child = {
          name: input.name,
          description: input.description,
          template: (input as any).template,
          children: input.children,
          fieldMap: (input as any).fieldMap,
          owner: (input as any).owner,
          tags: (input as any).tags,
        };
        const expanded = expandChildren([topChild]);
        const stories = await createStoriesAndTasks(expanded, parent.ref, errors, cache);
        const result = stories[0];
        return jsonResult({ created: result, ...warnings(cache), ...(errors.length ? { errors } : {}) });
      } else {
        // children[] directly under the existing feature
        const storyChildren = expandChildren(input.children ?? []);
        const stories = await createStoriesAndTasks(storyChildren, parent.ref, errors, cache);
        return jsonResult({
          created: {
            formattedId: parent.formattedId,
            name: input.parentRef,
            ref: parent.ref,
            type: 'Feature',
            children: stories,
          },
          ...warnings(cache),
          ...(errors.length ? { errors } : {}),
        });
      }

    } else if (parentType === 'hierarchicalrequirement') {
      // User Story → create Tasks only
      const taskChildren = input.children ?? [];
      if (input.name) {
        taskChildren.unshift({ name: input.name, description: input.description });
      }
      const storyOwner = (input as any).owner;
      const tasks = await createTasksUnderStory(taskChildren, parent.ref, storyOwner, errors, cache);
      return jsonResult({
        created: {
          formattedId: parent.formattedId,
          name: input.parentRef,
          ref: parent.ref,
          type: 'UserStory',
          children: tasks,
        },
        ...warnings(cache),
        ...(errors.length ? { errors } : {}),
      });

    } else {
      return jsonResult({ success: false, error: `Unsupported parent type: ${parentType}. Must be Initiative, Feature, or User Story.` });
    }
  } catch (err: any) {
    return jsonResult({ success: false, error: err.message, ...warnings(cache), ...(errors.length ? { partialErrors: errors } : {}) });
  }
}

// ---------------------------------------------------------------------------
// Creation orchestration
// ---------------------------------------------------------------------------

async function createStoriesAndTasks(
  storyDefs: Child[],
  featureRef: string,
  errors: BatchError[],
  cache: LookupCache,
): Promise<CreatedArtifact[]> {
  // Create stories sequentially (Rally conflicts on parallel writes to same parent)
  const successfulStories: { story: CreatedArtifact; taskDefs: Child[]; storyOwner?: string }[] = [];
  for (const def of storyDefs) {
    try {
      // Build extras from owner + tags + fieldMap
      const extras: Record<string, any> = { ...def.fieldMap };
      let resolvedOwnerEmail: string | undefined;

      if (def.owner) {
        const ownerRef = await cache.resolveOwner(def.owner);
        if (ownerRef) {
          extras.Owner = ownerRef;
          resolvedOwnerEmail = def.owner;
        }
      }

      if (def.tags?.length) {
        const tagRefs = await cache.resolveTags(def.tags);
        if (tagRefs.length) extras.Tags = tagRefs;
      }

      const story = await createStory(def.name, def.description, featureRef, extras);
      if (resolvedOwnerEmail) story.owner = resolvedOwnerEmail;
      if (def.tags?.length) story.tags = def.tags;

      successfulStories.push({ story, taskDefs: def.children ?? [], storyOwner: def.owner });
    } catch (err: any) {
      errors.push({ name: def.name, intendedParent: featureRef, error: err.message });
    }
  }

  // Create tasks: sequential within each story, parallel across different stories
  await Promise.all(
    successfulStories.map(({ story, taskDefs, storyOwner }) =>
      createTasksSequentially(taskDefs, story, storyOwner, errors, cache),
    ),
  );

  return successfulStories.map(({ story }) => story);
}

async function createTasksSequentially(
  taskDefs: Child[],
  parent: CreatedArtifact,
  defaultOwner: string | undefined,
  errors: BatchError[],
  cache: LookupCache,
): Promise<void> {
  for (const taskDef of taskDefs) {
    try {
      const extras: Record<string, any> = { ...taskDef.fieldMap };
      const ownerEmail = taskDef.owner ?? defaultOwner;
      let resolvedOwnerEmail: string | undefined;

      if (ownerEmail) {
        const ownerRef = await cache.resolveOwner(ownerEmail);
        if (ownerRef) {
          extras.Owner = ownerRef;
          resolvedOwnerEmail = ownerEmail;
        }
      }

      const task = await createTask(taskDef.name, taskDef.description, parent.ref, extras);
      if (resolvedOwnerEmail) task.owner = resolvedOwnerEmail;

      if (!parent.children) parent.children = [];
      parent.children.push(task);
    } catch (err: any) {
      errors.push({ name: taskDef.name, intendedParent: parent.formattedId, error: err.message });
    }
  }
}

async function createTasksUnderStory(
  taskDefs: Child[],
  storyRef: string,
  defaultOwner: string | undefined,
  errors: BatchError[],
  cache: LookupCache,
): Promise<CreatedArtifact[]> {
  const tasks: CreatedArtifact[] = [];
  for (const def of taskDefs) {
    try {
      const extras: Record<string, any> = { ...def.fieldMap };
      const ownerEmail = def.owner ?? defaultOwner;
      let resolvedOwnerEmail: string | undefined;

      if (ownerEmail) {
        const ownerRef = await cache.resolveOwner(ownerEmail);
        if (ownerRef) {
          extras.Owner = ownerRef;
          resolvedOwnerEmail = ownerEmail;
        }
      }

      const task = await createTask(def.name, def.description, storyRef, extras);
      if (resolvedOwnerEmail) task.owner = resolvedOwnerEmail;
      tasks.push(task);
    } catch (err: any) {
      errors.push({ name: def.name, intendedParent: storyRef, error: err.message });
    }
  }
  return tasks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function warnings(cache: LookupCache) {
  return cache.warnings.length ? { warnings: cache.warnings } : {};
}

function jsonResult(data: Record<string, any>) {
  return { content: [{ type: 'text' as const, text: JSON.stringify(data) }] };
}

// ---------------------------------------------------------------------------
// Schema & registration
// ---------------------------------------------------------------------------

const childSchema: z.ZodType<Child> = z.lazy(() =>
  z.object({
    name: z.string().describe('Name of the child artifact'),
    description: z.string().optional().describe('Description (HTML allowed)'),
    template: z.enum(['artifact', 'training_delivery']).optional()
      .describe('Server-side template to expand into tasks. Mutually exclusive with children.'),
    children: z.array(childSchema).optional()
      .describe('Bespoke child artifacts. Mutually exclusive with template.'),
    fieldMap: z.record(z.any()).optional()
      .describe('Rally field overrides (ScheduleState, PlanEstimate, etc.)'),
    owner: z.string().optional()
      .describe('Owner email address — resolved to Rally user ref server-side'),
    tags: z.array(z.string()).optional()
      .describe('Tag names to apply (stories only) — auto-created if they don\'t exist'),
  }),
);

export const batchCreateSchema = {
  parentRef: z.string()
    .describe('FormattedID (e.g., I6, F13) or full Rally ref of the parent artifact'),
  name: z.string().optional()
    .describe('Name of the top-level artifact to create. Required when parentRef is an Initiative. Optional when parentRef is a Feature and children are provided directly.'),
  description: z.string().optional()
    .describe('Description for the top-level artifact.'),
  children: z.array(childSchema).optional()
    .describe('Child artifacts to create. Each can have a template or bespoke children.'),
};

export function registerBatchCreate(server: McpServer) {
  server.tool(
    'batchCreate',
    'Create multiple related Rally artifacts in one call — a Feature with Stories, Stories with Tasks, or a full tree. Use this INSTEAD OF sequential rally:createRallyArtifacts calls whenever you need to create more than 2 related artifacts. Parent type determines child types: Initiative parent creates Feature → Stories → Tasks. Feature parent creates Stories → Tasks. Supports owner (email, resolved server-side) and tags (auto-created if missing) on stories and tasks.',
    batchCreateSchema,
    handleBatchCreate,
  );
}
