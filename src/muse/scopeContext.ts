import { spec } from '../types/library';
import type { ComponentNode, ProjectDoc } from '../types/tree';
import { findNodeInDoc, walk } from '../ops/treeUtils';
import { BUILDER_PROPS_PRIMER } from './propsPrimer';

const compact = (value: unknown, max: number) => JSON.stringify(value).slice(0, max);

/** One line per relevant type; children are the actual subtree, not guessed types. */
export function scopedPrimer(root: ComponentNode): string {
  const types = new Set<string>();
  walk(root, (node) => types.add(node.type));
  return BUILDER_PROPS_PRIMER.split('\n')
    .filter((line) => types.has(line.slice(0, line.indexOf('{'))))
    .join('\n');
}

/** Instruction and contextual additions share a single 2k budget. */
export function buildScopeContext(
  doc: ProjectDoc,
  rootId: string,
  instruction: string,
  feedback = '',
): string {
  const task = `Instruction: ${instruction.slice(0, 1000)}`;
  const hit = findNodeInDoc(doc, rootId);
  if (!hit) return task;
  const { node, screen } = hit;
  const def = spec(node.type);
  const defaults = def?.defaultProps || {};
  const variant =
    node.props.variant ??
    defaults.variant ??
    node.props.surface ??
    defaults.surface ??
    'none';
  const nonDefault = Object.fromEntries(
    Object.entries(node.props).filter(
      ([key, value]) => JSON.stringify(value) !== JSON.stringify(defaults[key]),
    ),
  );
  const styles = { ...def?.styles, ...node.styles };
  const responsive = node.styles.responsive || 'none';
  const dataKey = typeof node.props.dataKey === 'string' ? node.props.dataKey : '';
  const rows = dataKey ? screen.mockData?.[dataKey] || [] : [];
  const titles = rows.slice(0, 3).map((r) => String(r.title ?? r.name ?? ''));
  const chain: ComponentNode[] = [];
  const findPath = (current: ComponentNode): boolean => {
    chain.push(current);
    if (current.id === rootId) return true;
    if (current.children.some(findPath)) return true;
    chain.pop();
    return false;
  };
  findPath(screen.root);
  const parent = chain.at(-2);
  const index = parent?.children.findIndex((child) => child.id === rootId) ?? -1;
  const siblings =
    parent?.children
      .filter((child) => child.id !== rootId)
      .map(
        (child) =>
          `${parent.children.indexOf(child) < index ? 'before' : 'after'} ${child.type}#${child.id}`,
      ) || [];
  const ids = new Set<string>();
  walk(node, (child) => ids.add(child.id));
  const history = doc.opLog
    .filter((entry) =>
      entry.batch.some(
        (op) =>
          ('id' in op && ids.has(op.id)) || ('parentId' in op && ids.has(op.parentId)),
      ),
    )
    .slice(-5)
    .reverse()
    .map(
      (entry) =>
        `${entry.source} ${new Date(entry.at).toISOString()}: ${entry.summary}${entry.source === 'user' ? ' — do not undo user choices' : ''}`,
    );
  const notes = (doc.designNotes || [])
    .filter(
      (note) =>
        note.startsWith('global:') ||
        note.startsWith(`${node.id}:`) ||
        note.startsWith(`${node.type}:`) ||
        note.includes(` on ${node.id} `),
    )
    .slice(-10)
    .reverse();
  const lines = [
    feedback ? `SESSION FEEDBACK: ${feedback}` : '',
    `CURRENT LOOK: variant=${String(variant)}; look currently comes from variant "${String(variant)}" where not overridden — use setStyles or setProps variant to change it. props=${compact(nonDefault, 140)}, styles=${compact(styles, 150)}, responsive=${compact(responsive, 100)}, dataKey rows=${rows.length} (titles: ${titles.join(', ') || 'none'}).`,
    `PLACE: ${screen.name} (${doc.kind}); ${chain.map((n) => `${n.type}#${n.id}`).join(' > ')}; siblings:\n${siblings.join('\n') || 'none'}`,
    `NODE HISTORY: ${history.join(' | ') || 'none'}`,
    `PROJECT MEMORY: ${notes.join(' | ') || 'none'}`,
  ].filter(Boolean);
  const budget = Math.min(1500, 2000 - task.length - 1);
  // Reserve space for every category rather than letting a long look erase memory.
  const weights = feedback ? [0.22, 0.32, 0.13, 0.13, 0.2] : [0.4, 0.18, 0.18, 0.24];
  const usable = Math.max(0, budget - lines.length);
  const body = lines
    .map((line, i) => line.slice(0, Math.floor(usable * weights[i])))
    .join('\n');
  return `${task}\n${body}`;
}
