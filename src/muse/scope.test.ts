import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyScreen } from '../ops/screenOps';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { useUi } from '../store/useUi';
import type { ComponentNode } from '../types/tree';
import { chatStream, type ChatResult } from './client';
import { decisionLedger, runScopedAction } from './loop';

vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  chatStream: vi.fn(),
}));
const node = (
  id: string,
  type: ComponentNode['type'],
  children: ComponentNode[] = [],
): ComponentNode => ({
  id,
  type,
  props: type === 'text' ? { text: id } : {},
  styles: {},
  children,
});
const reply = (name: string, args: unknown): ChatResult => ({
  text: '',
  toolCalls: [{ id: name, name, arguments: JSON.stringify(args) }],
  finishReason: 'tool_calls',
  model: 'test',
  latencyMs: 1,
  usage: { inputTokens: 1, outputTokens: 1, cachedTokens: 0, totalTokens: 2 },
});
const finish = () => reply('finish', { summary: 'Done.' });
beforeEach(() => {
  vi.mocked(chatStream).mockReset();
  const a = emptyScreen('A', { id: 'aaa', entry: true });
  a.root.children = [
    node('section_a', 'col', [node('text_aaa', 'text')]),
    node('section_b', 'col', [node('text_bbb', 'text')]),
  ];
  const b = emptyScreen('B', { id: 'bbb' });
  b.root.children = [node('text_ccc', 'text')];
  useProject.getState().replaceDoc({ ...createProject(), screens: [a, b] });
  useAgent.setState({
    demoMode: false,
    keySource: 'session',
    models: null,
    contributorMode: false,
    receipts: [],
  });
});
describe('scoped redesign', () => {
  it('drops foreign ops, groups all accepted edits into one undo, and records the decision', async () => {
    const before = structuredClone(useProject.getState().doc);
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [
            { op: 'setText', id: 'text_aaa', text: 'New copy' },
            { op: 'setText', id: 'text_bbb', text: 'Forbidden' },
            { op: 'removeScreen', id: 'bbb' },
            {
              op: 'add',
              parentId: 'section_a',
              node: { id: 'added_one', type: 'text', props: { text: 'Added' } },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [{ op: 'setStyles', id: 'added_one', styles: { color: 'red' } }],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('section_a', 'Make it better');
    const after = useProject.getState().doc;
    expect(after.screens[1]).toEqual(before.screens[1]);
    expect(after.screens[0].root.children[1]).toEqual(before.screens[0].root.children[1]);
    expect(after.screens[0].root.children[0].children[0].props.text).toBe('New copy');
    expect(after.screens[0].root.children[0].children[1].styles.color).toBe('red');
    expect(after.rail.some((r) => r.text.includes('dropped 2'))).toBe(true);
    expect(decisionLedger(after)).toContain('section section_a redesigned at');
    expect(
      useAgent.getState().receipts.filter((r) => r.role === 'scope:section_a'),
    ).toHaveLength(1);
    expect(useProject.getState().undoStack).toHaveLength(1);
    useProject.getState().undo();
    expect(useProject.getState().doc.screens).toEqual(before.screens);
  });
  it('styles-only allows only styling the chosen widget', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [
            { op: 'setText', id: 'text_aaa', text: 'bad' },
            { op: 'setStyles', id: 'text_bbb', styles: { color: 'red' } },
            { op: 'setStyles', id: 'text_aaa', styles: { color: 'blue' } },
          ],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('text_aaa', 'Blue', true);
    const a = useProject.getState().doc.screens[0].root.children;
    expect(a[0].children[0].props.text).toBe('text_aaa');
    expect(a[0].children[0].styles.color).toBe('blue');
    expect(a[1].children[0].styles.color).toBeUndefined();
  });
  it('does not overwrite a concurrent edit to the selection', async () => {
    vi.mocked(chatStream)
      .mockImplementationOnce(async () => {
        useProject
          .getState()
          .applyBatch([{ op: 'setText', id: 'text_aaa', text: 'User edit' }], {
            source: 'user',
          });
        return reply('edit_canvas', {
          ops: [{ op: 'setText', id: 'text_aaa', text: 'Agent edit' }],
        });
      })
      .mockResolvedValueOnce(finish());
    await runScopedAction('section_a', 'Redesign');
    expect(
      useProject.getState().doc.screens[0].root.children[0].children[0].props.text,
    ).toBe('User edit');
    expect(
      useProject.getState().doc.rail.some((r) => r.text.includes('selection changed')),
    ).toBe(true);
  });
  it('does not apply staged work after the project is replaced, even with identical ids', async () => {
    vi.mocked(chatStream)
      .mockImplementationOnce(async () => {
        useProject.getState().replaceDoc(structuredClone(useProject.getState().doc));
        return reply('edit_canvas', {
          ops: [{ op: 'setText', id: 'text_aaa', text: 'Agent edit' }],
        });
      })
      .mockResolvedValueOnce(finish());
    await runScopedAction('section_a', 'Redesign');
    expect(
      useProject.getState().doc.screens[0].root.children[0].children[0].props.text,
    ).toBe('text_aaa');
  });

  it('preserves concurrent changes outside the scope through undo', async () => {
    vi.mocked(chatStream)
      .mockImplementationOnce(async () => {
        useProject
          .getState()
          .applyBatch([{ op: 'setText', id: 'text_bbb', text: 'Other edit' }], {
            source: 'user',
          });
        return reply('edit_canvas', {
          ops: [{ op: 'setText', id: 'text_aaa', text: 'Agent edit' }],
        });
      })
      .mockResolvedValueOnce(finish());
    await runScopedAction('section_a', 'Redesign');
    useProject.getState().undo();
    const nodes = useProject.getState().doc.screens[0].root.children;
    expect(nodes[0].children[0].props.text).toBe('text_aaa');
    expect(nodes[1].children[0].props.text).toBe('Other edit');
  });
});

describe('scoped edits that listen', () => {
  it('routes text intent to full mode and supplies design law and current state', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [{ op: 'setProps', id: 'text_aaa', props: { text: 'Shop now' } }],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('text_aaa', 'Change the label to Shop now', true);
    const sent = vi.mocked(chatStream).mock.calls[0][0].messages;
    expect(sent[0].content).toContain('Design law: colors ONLY');
    expect(sent[0].content).toContain('WIDGET PROPS from the library:');
    expect(sent[0].content).toContain('text{');
    expect(sent[0].content).not.toContain('chart{');
    expect(sent[0].content).toContain(
      'fontWeight supports 300, 400, 500, 600, 700 and 800',
    );
    expect(sent[0].content).toContain('setStyles MERGES');
    expect(sent[1].content).toContain('CURRENT LOOK:');
    expect(sent[1].content).toContain('text_aaa');
    expect(
      useProject.getState().doc.screens[0].root.children[0].children[0].props.text,
    ).toBe('Shop now');
    expect(
      useProject.getState().doc.rail.some((r) => r.text.includes('content + style edit')),
    ).toBe(true);
  });
  it('allows explicitly requested lighter typography without touching another section', async () => {
    const other = structuredClone(useProject.getState().doc.screens[0].root.children[1]);
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [
            { op: 'setStyles', id: 'text_aaa', styles: { fontWeight: 300 } },
            { op: 'setStyles', id: 'text_bbb', styles: { fontWeight: 300 } },
          ],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('text_aaa', 'Make the type light, weight 300', true);
    const children = useProject.getState().doc.screens[0].root.children;
    expect(children[0].children[0].styles.fontWeight).toBe(300);
    expect(children[1]).toEqual(other);
    expect(vi.mocked(chatStream).mock.calls[0][0].messages[0].content).toContain(
      '300, 400, 500, 600, 700 and 800',
    );
  });
  it('names content operations that a styles-only run drops', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [
            { op: 'setProps', id: 'text_aaa', props: { text: 'no' } },
            { op: 'setText', id: 'text_aaa', text: 'no' },
            { op: 'setStyles', id: 'text_aaa', styles: { color: 'blue' } },
          ],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('text_aaa', 'Make it blue', true);
    expect(
      useProject
        .getState()
        .doc.rail.some((r) =>
          r.text.includes(
            'dropped: setProps(text), setText — use style-semantic select, toggle, icon or tone props, or flip the box to full edit',
          ),
        ),
    ).toBe(true);
  });
  it('allows navbar variant but rejects a mixed style and content operation', async () => {
    const page = useProject.getState().doc.screens[0];
    page.root.children[0].children.push(node('nav_aaa', 'navbar'));
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [
            { op: 'setProps', id: 'nav_aaa', props: { variant: 'glass' } },
            {
              op: 'setProps',
              id: 'nav_aaa',
              props: { variant: 'minimal', brand: 'Changed' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('nav_aaa', 'Make it glass', true);
    const nav = useProject.getState().doc.screens[0].root.children[0].children[1];
    expect(nav.props.variant).toBe('glass');
    expect(nav.props.brand).toBeUndefined();
    expect(
      useProject
        .getState()
        .doc.rail.some((r) => r.text.includes('or flip the box to full edit')),
    ).toBe(true);
    expect(vi.mocked(chatStream)).toHaveBeenCalledTimes(2);
  });
  it('retries exactly once in full subtree mode when all operations were blocked', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', { ops: [{ op: 'setText', id: 'text_aaa', text: 'First' }] }),
      )
      .mockResolvedValueOnce(finish())
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [
            { op: 'setText', id: 'text_aaa', text: 'Retried' },
            { op: 'setText', id: 'text_bbb', text: 'Forbidden' },
          ],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('section_a', 'Make it better', true);
    const doc = useProject.getState().doc;
    expect(doc.screens[0].root.children[0].children[0].props.text).toBe('Retried');
    expect(doc.screens[0].root.children[1].children[0].props.text).toBe('text_bbb');
    expect(
      doc.rail.filter((r) => r.text.includes('retrying with content edits allowed')),
    ).toHaveLength(1);
    expect(vi.mocked(chatStream)).toHaveBeenCalledTimes(4);
    expect(vi.mocked(chatStream).mock.calls[2][0].messages[1].content).toContain(
      'Instruction: Make it better',
    );
    expect(vi.mocked(chatStream).mock.calls[2][0].messages[1].content).toContain(
      'setText on text_aaa was blocked',
    );
    expect(vi.mocked(chatStream).mock.calls[2][0].messages[1].content).toContain(
      'content setProps are now permitted',
    );
    expect(useProject.getState().undoStack).toHaveLength(1);
  });
  it('preserves scoped preferences for later widgets and slices the tool primer too', async () => {
    useProject
      .getState()
      .doc.screens[0].root.children[0].children.push(node('nav_main', 'navbar'));
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [{ op: 'setStyles', id: 'nav_main', styles: { position: 'sticky' } }],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('nav_main', 'always stay sticky', true);
    expect(
      useProject
        .getState()
        .doc.designNotes?.some(
          (n) =>
            n.includes('global: user preference for nav_main') &&
            n.includes('always stay sticky'),
        ),
    ).toBe(true);
    const call = vi.mocked(chatStream).mock.calls[0][0];
    expect(call.messages[0].content).toContain('navbar{');
    expect(call.messages[0].content).not.toContain('chart{');
    const tool = (
      call.tools as Array<{ function: { name: string; description?: string } }>
    ).find((t) => t.function.name === 'edit_canvas');
    expect(tool?.function.description).toContain('navbar{');
    expect(tool?.function.description).not.toContain('chart{');
  });
  it('reports the blocked setProps reason and count to the single retry', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [{ op: 'setProps', id: 'text_aaa', props: { variant: 'glass' } }],
        }),
      )
      .mockResolvedValueOnce(finish())
      .mockResolvedValueOnce(
        reply('edit_canvas', { ops: [{ op: 'setText', id: 'text_aaa', text: 'changed' }] }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('text_aaa', 'Make it better', true);
    const retry = vi.mocked(chatStream).mock.calls[2][0].messages[1].content;
    expect(retry).toContain('1 dropped: setProps(variant) on text_aaa was blocked');
    expect(retry).toContain('content setProps are now permitted');
  });
  it('warns about rgba in a changed style and undoes exactly its group', async () => {
    const before = structuredClone(useProject.getState().doc.screens);
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [
            {
              op: 'setStyles',
              id: 'text_aaa',
              styles: { boxShadow: '0 2px 4px rgba(0,0,0,.2)' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('text_aaa', 'Add a shadow', true);
    expect(
      useProject
        .getState()
        .doc.rail.some((r) =>
          r.text.includes('warn: raw color in boxShadow — use a token'),
        ),
    ).toBe(true);
    const toast = useUi.getState().toasts.at(-1);
    expect(toast?.action?.label).toBe('Undo');
    toast?.action?.run();
    expect(useProject.getState().doc.screens).toEqual(before);
  });
  it('refuses a stale undo rather than undoing a later edit', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [{ op: 'setStyles', id: 'text_aaa', styles: { color: 'blue' } }],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('text_aaa', 'Blue', true);
    const action = useUi.getState().toasts.at(-1)?.action;
    useProject
      .getState()
      .applyBatch([{ op: 'setText', id: 'text_bbb', text: 'Later' }], { source: 'user' });
    action?.run();
    expect(
      useProject.getState().doc.screens[0].root.children[1].children[0].props.text,
    ).toBe('Later');
  });
  it('batches only same-type nodes on the same screen, in one undo group', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [{ op: 'setStyles', id: 'text_aaa', styles: { color: 'blue' } }],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('text_aaa', 'Blue', true);
    const batch = useProject.getState().doc.rail.find((r) => r.scopedBatch)?.scopedBatch;
    expect(batch).toMatchObject({
      nodeId: 'text_aaa',
      screenId: 'aaa',
      type: 'text',
      count: 2,
      instruction: 'Blue',
    });
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [
            { op: 'setStyles', id: 'text_aaa', styles: { color: 'red' } },
            { op: 'setStyles', id: 'text_bbb', styles: { color: 'red' } },
            { op: 'setStyles', id: 'section_a', styles: { color: 'red' } },
            { op: 'setStyles', id: 'text_ccc', styles: { color: 'red' } },
          ],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction(batch!.nodeId, batch!.instruction, true, {
      screenId: batch!.screenId,
      type: batch!.type,
    });
    const doc = useProject.getState().doc;
    expect(doc.screens[0].root.children[0].children[0].styles.color).toBe('red');
    expect(doc.screens[0].root.children[1].children[0].styles.color).toBe('red');
    expect(doc.screens[0].root.children[0].styles.color).toBeUndefined();
    expect(doc.screens[1].root.children[0].styles.color).toBeUndefined();
    useProject.getState().undo();
    expect(
      useProject.getState().doc.screens[0].root.children[0].children[0].styles.color,
    ).toBe('blue');
    expect(
      useProject.getState().doc.screens[0].root.children[1].children[0].styles.color,
    ).toBeUndefined();
  });
  it('discards a partial batch instead of claiming all widgets were changed', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [{ op: 'setStyles', id: 'text_aaa', styles: { color: 'blue' } }],
        }),
      )
      .mockResolvedValueOnce(finish());
    await runScopedAction('text_aaa', 'Blue', true, { screenId: 'aaa', type: 'text' });
    expect(
      useProject.getState().doc.screens[0].root.children[0].children[0].styles.color,
    ).toBeUndefined();
    expect(
      useProject
        .getState()
        .doc.rail.some((r) => r.text.includes('did not cover every matching widget')),
    ).toBe(true);
  });
  it('refuses a batch over 20 without a model call', async () => {
    const doc = structuredClone(useProject.getState().doc);
    doc.screens[0].root.children.push(
      ...Array.from({ length: 19 }, (_, i) => node(`extra_${i}`, 'text')),
    );
    useProject.getState().replaceDoc(doc);
    await runScopedAction('text_aaa', 'Blue', true, { screenId: 'aaa', type: 'text' });
    expect(chatStream).not.toHaveBeenCalled();
    expect(useUi.getState().toasts.at(-1)?.text).toContain('limited to 20');
  });
});
