import { z } from 'zod';
import { nodeSchema, styleSchema } from '../types/tools';
import type { ProjectDoc } from '../types/tree';
import { MUSEWARE_DEFAULT_THEME, cloneTheme } from '../design/starter';
import { migrateLayoutV2 } from './migrate';
import { seedProjectTheme } from '../design/themeLibrary';
import { clone } from '../ops/treeUtils';

const styleSet = styleSchema;

const actionSchemaLoose = z
  .object({ type: z.string(), key: z.string().optional(), to: z.string().optional() })
  .passthrough();

const railCardSchema = z
  .object({
    kind: z.enum([
      'thinking',
      'build_choice',
      'blueprint',
      'choice',
      'color',
      'progress',
      'error',
      'key',
    ]),
    state: z.enum(['pending', 'answered', 'cancelled', 'expired']),
    data: z.record(z.unknown()),
  })
  .passthrough();

export const railEntrySchema = z
  .object({
    id: z.string().min(1),
    at: z.number(),
    role: z.enum(['user', 'agent', 'system', 'card']),
    text: z.string(),
    card: railCardSchema.optional(),
  })
  .passthrough();

export const mockRowsSchema = z.array(
  z.record(z.union([z.string(), z.number().finite(), z.boolean()])),
);

export const screenSchema = z
  .object({
    id: z.string().min(1).max(31),
    name: z.string().min(1).max(80),
    root: nodeSchema,
    entry: z.boolean().optional(),
    mockData: z.record(mockRowsSchema).optional(),
  })
  .passthrough();

const customComponentSchema = z
  .object({
    name: z.string().min(1).max(40),
    description: z.string().max(200).default(''),
    root: nodeSchema,
    preview: z.string().optional(),
  })
  .passthrough();

const tokensSchema = z
  .object({
    title: z.string().default('Imported theme'),
    specVersion: z.string().default('openui-1.0'),
    openuiTheme: z
      .object({
        brand_color: z.string().default('#2563EB'),
        secondary_color: z.string().default('#6366F1'),
        light_colors: z.record(z.string()).default({}),
        dark_colors: z.record(z.string()).default({}),
      })
      .passthrough(),
    tokens: z.array(z.record(z.unknown())).default([]),
  })
  .passthrough();

export const projectSchema = z
  .object({
    format: z.literal('museware/1'),
    name: z.string().min(1).max(80).default('Untitled project'),
    projectNameLocked: z.boolean().optional(),
    schemaVersion: z.number().default(3),
    designNotes: z
      .array(z.string().max(240))
      .default([])
      .transform((notes) => [...new Set(notes)].slice(-30)),
    themeLibrary: z
      .array(
        z.object({
          name: z.string(),
          theme: tokensSchema.shape.openuiTheme,
          updatedAt: z.number(),
        }),
      )
      .default([]),
    screens: z.array(screenSchema).default([]),
    tokens: tokensSchema.default(() => cloneTheme(MUSEWARE_DEFAULT_THEME) as never),
    opLog: z
      .array(
        z
          .object({
            at: z.number(),
            source: z.enum(['agent', 'user']),
            batch: z.array(z.record(z.unknown())).default([]),
            summary: z.string().default(''),
          })
          .passthrough(),
      )
      .default([]),
    rail: z.array(railEntrySchema).default([]),
    kind: z.enum(['web', 'app']).default('web'),
    customComponents: z.array(customComponentSchema).default([]),
    blueprint: z
      .object({ text: z.string(), decided: z.boolean(), updatedAt: z.number() })
      .optional(),
    automatedImageBudget: z
      .object({
        used: z.number().int().nonnegative(),
        cap: z.number().int().nonnegative().optional(),
      })
      .optional(),
    builtWithContributor: z.boolean().optional(),
    updatedAt: z.number().default(() => Date.now()),
  })
  .passthrough();

export { styleSet, actionSchemaLoose };

