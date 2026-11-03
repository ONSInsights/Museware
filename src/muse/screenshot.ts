import type { ProjectDoc } from '../types/tree';
import { useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { useUi } from '../store/useUi';
import { chatStream, MuseError, estimateCents } from './client';
import { buildTokenSheet } from './tokenSheet';
import { buildProjectIndex } from './projectIndex';
import { offerKey, presentBlueprint } from './loop';
import { diagnose } from './connection';
import { SCREEN_HEAD } from './blueprintParse';

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read that image.'));
    reader.readAsDataURL(file);
  });
}

export interface SegmentBox {
  label: string;
  box: [number, number, number, number];
}

export interface SegmentNode {
  label: string;
  box: [number, number, number, number];
  depth: number;
  children: SegmentNode[];
}

const TOL = 2;

function area(box: [number, number, number, number]): number {
  return Math.max(0, box[2]) * Math.max(0, box[3]);
}

function contains(outer: SegmentBox['box'], inner: SegmentBox['box']): boolean {
  return (
    inner[0] >= outer[0] - TOL &&
    inner[1] >= outer[1] - TOL &&
    inner[0] + inner[2] <= outer[0] + outer[2] + TOL &&
    inner[1] + inner[3] <= outer[1] + outer[3] + TOL
  );
}

/**
 * §8.9 step 2: SAM returns a flat pile of boxes. Reading order (y, then x) is
 * what a human sees; containment is what the tree is. A box fully inside another
 * becomes its child, and a near-identical duplicate is dropped (SAM likes to
 * report the label AND the text inside it).
 */
function overlap(a: SegmentBox['box'], b: SegmentBox['box']): number {
  const x = Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0]));
  const y = Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
  const inter = x * y;
  const union = area(a) + area(b) - inter;
  return union <= 0 ? 0 : inter / union;
}

