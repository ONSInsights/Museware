/**
 * Isolated visual directions. This module never touches the project store:
 * every model operation is validated against a private document copy.
 * Nothing here is a finished project until a caller explicitly commits it.
 */
import { applyOps } from '../ops/apply';
import { clone } from '../ops/treeUtils';
import { createProject } from '../store/useProject';
import { toolSchemas } from '../types/tools';
import type { ProjectDoc, ScreenDoc } from '../types/tree';
import { parseBlueprint } from './blueprintParse';
import { buildTokenSheet } from './tokenSheet';
import type { ChatMessage, ChatOptions, ChatResult } from './client';

export interface VisualDraft {
  label: string;
  screen: ScreenDoc;
  /** A private rendering document, not the user's saved project. */
  document: ProjectDoc;
}
/** Design changes, unlike chat receipts, invalidate a candidate. */
export function visualBaseline(doc: ProjectDoc): string {
  return JSON.stringify({
    screens: doc.screens,
    tokens: doc.tokens,
    kind: doc.kind,
    blueprint: doc.blueprint?.text,
  });
}
export interface VisualDraftRequest {
  project: ProjectDoc;
  blueprint: string;
  reference?: string | null;
  signal: AbortSignal;
  tools: unknown[];
  model: string;
  request: (options: ChatOptions) => Promise<ChatResult>;
  onProgress?: (direction: number, call: number) => void;
}

/** Never let a draft quietly introduce an interaction or a guessed remote asset. */
function unsafeDraftValue(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  if (Array.isArray(value)) return value.some(unsafeDraftValue);
  return Object.entries(value).some(
    ([key, part]) =>
      (['events', 'src', 'image', 'poster', 'to', 'ctaTo', 'href'].includes(key) &&
        part !== undefined &&
        part !== null &&
        part !== '') ||
      unsafeDraftValue(part),
  );
}

function visualSignature(screen: ScreenDoc): string {
  return JSON.stringify(screen.root, (key, value: unknown) =>
    [
      'id',
      'name',
      'text',
      'label',
      'title',
      'subtitle',
      'description',
      'placeholder',
    ].includes(key)
      ? undefined
      : value,
  );
}

/**
 * Generate three separately built partial-screen drafts. A failed or stopped
 * run returns no candidates; no fake direction is substituted for a failure.
 */
