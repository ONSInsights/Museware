import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyScreen } from '../ops/screenOps';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { parseProjectDoc } from '../persist/schema';
import type { ComponentNode } from '../types/tree';
import { chatStream, generateImage, type ChatResult } from './client';
import { runAgentTurn, verifyGate } from './loop';

vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  chatStream: vi.fn(),
  generateImage: vi.fn(),
}));
const n = (
  id: string,
  type: ComponentNode['type'],
  props: Record<string, unknown> = {},
): ComponentNode => ({ id, type, props, styles: {}, children: [] });
const reply = (name?: string, args?: unknown, text = ''): ChatResult => ({
  text,
  toolCalls: name ? [{ id: name, name, arguments: JSON.stringify(args) }] : [],
  finishReason: name ? 'tool_calls' : 'stop',
  model: 'test',
  latencyMs: 1,
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 },
});
const lines = () =>
  useProject
    .getState()
    .doc.rail.map(
      (r) =>
        `${r.text} ${Array.isArray(r.card?.data.timeline) ? r.card.data.timeline.map((item: { text?: string }) => item.text).join('\n') : ''}`,
    )
    .join('\n');
beforeEach(() => {
  vi.mocked(chatStream).mockReset();
  vi.mocked(generateImage).mockReset().mockResolvedValue('https://example.com/real.png');
  const s = emptyScreen('Tea', { id: 'tea', entry: true });
  const header = n('hero_img', 'image', { src: 'https://example.com/healthy.png' });
  const first = n('img_hoji', 'image', { src: '' });
  const second = n('img_ritual', 'image', { src: '' });
  s.root.children = [header, first, second];
  s.root.styles.responsive = { medium: { gap: 16 } };
  useProject.getState().replaceDoc({ ...createProject(), screens: [s] });
  useAgent.setState({
    demoMode: false,
    models: null,
    contributorMode: false,
    wonder: false,
    receipts: [],
    keySource: 'session',
    houseKey: 'ok',
    budget: null,
    buildImages: 1,
  });
});
describe('repair mends, never redesigns', () => {
  it('drops structural edits and invented ids, protects healthy images, inherits cap and summarizes state', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply(
          undefined,
          undefined,
          'PROBLEMS: hero_img img_hoji img_ritual need attention',
        ),
      )
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [
            {
              op: 'add',
              parentId: 'tea_root',
              node: { id: 'restored_gallery', type: 'grid' },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(
        reply('illustrate_images', {
          targets: [
            { id: 'invented_img' },
            { id: 'hero_img' },
            { id: 'img_hoji' },
            { id: 'img_ritual' },
          ],
        }),
      )
      .mockResolvedValueOnce(reply('finish', { summary: 'Restored five images!' }))
      .mockResolvedValueOnce(reply(undefined, undefined, 'PASS'));
    const budget = { remaining: 1 };
    await verifyGate('Tea', useProject.getState().doc, ['tea'], budget);
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(budget.remaining).toBe(0);
    const children = useProject.getState().doc.screens[0].root.children;
    expect(children.map((c) => c.id)).toEqual(['hero_img', 'img_hoji', 'img_ritual']);
    expect(children[0].props.src).toBe('https://example.com/healthy.png');
    expect(children[1].props.src).toBe('https://example.com/real.png');
    expect(children[2].props.src).toBe('');
    expect(lines()).toContain('Repair tried to restructure');
    expect(lines()).toContain('Repair invented invented_img; ignored');
    expect(lines()).toContain('already has an image');
    expect(lines()).toContain('Restored 1 of 2 flagged images');
    expect(lines()).not.toContain('Restored five images!');
    expect(useAgent.getState().imageWarnings.has('img_ritual')).toBe(true);
  });
  it('does not repair a stagger advisory even if the reviewer names it', async () => {
    const d = structuredClone(useProject.getState().doc);
    const section = n('story', 'section', { motion: 'rise' });
    section.children = Array.from({ length: 9 }, (_, i) => n(`item${i}`, 'text'));
    d.screens[0].root.children = [
      n('nav', 'navbar', { brand: 'Tea' }),
      n('hero', 'hero', { title: 'Tea', image: 'https://example.com/i.jpg' }),
      section,
    ];
    useProject.getState().replaceDoc(d);
    vi.mocked(chatStream).mockResolvedValueOnce(
      reply(undefined, undefined, 'PROBLEMS: story should be changed'),
    );
    await verifyGate('Tea', d, ['tea'], { remaining: 0 });
    expect(chatStream).toHaveBeenCalledTimes(1);
    expect(useProject.getState().doc.screens[0].root.children[2].props.motion).toBe('rise');
  });
  it('does not auto-scope or disable advisory-only motion in a generic repair turn', async () => {
    const d = structuredClone(useProject.getState().doc);
    d.kind = 'app';
    const section = n('story', 'section', { motion: 'rise' });
    section.children = Array.from({ length: 9 }, (_, i) => n(`item${i}`, 'text'));
    d.screens[0].root.children = [section];
    useProject.getState().replaceDoc(d);
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [{ op: 'setProps', id: 'story', props: { motion: 'none' } }],
        }),
      )
      .mockResolvedValueOnce(reply('finish', { summary: 'done' }));
    await runAgentTurn('Fix issues on this page', { skipVerify: true });
    expect(useProject.getState().doc.screens[0].root.children[0].props.motion).toBe('rise');
  });
  it('protects advisory motion while allowing a separate actionable fix on the same node', async () => {
    const d = structuredClone(useProject.getState().doc);
    d.kind = 'app';
    const section = n('story', 'section', { motion: 'rise', role: 'nav' });
    section.children = Array.from({ length: 9 }, (_, i) => n(`item${i}`, 'text'));
    d.screens[0].root.children = [section];
    useProject.getState().replaceDoc(d);
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [
            { op: 'setProps', id: 'story', props: { motion: 'none' } },
            { op: 'setStyles', id: 'story', styles: { animation: 'none' } },
            {
              op: 'setStyles',
              id: 'story',
              styles: { responsive: { medium: { animation: 'none' } } },
            },
            { op: 'setStyles', id: 'story', styles: { gap: 16 } },
          ],
        }),
      )
      .mockResolvedValueOnce(reply('finish', { summary: 'done' }));
    await runAgentTurn('Fix issues on this page', { skipVerify: true });
    const actual = useProject.getState().doc.screens[0].root.children[0];
    expect(actual.props.motion).toBe('rise');
    expect(actual.styles.gap).toBe(16);
    expect(actual.styles.animation).toBeUndefined();
    expect(actual.styles.responsive).toBeUndefined();
  });
  it('does not infer a request to remove motion from a vague motion repair', async () => {
    const d = structuredClone(useProject.getState().doc);
    d.kind = 'app';
    const section = n('story', 'section', { motion: 'rise' });
    section.children = Array.from({ length: 9 }, (_, i) => n(`item${i}`, 'text'));
    d.screens[0].root.children = [section];
    useProject.getState().replaceDoc(d);
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [{ op: 'setProps', id: 'story', props: { motion: 'none' } }],
        }),
      )
      .mockResolvedValueOnce(reply('finish', { summary: 'done' }));
    await runAgentTurn('Fix motion on story', { skipVerify: true });
    expect(useProject.getState().doc.screens[0].root.children[0].props.motion).toBe('rise');
  });
  it('allows an explicitly requested motion change for the named section', async () => {
    const d = structuredClone(useProject.getState().doc);
    d.kind = 'app';
    const section = n('story', 'section', { motion: 'rise' });
    section.children = Array.from({ length: 9 }, (_, i) => n(`item${i}`, 'text'));
    d.screens[0].root.children = [section];
    useProject.getState().replaceDoc(d);
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [{ op: 'setProps', id: 'story', props: { motion: 'none' } }],
        }),
      )
      .mockResolvedValueOnce(reply('finish', { summary: 'done' }));
    await runAgentTurn('Fix motion on story by setting it to none', { skipVerify: true });
    expect(useProject.getState().doc.screens[0].root.children[0].props.motion).toBe('none');
  });
  it('repairs an unscrimmed immersive image using a scoped existing style op', async () => {
    const d = structuredClone(useProject.getState().doc);
    const hero = n('h', 'hero', { layout: 'immersive', title: 'Tea' });
    hero.children = [n('photo', 'image', { src: 'https://example.com/i.jpg' })];
    d.screens[0].root.children = [hero];
    useProject.getState().replaceDoc(d);
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [{ op: 'setStyles', id: 'photo', styles: { filter: 'brightness(0.55)' } }],
        }),
      )
      .mockResolvedValueOnce(reply('finish', { summary: 'Done' }))
      .mockResolvedValueOnce(reply(undefined, undefined, 'PASS'));
    await verifyGate('Tea', d, ['tea'], { remaining: 0 });
    expect(
      useProject.getState().doc.screens[0].root.children[0].children[0].styles.filter,
    ).toBe('brightness(0.55)');
    expect(useAgent.getState().verification).toBe('pass');
  });
  it('applies only responsive styles to existing requested nodes during targeted responsive repair', async () => {
    const d = structuredClone(useProject.getState().doc);
    const root = d.screens[0].root;
    root.styles.responsive = undefined;
    root.children = [n('best_grid', 'grid', { columns: 2 })];
    root.children[0].styles.columns = 2;
    useProject.getState().replaceDoc(d);
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [
            { op: 'add', parentId: root.id, node: { id: 'rogue_grid', type: 'grid' } },
            {
              op: 'setStyles',
              id: 'best_grid',
              styles: { responsive: { medium: { columns: 2 }, expanded: { columns: 3 } } },
            },
          ],
        }),
      )
      .mockResolvedValueOnce(reply('finish', { summary: 'done' }))
      .mockResolvedValueOnce(reply(undefined, undefined, 'PASS'));
    await verifyGate('Tea', d, ['tea'], { remaining: 0 });
    const children = useProject.getState().doc.screens[0].root.children;
    expect(children).toHaveLength(1);
    expect(children[0].styles.responsive?.expanded?.columns).toBe(3);
    expect(lines()).toContain('Responsive repair wrote overrides on 1 of 1');
  });
  it('makes the third reviewer attempt on low effort and fails closed if still empty', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(reply())
      .mockResolvedValueOnce(reply())
      .mockResolvedValueOnce(reply());
    await verifyGate('Tea', useProject.getState().doc, ['tea'], { remaining: 0 });
    expect(chatStream).toHaveBeenCalledTimes(3);
    expect(vi.mocked(chatStream).mock.calls[2][0].effort).toBe('low');
    expect(useAgent.getState().verification).toBe('unverified');
    expect(useAgent.getState().reviewNotes).toContain(
      'reviewer unavailable after 3 attempts',
    );
  });
  it('accepts the third low-effort reviewer response when it returns PASS', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(reply())
      .mockResolvedValueOnce(reply())
      .mockResolvedValueOnce(reply(undefined, undefined, 'PASS'));
    await verifyGate('Tea', useProject.getState().doc, ['tea'], { remaining: 0 });
    expect(chatStream).toHaveBeenCalledTimes(3);
    expect(vi.mocked(chatStream).mock.calls[2][0].effort).toBe('low');
    expect(useAgent.getState().verification).toBe('pass');
  });
  it('fails closed on automatic image calls for legacy projects with unknown usage', async () => {
    const doc = structuredClone(useProject.getState().doc);
    delete doc.automatedImageBudget;
    useProject.getState().replaceDoc(doc);
    vi.mocked(chatStream)
      .mockResolvedValueOnce(reply('illustrate_images', { targets: [{ id: 'img_hoji' }] }))
      .mockResolvedValueOnce(reply('finish', { summary: 'done' }));
    await runAgentTurn('Improve the visual design', { skipVerify: true });
    expect(generateImage).not.toHaveBeenCalled();
    expect(lines()).toContain('usage for this older project is unknown');
  });
  it('carries the automated project cap across turns and project export/import', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(reply('illustrate_images', { targets: [{ id: 'img_hoji' }] }))
      .mockResolvedValueOnce(reply('finish', { summary: 'done' }))
      .mockResolvedValueOnce(
        reply('illustrate_images', { targets: [{ id: 'img_ritual' }] }),
      )
      .mockResolvedValueOnce(reply('finish', { summary: 'done' }));
    await runAgentTurn('Improve the visual design', { skipVerify: true });
    const imported = parseProjectDoc(JSON.parse(JSON.stringify(useProject.getState().doc)));
    expect(imported.automatedImageBudget).toEqual({ used: 1, cap: 1 });
    useProject.getState().replaceDoc(imported);
    await runAgentTurn('Improve the visual design again', { skipVerify: true });
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(useProject.getState().doc.screens[0].root.children[2].props.src).toBe('');
  });
  it('guards a user follow-up to fix images as repair rather than restructuring', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply('edit_canvas', {
          ops: [
            { op: 'add', parentId: 'tea_root', node: { id: 'rogue_grid', type: 'grid' } },
          ],
        }),
      )
      .mockResolvedValueOnce(
        reply('illustrate_images', { targets: [{ id: 'missing_id' }] }),
      )
      .mockResolvedValueOnce(reply('finish', { summary: 'Everything restored.' }));
    await runAgentTurn('Fix the images', { skipVerify: true });
    expect(useProject.getState().doc.screens[0].root.children).toHaveLength(3);
    expect(lines()).toContain('Repair tried to restructure');
    expect(lines()).toContain('Repair invented missing_id; ignored');
    expect(lines()).toContain('Restored 0 of 2 flagged images');
    expect(lines()).not.toContain('Everything restored.');
  });
});