export function layoutSegments(boxes: SegmentBox[]): SegmentNode[] {
  const cleaned: SegmentBox[] = [];
  for (const item of boxes) {
    const dup = cleaned.some(
      (other) =>
        other.label.trim().toLowerCase() === item.label.trim().toLowerCase() &&
        overlap(other.box, item.box) > 0.6,
    );
    if (!dup) cleaned.push(item);
  }

  const ordered = [...cleaned].sort((a, b) => {
    const dy = a.box[1] - b.box[1];
    if (Math.abs(dy) > 6) return dy;
    return a.box[0] - b.box[0];
  });

  const nodes: SegmentNode[] = ordered.map((item) => ({
    label: item.label,
    box: item.box,
    depth: 0,
    children: [],
  }));

  // Smallest enclosing box wins, so a label inside a card inside a list row
  // lands on the card, not the row.
  const parentOf = new Map<SegmentNode, SegmentNode>();
  for (const node of nodes) {
    let best: SegmentNode | null = null;
    for (const other of nodes) {
      if (other === node) continue;
      if (!contains(other.box, node.box)) continue;
      if (area(other.box) <= area(node.box)) continue;
      if (!best || area(other.box) < area(best.box)) best = other;
    }
    if (best) parentOf.set(node, best);
  }

  // Guard against a containment cycle (identical boxes with different labels).
  for (const node of nodes) {
    let cursor = parentOf.get(node);
    let hops = 0;
    while (cursor && hops < 8) {
      if (cursor === node) {
        parentOf.delete(node);
        break;
      }
      cursor = parentOf.get(cursor);
      hops += 1;
    }
  }

  const roots: SegmentNode[] = [];
  for (const node of nodes) {
    const parent = parentOf.get(node);
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const setDepth = (list: SegmentNode[], depth: number) => {
    for (const node of list) {
      node.depth = depth;
      setDepth(node.children, depth + 1);
    }
  };
  setDepth(roots, 0);
  return roots;
}

/** Depth-first, reading order — the order the model should name them in. */
export function flattenSegments(roots: SegmentNode[]): SegmentNode[] {
  const out: SegmentNode[] = [];
  const walk = (list: SegmentNode[]) => {
    for (const node of list) {
      out.push(node);
      walk(node.children);
    }
  };
  walk(roots);
  return out;
}

/**
 * The one batched prompt input: every element with its geometry, its depth and
 * its index. The model answers per index, so nothing is skipped or re-asked.
 */
export function elementsOutline(roots: SegmentNode[], limit = 40): string {
  const rows = flattenSegments(roots).slice(0, limit);
  return rows
    .map((node, i) => {
      const [x, y, w, h] = node.box.map((n) => Math.round(n));
      const pad = '  '.repeat(Math.min(node.depth, 6));
      return `${i + 1}. ${pad}${node.label} @ ${x},${y} ${w}x${h}`;
    })
    .join('\n');
}

async function describeBlueprint(
  doc: ProjectDoc,
  imageUrl: string,
  instruction: string,
): Promise<{ text: string; finishReason: string }> {
  const sheet = buildTokenSheet(doc.tokens);
  const index = buildProjectIndex(doc).slice(0, 1400);
  const model = useAgent.getState().models?.chat.id || 'muse-spark-1.3';
  const started = Date.now();
  let result;
  try {
    result = await chatStream({
      model,
      effort: 'low',
      messages: [
        {
          role: 'system',
          content: `You recreate UIs as Museware blueprints. Format exactly: RULES, then "SCREEN: <Name>", component lines "- <id> (<type>) <what it does>", a LOOK line with hard numbers, STATE, WIRING. Library types only (screen, row, col, grid, card, hero, section, form, heading, text, label, badge, button, input, image, list, table, stat, chart, navbar, bottomnav, link, icon, avatar, progress). Match the reference closely. Describe visible colours honestly; do not claim exact colour values you cannot determine. Honor a user-supplied design system when explicitly provided, otherwise do not impose the default look. Keep copy verbatim.\n\nTOKEN SHEET:\n${sheet}\n\nEXISTING CANVAS (keep ids unique):\n${index}`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Recreate the provided screenshot as an editable, responsive screen blueprint. Match the reference as closely as the available components permit. Inspect the image directly. Describe the visible layout, hierarchy, colours, typography, spacing and copy as accurately as possible. Do not invent working interactions. If a detail is unclear, say so rather than guessing. User instructions: ${instruction || 'Recreate this screenshot.'}`,
            },
            { type: 'image_url', image_url: { url: imageUrl } },
          ] as unknown as string,
        },
      ],
      maxTokens: 4096,
    });
  } catch (error) {
    const source = useAgent.getState().keySource;
    useAgent.getState().addReceipt({
      role: 'vision',
      model,
      status: 'failed',
      latencyMs: Date.now() - started,
      promptChars: sheet.length + index.length,
      toolNames: [],
      ...(source === 'none'
        ? {}
        : { key: source === 'session' ? ('user' as const) : ('house' as const) }),
    });
    throw error;
  }
  useAgent.getState().addReceipt({
    role: 'vision',
    model: result.model,
    ...(!result.text.trim() || result.finishReason === 'length' ? { status: 'failed' as const } : {}),
    latencyMs: result.latencyMs,
    promptChars: sheet.length + index.length,
    toolNames: [],
    inputTokens: result.usage.inputTokens,
    outputTokens: result.usage.outputTokens,
    cachedTokens: result.usage.cachedTokens,
    cents: estimateCents(result.model, result.usage),
    ...(useAgent.getState().keySource === 'none'
      ? {}
      : {
          key:
            useAgent.getState().keySource === 'session'
              ? ('user' as const)
              : ('house' as const),
        }),
  });
  return { text: result.text, finishReason: result.finishReason };
}

/** Screenshot → vision → text blueprint approval. SAM remains available separately. */
export async function recreateFromScreenshot(file: File, instruction = ''): Promise<void> {
  const agent = useAgent.getState();
  const addSystem = (text: string) =>
    useProject.getState().addRail({ role: 'system', text });
  const addAgent = (text: string) => useProject.getState().addRail({ role: 'agent', text });
  try {
    const dataUrl = await readAsDataUrl(file);
    useAgent.getState().setScreenshotPreview({ image: dataUrl, boxes: [] });
    // Only an explicitly chosen local engine pre-empts the pipeline. A stale or
    // failed boot status must NOT: if a key exists, dropping a screenshot should
    // just work, and if it truly does not, the proxy will say so in its own words.
    if (agent.demoMode) {
      if (agent.statusError) {
        addSystem(
          `The muse proxy is not answering on this deployment (${agent.statusError}), so the local engine is running. Vision needs the proxy.`,
        );
      } else {
        addSystem(
          'The local engine is on, and it has no vision model. That is a setting, not a suggestion that you did something wrong.',
        );
      }
      addAgent(
        'I can still build this from words: describe the screen in one line ("a habit tracker home with today\'s progress and a habit list") and I will propose the blueprint. Canvas, drag/drop, inspector and Run mode all work without a key.',
      );
      useUi.getState().toast('No vision without the proxy — describe it instead.', 'warn');
      return;
    }
    useAgent.getState().startTurn();
    useAgent.getState().setLive('Reading the screenshot with the vision model…');
    addSystem('Screenshot received — asking the vision model for a blueprint…');
    const result = await describeBlueprint(useProject.getState().doc, dataUrl, instruction);
    if (!result.text.trim() || result.finishReason === 'length') {
      addAgent(
        result.finishReason === 'length'
          ? 'The vision response stopped before it was complete, so no blueprint was created. Please retry or describe the screen in words.'
          : 'The vision model returned no usable blueprint. Please retry or describe the screen in words.',
      );
      return;
    }
    const blueprint = result.text;
    if (!blueprint.split('\n').some((line) => SCREEN_HEAD.test(line))) {
      addAgent('The vision model did not return a usable screen blueprint. Please retry or describe the screen in words.');
      return;
    }
    presentBlueprint(blueprint);
    addSystem('Recreation drafted — approve it to fill the screen, or adjust.');
  } catch (err) {
    if (err instanceof MuseError && err.code === 'aborted') return;
    const why = diagnose(err);
    addSystem(
      why.kind === 'other'
        ? `Screenshot pipeline failed: ${why.text}`
        : `Screenshot pipeline stopped: ${why.text}`,
    );
    if (why.offerKey) offerKey(why.text, '');
  } finally {
    useAgent.getState().endTurn();
    useAgent.getState().setLive(null);
  }
}