export async function generateVisualDrafts(
  input: VisualDraftRequest,
): Promise<VisualDraft[]> {
  const plan = parseBlueprint(input.blueprint, input.project.tokens);
  const firstTarget = plan.screens[0];
  if (!firstTarget) throw new Error('This plan has no recognizable screen to preview.');
  const existing = input.project.screens.find((screen) => screen.id === firstTarget.id);
  if (existing?.root.children.length)
    throw new Error(
      'The first planned screen already has content. Visual drafts cannot safely replace it; keep your existing screen or start a new screen.',
    );
  const target = existing ? clone(existing) : firstTarget;
  const brief = input.project.rail
    .filter((entry) => entry.role === 'user')
    .slice(-8)
    .map((entry) => entry.text.slice(0, 1000))
    .join('\n');
  const drafts: VisualDraft[] = [];
  const signatures = new Set<string>();
  for (let direction = 1; direction <= 3; direction += 1) {
    if (input.signal.aborted) throw new Error('Preview generation stopped.');
    let doc = createProject('Temporary preview');
    doc.kind = input.project.kind;
    doc.tokens = clone(input.project.tokens);
    const initial = applyOps(
      [
        {
          op: 'addScreen',
          screen: { ...target, entry: true, root: { ...target.root, children: [] } },
        },
      ],
      doc,
      { source: 'agent', screenAddsThisTurn: 0 },
    );
    if (initial.errors.length)
      throw new Error('The preview screen could not be created safely.');
    doc = initial.doc;
    const messages: ChatMessage[] = [
      {
        role: 'system',
        content:
          'Create an editable visual draft of the FIRST screen only. Use edit_canvas to build as much of that screen from the approved plan as you can, then finish. The chosen draft will be kept rather than rebuilt, so do not omit important planned content. Design for the actual brief and approved tokens; do not change tokens. Make this direction visually distinct from the others while honoring the brief and reference. Do not add events, links, navigation targets, image URLs or video sources. Missing images must be empty image placeholders. Do not create additional screens. All operations are isolated and validated. Use the existing screen root ID; add parents before children. Never pretend the preview is the complete app.',
      },
      {
        role: 'user',
        content: `Direction ${direction} of 3. Design a distinct layout and visual treatment, not merely a palette variation.\nUSER BRIEF AND RECENT CORRECTIONS:\n${brief}\nCURRENT BLUEPRINT:\n${input.blueprint.slice(0, 14000)}\nTOKENS:\n${buildTokenSheet(doc.tokens)}\nSCREEN: ${target.name}; root id: ${target.root.id}.`,
      },
    ];
    if (input.reference)
      messages.push({
        role: 'user',
        content: [
          {
            type: 'text',
            text: 'This is the supplied reference; respect it and the user brief. Never use this image itself as an asset.',
          },
          { type: 'image_url', image_url: { url: input.reference } },
        ] as unknown as string,
      });
    let finished = false;
    for (let call = 1; call <= 8; call += 1) {
      if (input.signal.aborted) throw new Error('Preview generation stopped.');
      input.onProgress?.(direction, call);
      const result = await input.request({
        model: input.model,
        effort: 'medium',
        messages,
        tools: input.tools,
        signal: input.signal,
      });
      if (input.signal.aborted) throw new Error('Preview generation stopped.');
      if (result.finishReason === 'length')
        throw new Error(`Direction ${direction} was cut off before completion.`);
      if (!result.toolCalls.length)
        throw new Error(`Direction ${direction} did not return an editable draft.`);
      messages.push({
        role: 'assistant',
        content: result.text || '',
        tool_calls: result.toolCalls.map((t) => ({
          id: t.id,
          type: 'function' as const,
          function: { name: t.name, arguments: t.arguments },
        })),
      });
      for (const callResult of result.toolCalls) {
        if (finished) break;
        let response = 'Rejected: only safe draft edits and finish are allowed.';
        let args: unknown;
        try {
          args = JSON.parse(callResult.arguments);
        } catch {
          args = null;
        }
        if (callResult.name === 'finish') {
          const parsed = toolSchemas.finish.safeParse(args);
          if (parsed.success && doc.screens[0]?.root.children.length) {
            finished = true;
            response = 'Draft complete.';
          } else response = 'Add visible content before finishing.';
        } else if (callResult.name === 'edit_canvas') {
          const parsed = toolSchemas.edit_canvas.safeParse(args);
          if (!parsed.success) response = 'Rejected: invalid operation format.';
          else if (
            parsed.data.ops.some(
              (op) =>
                ![
                  'add',
                  'remove',
                  'move',
                  'setProps',
                  'setStyles',
                  'setText',
                  'rename',
                ].includes(op.op) || unsafeDraftValue(op),
            )
          )
            response =
              'Rejected: only screen edits without interactions or external assets are allowed.';
          else {
            const staged = applyOps(parsed.data.ops, doc, { source: 'agent' });
            if (staged.errors.length)
              response = `Rejected: ${staged.errors
                .map((e) => e.message)
                .join('; ')
                .slice(0, 1200)}`;
            else {
              doc = staged.doc;
              response = 'Applied to the isolated preview only.';
            }
          }
        }
        messages.push({ role: 'tool', tool_call_id: callResult.id, content: response });
      }
      if (finished) break;
    }
    if (!finished)
      throw new Error(`Direction ${direction} did not finish; no drafts were applied.`);
    const screen = clone(doc.screens[0]);
    const signature = visualSignature(screen);
    if (signatures.has(signature))
      throw new Error(
        'The model returned duplicate directions; no drafts were applied. Please retry.',
      );
    signatures.add(signature);
    drafts.push({ label: `Direction ${direction}`, screen, document: doc });
  }
  return drafts;
}

let activePreview: AbortController | null = null;
export function setVisualPreviewController(controller: AbortController | null): void {
  activePreview = controller;
}
export function stopVisualPreview(): void {
  activePreview?.abort();
}
