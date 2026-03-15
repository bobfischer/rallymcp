import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import pLimit from 'p-limit';
import { rallyPost, PROJECT_REF, RALLY_BASE_URL } from '../rally-client.js';
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
}

interface CreatedArtifact {
  formattedId: string;
  name: string;
  ref: string;
  type: string;
  children?: CreatedArtifact[];
}

interface BatchError {
  name: string;
  intendedParent: string;
  error: string;
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

  const result = await rallyPost(
    '/portfolioitem/feature/create?fetch=FormattedID,ObjectID,_ref,Name',
    { Feature: body },
  );
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
  fieldMap?: Record<string, any>,
): Promise<CreatedArtifact> {
  const body: Record<string, any> = {
    Name: name,
    Project: projectRef(),
    PortfolioItem: featureRef,
    ...fieldMap,
  };
  if (description) body.Description = description;

  const result = await rallyPost(
    '/hierarchicalrequirement/create?fetch=FormattedID,ObjectID,_ref,Name',
    { HierarchicalRequirement: body },
  );
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
  fieldMap?: Record<string, any>,
): Promise<CreatedArtifact> {
  const body: Record<string, any> = {
    Name: name,
    Project: projectRef(),
    WorkProduct: storyRef,
    ...fieldMap,
  };
  if (description) body.Description = description;

  const result = await rallyPost(
    '/task/create?fetch=FormattedID,ObjectID,_ref,Name',
    { Task: body },
  );
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

const CONCURRENCY = 5;

export async function handleBatchCreate(input: {
  parentRef: string;
  name?: string;
  description?: string;
  children?: Child[];
}) {
  const limit = pLimit(CONCURRENCY);
  const errors: BatchError[] = [];

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
      feature.children = await createStoriesAndTasks(storyChildren, feature.ref, limit, errors);
      return jsonResult({ created: feature, ...(errors.length ? { errors } : {}) });

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
        };
        const expanded = expandChildren([topChild]);
        const stories = await createStoriesAndTasks(expanded, parent.ref, limit, errors);
        // Return the single story as the created artifact
        const result = stories[0];
        return jsonResult({ created: result, ...(errors.length ? { errors } : {}) });
      } else {
        // children[] directly under the existing feature
        const storyChildren = expandChildren(input.children ?? []);
        const stories = await createStoriesAndTasks(storyChildren, parent.ref, limit, errors);
        return jsonResult({
          created: {
            formattedId: parent.formattedId,
            name: input.parentRef,
            ref: parent.ref,
            type: 'Feature',
            children: stories,
          },
          ...(errors.length ? { errors } : {}),
        });
      }

    } else if (parentType === 'hierarchicalrequirement') {
      // User Story → create Tasks only
      const taskChildren = input.children ?? [];
      if (input.name) {
        taskChildren.unshift({ name: input.name, description: input.description });
      }
      const tasks = await createTasks(taskChildren, parent.ref, limit, errors);
      return jsonResult({
        created: {
          formattedId: parent.formattedId,
          name: input.parentRef,
          ref: parent.ref,
          type: 'UserStory',
          children: tasks,
        },
        ...(errors.length ? { errors } : {}),
      });

    } else {
      return jsonResult({ success: false, error: `Unsupported parent type: ${parentType}. Must be Initiative, Feature, or User Story.` });
    }
  } catch (err: any) {
    return jsonResult({ success: false, error: err.message, ...(errors.length ? { partialErrors: errors } : {}) });
  }
}

// ---------------------------------------------------------------------------
// Parallel creation helpers
// ---------------------------------------------------------------------------

async function createStoriesAndTasks(
  storyDefs: Child[],
  featureRef: string,
  limit: ReturnType<typeof pLimit>,
  errors: BatchError[],
): Promise<CreatedArtifact[]> {
  // Create all stories in parallel
  const storyResults = await Promise.all(
    storyDefs.map((def) =>
      limit(async () => {
        try {
          const story = await createStory(def.name, def.description, featureRef, def.fieldMap);
          return { story, taskDefs: def.children ?? [], fieldMap: def.fieldMap };
        } catch (err: any) {
          errors.push({ name: def.name, intendedParent: featureRef, error: err.message });
          return null;
        }
      }),
    ),
  );

  // Create all tasks (across all stories) in parallel
  const successfulStories = storyResults.filter(Boolean) as {
    story: CreatedArtifact;
    taskDefs: Child[];
    fieldMap?: Record<string, any>;
  }[];

  await Promise.all(
    successfulStories.flatMap(({ story, taskDefs }) =>
      taskDefs.map((taskDef) =>
        limit(async () => {
          try {
            const task = await createTask(taskDef.name, taskDef.description, story.ref, taskDef.fieldMap);
            if (!story.children) story.children = [];
            story.children.push(task);
          } catch (err: any) {
            errors.push({ name: taskDef.name, intendedParent: story.formattedId, error: err.message });
          }
        }),
      ),
    ),
  );

  return successfulStories.map(({ story }) => story);
}

async function createTasks(
  taskDefs: Child[],
  storyRef: string,
  limit: ReturnType<typeof pLimit>,
  errors: BatchError[],
): Promise<CreatedArtifact[]> {
  const tasks: CreatedArtifact[] = [];
  await Promise.all(
    taskDefs.map((def) =>
      limit(async () => {
        try {
          const task = await createTask(def.name, def.description, storyRef, def.fieldMap);
          tasks.push(task);
        } catch (err: any) {
          errors.push({ name: def.name, intendedParent: storyRef, error: err.message });
        }
      }),
    ),
  );
  return tasks;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
    'Create multiple related Rally artifacts in one call — a Feature with Stories, Stories with Tasks, or a full tree. Use this INSTEAD OF sequential rally:createRallyArtifacts calls whenever you need to create more than 2 related artifacts. Parent type determines child types: Initiative parent creates Feature → Stories → Tasks. Feature parent creates Stories → Tasks. Much faster than individual calls — parallelizes creation across siblings.',
    batchCreateSchema,
    handleBatchCreate,
  );
}