/** Import a project doc, merging import-safe defaults for anything missing. */
export function parseProjectDoc(
  input: unknown,
  options: { strict?: boolean } = {},
): ProjectDoc {
  /*
   * Migrate the RAW json before zod sees it: a v1 document may hold a style
   * value the dictionary now rejects (justify:'stretch'), and refusing to open
   * somebody's project to teach them a rule is the wrong trade. Migration
   * rewrites it to something valid and version-stamped, so this is a no-op on
   * the second load.
   */
  const migrated = migrateLayoutV2(input);
  let result = projectSchema.safeParse(migrated);
  let recovery: RecoveryDetails | undefined;
  if (!result.success && !options.strict) {
    const fixed = recoverProject(migrated);
    result = projectSchema.safeParse(fixed.value);
    recovery = fixed.details;
  }
  if (!result.success) throw result.error;
  const parsed = result.data as unknown as ProjectDoc;
  const doc: ProjectDoc = {
    ...parsed,
    tokens: {
      ...cloneTheme(MUSEWARE_DEFAULT_THEME),
      ...(parsed.tokens as typeof parsed.tokens),
    },
    rail: parsed.rail.map((entry) =>
      entry.role === 'user' ? { ...entry, text: entry.text.slice(0, 8000) } : entry,
    ),
    screens: parsed.screens.map((s) => ({
      ...s,
      root: {
        ...s.root,
        props: s.root.props || {},
        styles: s.root.styles || {},
        children: s.root.children || [],
      },
    })),
  };
  if (!doc.screens.length) doc.screens = [];
  if (doc.screens.length && !doc.screens.some((s) => s.entry)) doc.screens[0].entry = true;
  doc.layoutVersion = Math.max(2, doc.layoutVersion || 2);
  doc.schemaVersion = Math.max(3, doc.schemaVersion || 0);
  const finished = seedProjectTheme(doc);
  delete (finished as ProjectDoc & { recoveredFromSchema?: unknown }).recoveredFromSchema;
  if (recovery) {
    Object.defineProperty(finished, 'recoveredFromSchema', {
      value: true,
      enumerable: false,
    });
    recoveryDetails.set(finished, recovery);
  }
  return finished;
}

type RecoveryDetails = { name: boolean; styles: Map<string, number>; cells: number };
const recoveryDetails = new WeakMap<ProjectDoc, RecoveryDetails>();
export function wasRecovered(doc: ProjectDoc): boolean {
  return recoveryDetails.has(doc);
}
export function recoveryMessage(doc: ProjectDoc): string {
  const details = recoveryDetails.get(doc);
  const items: string[] = [];
  if (details?.name) items.push('name');
  details?.styles.forEach((count, screen) =>
    items.push(`${count} style value(s) on ${screen}`),
  );
  if (details?.cells) items.push(`${details.cells} data cell(s)`);
  return (
    'This project was saved by an older version of Museware. Your screens and design are here as far as recovery allows; chat history was cleared to open it, and a few older settings or data values that no longer fit were adjusted to current standards.' +
    (items.length ? ` Adjusted fields: ${items.join(', ')}.` : '')
  );
}

/** Only history and explicitly recoverable fields are changed; unknown art errors still fail closed. */
function recoverProject(input: unknown): { value: unknown; details: RecoveryDetails } {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw new Error('This project could not be recovered.');
  const doc = clone(input) as Record<string, unknown>;
  const details: RecoveryDetails = { name: false, styles: new Map(), cells: 0 };
  doc.opLog = [];
  doc.rail = [];
  if (typeof doc.name === 'string' && doc.name.length > 80) {
    doc.name = doc.name.slice(0, 80);
    details.name = true;
  }
  if (Array.isArray(doc.screens))
    for (const screen of doc.screens) {
      if (!screen || typeof screen !== 'object') continue;
      const data = (screen as Record<string, unknown>).mockData;
      if (!data || typeof data !== 'object' || Array.isArray(data)) continue;
      for (const rows of Object.values(data))
        if (Array.isArray(rows))
          for (const row of rows) {
            if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
            for (const [key, value] of Object.entries(row)) {
              if (
                !['string', 'number', 'boolean'].includes(typeof value) ||
                (typeof value === 'number' && !Number.isFinite(value))
              ) {
                (row as Record<string, unknown>)[key] = String(value);
                details.cells++;
              }
            }
          }
    }
  // Zod identifies invalid dictionary values precisely, including responsive styles.
  // Drop only the offending style member, never the containing widget or its props.
  for (let pass = 0; pass < 1000; pass++) {
    const parsed = projectSchema.safeParse(doc);
    if (parsed.success) break;
    let changed = false;
    for (const issue of parsed.error.issues) {
      const path = issue.path;
      const style = path.indexOf('styles');
      if (style < 0 || style === path.length - 1) continue;
      let parent: unknown = doc;
      for (const part of path.slice(0, -1)) {
        if (!parent || typeof parent !== 'object') {
          parent = null;
          break;
        }
        parent = (parent as Record<string | number, unknown>)[part];
      }
      const key = path[path.length - 1];
      if (parent && typeof parent === 'object' && Object.hasOwn(parent, key)) {
        delete (parent as Record<string | number, unknown>)[key];
        const index = path[0] === 'screens' && typeof path[1] === 'number' ? path[1] : -1;
        const screen =
          index >= 0 && Array.isArray(doc.screens)
            ? (doc.screens[index] as Record<string, unknown>)
            : undefined;
        const label = typeof screen?.name === 'string' ? screen.name : 'component';
        details.styles.set(label, (details.styles.get(label) || 0) + 1);
        changed = true;
      }
    }
    if (!changed) break;
  }
  return { value: doc, details };
}
