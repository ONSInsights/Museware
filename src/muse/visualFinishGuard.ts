import { applyOps } from '../ops/apply';
import type { Action, ComponentNode, ProjectDoc, ScreenDoc } from '../types/tree';

export interface VisualFinishGuard {
  screen: ScreenDoc;
  /** Only approved explicit wiring and/or user's own instructions, not visual inference. */
  evidence: string;
  /** Exact media URLs the user supplied; unknown assets stay empty. */
  userText: string;
}

const functionalProps = new Set(['to', 'ctaTo', 'bindKey', 'interactive']);
const mediaProps = new Set(['src', 'image', 'poster']);
function stable(value: unknown): string {
  return JSON.stringify(value, (_key, item: unknown) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return item;
    return Object.fromEntries(
      Object.entries(item)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b)),
    );
  });
}
function withoutFunction(props: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(props).filter(
      ([key]) => !functionalProps.has(key) && !mediaProps.has(key),
    ),
  );
}
function allNodes(
  root: ComponentNode,
): Map<string, { node: ComponentNode; parent: string | null }> {
  const result = new Map<string, { node: ComponentNode; parent: string | null }>();
  const visit = (node: ComponentNode, parent: string | null) => {
    result.set(node.id, { node, parent });
    node.children.forEach((child) => visit(child, node.id));
  };
  visit(root, null);
  return result;
}
function normalize(value: string): string {
  return value.toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}
/** Conservative: if the plan cannot be tied to a specific element and action, don't invent it. */
function authorized(node: ComponentNode, target: unknown, evidence: string): boolean {
  if (typeof target !== 'string' || !target.trim()) return false;
  const labels = [node.id, node.props.text, node.props.label, node.name]
    .filter((part): part is string => typeof part === 'string' && part.trim().length >= 3)
    .map(normalize);
  const wanted = normalize(target);
  return evidence.split(/[\n;]+/).some((raw) => {
    const line = normalize(raw);
    return (
      labels.some((label) => line.includes(label)) &&
      line.includes(wanted) &&
      (/\b(click|tap|navigate|go to|goes to|opens?|links?|submit|toggle|change|set|routes?|button|when)\b/.test(
        line,
      ) ||
        /→|->/.test(line))
    );
  });
}
function actionAllowed(node: ComponentNode, action: Action, evidence: string): boolean {
  if (action.type === 'when')
    return (
      authorized(node, action.key, evidence) &&
      action.then.every((inner) => actionAllowed(node, inner, evidence))
    );
  if (action.type === 'navigate') return authorized(node, action.to, evidence);
  if (action.type === 'openUrl') return authorized(node, action.url, evidence);
  if (action.type === 'setState' || action.type === 'toggle')
    return authorized(node, action.key, evidence);
  if (action.type === 'toast') return authorized(node, action.text, evidence);
  return false;
}

/** Validate atomically on a temporary copy before the real project can change. */
export function validateVisualFinish(
  doc: ProjectDoc,
  guard: VisualFinishGuard,
  ops: unknown[],
): string | null {
  const allowed = new Set([
    'add',
    'remove',
    'move',
    'setProps',
    'setStyles',
    'setText',
    'rename',
    'setMockData',
  ]);
  if (
    ops.some(
      (raw) =>
        !raw ||
        typeof raw !== 'object' ||
        !allowed.has(String((raw as { op?: unknown }).op)),
    )
  )
    return 'Only edits to the chosen screen are allowed; screens and design tokens cannot be changed.';
  const staged = applyOps(ops, doc, { source: 'agent' });
  if (staged.errors.length)
    return staged.errors
      .map((error) => error.message)
      .join('; ')
      .slice(0, 1200);
  const selected = staged.doc.screens.find((screen) => screen.id === guard.screen.id);
  if (
    !selected ||
    stable(doc.screens.filter((screen) => screen.id !== guard.screen.id)) !==
      stable(staged.doc.screens.filter((screen) => screen.id !== guard.screen.id))
  )
    return 'The chosen screen and all other screens must remain in place.';
  const originalData =
    doc.screens.find((screen) => screen.id === guard.screen.id)?.mockData || {};
  for (const key of Object.keys(originalData))
    if (stable(selected.mockData?.[key]) !== stable(originalData[key]))
      return 'Existing screen data cannot be replaced during finishing.';
  const protectedNodes = allNodes(guard.screen.root);
  const after = allNodes(selected.root);
  for (const [id, saved] of protectedNodes) {
    const current = after.get(id);
    if (!current || current.parent !== saved.parent)
      return 'The chosen layout cannot be removed or moved.';
    const beforeNode = saved.node;
    const now = current.node;
    const core = (node: ComponentNode) => ({
      id: node.id,
      name: node.name,
      type: node.type,
      styles: node.styles,
      props: withoutFunction(node.props),
      visibleWhen: node.visibleWhen,
    });
    if (stable(core(beforeNode)) !== stable(core(now)))
      return 'The chosen layout, typography, content and styling cannot be changed.';
    const originalOrder = beforeNode.children.map((child) => child.id);
    const remainingOrder = now.children
      .filter((child) => protectedNodes.has(child.id))
      .map((child) => child.id);
    if (stable(originalOrder) !== stable(remainingOrder))
      return 'The chosen layout order cannot be changed.';
  }
  const before = allNodes(
    doc.screens.find((screen) => screen.id === guard.screen.id)!.root,
  );
  for (const [id, { node }] of after) {
    const old = before.get(id)?.node;
    if (stable(node.events) !== stable(old?.events) && node.events) {
      for (const actions of Object.values(node.events))
        for (const action of actions || [])
          if (!actionAllowed(node, action, guard.evidence))
            return `Interaction on ${id} is not explicitly supported by the approved instructions.`;
    }
    for (const key of functionalProps) {
      const value = node.props[key];
      if (
        stable(value) !== stable(old?.props[key]) &&
        value !== undefined &&
        value !== null &&
        value !== '' &&
        value !== false &&
        !authorized(node, value, guard.evidence)
      )
        return `Behavior ${key} on ${id} is not explicitly supported by the approved instructions.`;
    }
    for (const key of mediaProps) {
      const value = node.props[key];
      if (
        old &&
        typeof old.props[key] === 'string' &&
        old.props[key] &&
        value !== old.props[key]
      )
        return `Existing asset on ${id} cannot be replaced during finishing.`;
      if (
        typeof value === 'string' &&
        value &&
        value !== old?.props[key] &&
        !guard.userText.includes(value)
      )
        return `Asset on ${id} was not supplied by the user; leave a placeholder instead.`;
    }
  }
  return null;
}
