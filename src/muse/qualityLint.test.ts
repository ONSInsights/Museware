import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { emptyScreen } from '../ops/screenOps';
import { chatStream, generateImage, type ChatResult } from './client';
import { verifyGate } from './loop';
import { lintScreen } from './qualityLint';
import type { ComponentNode } from '../types/tree';

vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  chatStream: vi.fn(),
  generateImage: vi.fn(),
}));
const node = (
  id: string,
  type: ComponentNode['type'],
  props: Record<string, unknown>,
): ComponentNode => ({ id, type, props, styles: {}, children: [] });
const reply = (calls: ChatResult['toolCalls'] = [], text = ''): ChatResult => ({
  text,
  toolCalls: calls,
  finishReason: calls.length ? 'tool_calls' : 'stop',
  model: 'test',
  latencyMs: 1,
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 },
});
beforeEach(() => {
  vi.mocked(chatStream).mockReset();
  vi.mocked(generateImage).mockReset().mockResolvedValue('https://example.com/tea.png');
  const screen = emptyScreen('Tea', { id: 'tea', entry: true });
  screen.root.children = [
    node('tea_text', 'text', { text: 'Body text that says something useful.' }),
    node('tea_hero', 'hero', { title: 'Fresh leaves', image: '' }),
  ];
  useProject.getState().replaceDoc({ ...createProject(), screens: [screen] });
  useAgent.setState({
    demoMode: false,
    models: null,
    contributorMode: false,
    wonder: false,
    receipts: [],
    keySource: 'session',
    houseKey: 'ok',
    budget: null,
    buildImages: 3,
  });
});
describe('quality lint and gate', () => {
  it('reports unwired buttons and forms without authorizing automatic repair', () => {
    const s = useProject.getState().doc.screens[0];
    const button = node('order', 'button', { text: 'Order' });
    const form = node('reserve', 'form', { submitLabel: 'Reserve' });
    const wired = node('menu', 'button', { text: 'Menu' });
    wired.events = { tap: [{ type: 'navigate', to: 'tea' }] };
    s.root.children = [button, form, wired];
    const findings = lintScreen(s);
    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          nodeId: 'order',
          advisory: true,
          message: expect.stringContaining('no tap action'),
        }),
        expect.objectContaining({
          nodeId: 'reserve',
          advisory: true,
          message: expect.stringContaining('no submit action'),
        }),
      ]),
    );
    expect(findings.some((f) => f.nodeId === 'menu' && f.advisory)).toBe(false);
  });
  it('does not insist on a hero for a non-entry web screen', () => {
    const s = useProject.getState().doc.screens[0];
    s.entry = false;
    s.root.children = [];
    expect(lintScreen(s, undefined, new Set(), 'web').some((f) => f.code === 'hero')).toBe(
      false,
    );
  });
  it('warns for tool branding without requiring hero or navbar on an entry screen', () => {
    const s = useProject.getState().doc.screens[0];
    s.root.children = [node('nav', 'navbar', { brand: ' MuSeWaRe ', text: 'Tea' })];
    expect(lintScreen(s, undefined, new Set(), 'web')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'brand', severity: 'warn' }),
      ]),
    );
    s.root.children = [node('copy', 'text', { text: 'A quiet workspace.' })];
    expect(
      lintScreen(s, undefined, new Set(), 'web').some((f) =>
        ['hero', 'navbar'].includes(f.code),
      ),
    ).toBe(false);
  });
  it('warns on Wave 3 composition and raw sizes without confusing tokens with pixels', () => {
    const s = useProject.getState().doc.screens[0];
    s.root.styles = { padding: '12px 32px', gap: 'var(--gap-section)' };
    const h1 = node('h1_test', 'heading', { level: 1 });
    h1.styles.fontSize = '48px';
    const second = node('hero_two', 'hero', { surface: 'glow' });
    second.styles.color = 'var(--openui-text-on-accent)';
    const grid = node('grid_test', 'grid', {});
    grid.children = [
      node('card_a', 'card', { variant: 'spotlight' }),
      node('card_b', 'card', { variant: 'accent' }),
    ];
    s.root.children.push(h1, second, grid);
    const messages = lintScreen(s, undefined, new Set(), 'web').map((f) => f.message);
    expect(messages.some((m) => m.includes('More than one hero'))).toBe(true);
    expect(messages.some((m) => m.includes('on-accent text'))).toBe(true);
    expect(messages.some((m) => m.includes('more than one spotlight'))).toBe(true);
    expect(
      lintScreen(s, undefined, new Set(), 'app').some((f) =>
        f.message.includes('below 24px'),
      ),
    ).toBe(false);
  });
  it('does not treat absent overrides or navbar as automatic defects', () => {
    const s = useProject.getState().doc.screens[0];
    expect(
      lintScreen(s, undefined, new Set(), 'web').some(
        (f) => f.code === 'navbar' || f.message.includes('no responsive overrides'),
      ),
    ).toBe(false);
  });
  it('retries one empty stop reviewer response before passing', async () => {
    const s = useProject.getState().doc.screens[0];
    s.root.children[0].props.text = 'Whole leaf tea';
    s.root.children[1].props.subtitle = 'Fresh tea';
    vi.mocked(chatStream)
      .mockResolvedValueOnce(reply([], ''))
      .mockResolvedValueOnce(reply([], 'PASS'));
    await verifyGate('tea', useProject.getState().doc, ['tea']);
    expect(chatStream).toHaveBeenCalledTimes(2);
    expect(useAgent.getState().verification).toBe('pass');
  });
  it('does not mislabel declared expanded grid columns as desktop-first phone CSS', () => {
    const s = useProject.getState().doc.screens[0];
    const grid = node('hero_grid', 'grid', { columns: 2 });
    grid.styles = { columns: 2 };
    s.root.children.push(grid);
    expect(
      lintScreen(s, undefined, new Set(), 'web').some((f) =>
        f.message.includes('Desktop-first'),
      ),
    ).toBe(false);
  });
  it('blocks placeholder copy but only warns about an empty hero, and accepts clean content', () => {
    const screen = useProject.getState().doc.screens[0];
    expect(
      lintScreen(screen)
        .filter((f) => f.severity === 'block')
        .map((f) => f.code),
    ).toEqual(['scaffold']);
    expect(lintScreen(screen)).toContainEqual(
      expect.objectContaining({ nodeId: 'tea_hero', code: 'imagery', severity: 'warn' }),
    );
    screen.root.children[0].props.text = 'Whole leaf tea';
    screen.root.children[1].props.image = 'https://example.com/tea.png';
    expect(lintScreen(screen)).toEqual([]);
  });
  it('accepts gradient heroes with a subtitle or children, while empty image nodes warn', () => {
    const screen = emptyScreen('Tea', { id: 'tea' });
    const hero = node('hero_tea', 'hero', {
      title: 'Fresh leaves',
      subtitle: 'A better cup',
    });
    screen.root.children = [hero, node('empty_image', 'image', { src: '', alt: 'Tea' })];
    expect(lintScreen(screen)).toEqual([
      expect.objectContaining({ nodeId: 'empty_image', severity: 'warn', code: 'imagery' }),
    ]);
    hero.props.subtitle = '';
    hero.children.push(node('hero_btn', 'button', { text: 'Shop tea' }));
    expect(lintScreen(screen).some((finding) => finding.nodeId === 'hero_tea')).toBe(false);
  });
  it('lets the targeted repair illustrate only affected nodes using remaining budget', async () => {
    const screen = useProject.getState().doc.screens[0];
    screen.root.children.push(node('other_img', 'image', { src: '', alt: 'Other' }));
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply([
          {
            id: 'images',
            name: 'illustrate_images',
            arguments: JSON.stringify({
              targets: [{ id: 'tea_hero' }, { id: 'other_img' }, { id: 'tea_text' }],
            }),
          },
        ]),
      )
      .mockResolvedValueOnce(
        reply([
          {
            id: 'repair',
            name: 'edit_canvas',
            arguments: JSON.stringify({
              ops: [{ op: 'setText', id: 'tea_text', text: 'Whole leaf tea' }],
            }),
          },
        ]),
      )
      .mockResolvedValueOnce(
        reply([
          {
            id: 'done',
            name: 'finish',
            arguments: JSON.stringify({ summary: 'Repaired' }),
          },
        ]),
      )
      .mockResolvedValueOnce(reply([], 'PASS'));
    const budget = { remaining: 1 };
    await verifyGate('Tea landing', useProject.getState().doc, ['tea'], budget);
    expect(generateImage).toHaveBeenCalledTimes(1);
    expect(budget.remaining).toBe(0);
    expect(useProject.getState().doc.screens[0].root.children[1].props.image).toBe(
      'https://example.com/tea.png',
    );
    expect(useAgent.getState().verification).toBe('pass');
    expect(
      useProject.getState().doc.rail.some((entry) => entry.text.includes('budget cap')),
    ).toBe(true);
  });
  it('keeps empty image placeholders as warnings when no image budget remains', async () => {
    const screen = useProject.getState().doc.screens[0];
    screen.root.children[0].props.text = 'Whole leaf tea';
    screen.root.children.push(node('empty_image', 'image', { src: '', alt: 'Tea' }));
    vi.mocked(chatStream).mockResolvedValueOnce(reply([], 'PASS'));
    await verifyGate('Tea landing', useProject.getState().doc, ['tea'], { remaining: 0 });
    expect(generateImage).not.toHaveBeenCalled();
    expect(useAgent.getState().verification).toBe('pass');
    expect(useAgent.getState().reviewNotes).toContain('empty_image');
  });
  it('does not infer an imagery requirement from a landing name', () => {
    const screen = emptyScreen('Tea Landing', { id: 'tea', entry: true });
    screen.root.children = [node('tea_text', 'text', { text: 'Whole leaf tea' })];
    expect(lintScreen(screen)).toEqual([]);
  });
  it('runs a targeted repair then reports reviewer failure honestly', async () => {
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply([
          {
            id: 'repair',
            name: 'edit_canvas',
            arguments: JSON.stringify({
              ops: [
                { op: 'setText', id: 'tea_text', text: 'Whole leaf tea' },
                {
                  op: 'setProps',
                  id: 'tea_hero',
                  props: { subtitle: 'Fresh fragrant tea' },
                },
              ],
            }),
          },
        ]),
      )
      .mockResolvedValueOnce(
        reply([
          {
            id: 'done',
            name: 'finish',
            arguments: JSON.stringify({ summary: 'Repaired.' }),
          },
        ]),
      )
      .mockRejectedValueOnce(new Error('review offline'));
    const doc = useProject.getState().doc;
    await verifyGate('Tea landing', doc, ['tea']);
    expect(vi.mocked(chatStream)).toHaveBeenCalledTimes(3);
    expect(useAgent.getState().verification).toBe('unverified');
    expect(useAgent.getState().reviewNotes).toContain('review offline');
    expect(lintScreen(useProject.getState().doc.screens[0])).toEqual([]);
  });
  it('repairs an oversized screen padding before reviewer approval', async () => {
    const doc = useProject.getState().doc;
    doc.screens[0].root.children[0].props.text = 'Whole leaf tea';
    doc.screens[0].root.children[1].props.subtitle = 'Fresh and fragrant';
    doc.screens[0].root.styles.padding = '390px';
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        reply([
          {
            id: 'repair',
            name: 'edit_canvas',
            arguments: JSON.stringify({
              ops: [
                {
                  op: 'setStyles',
                  id: doc.screens[0].root.id,
                  styles: { padding: '24px' },
                },
              ],
            }),
          },
        ]),
      )
      .mockResolvedValueOnce(
        reply([
          {
            id: 'done',
            name: 'finish',
            arguments: JSON.stringify({ summary: 'Repaired' }),
          },
        ]),
      )
      .mockResolvedValueOnce(reply([], 'PASS'));
    await verifyGate('Tea landing', doc, ['tea']);
    expect(useProject.getState().doc.screens[0].root.styles.padding).toBe('24px');
    expect(useAgent.getState().verification).toBe('pass');
    expect(
      useProject
        .getState()
        .doc.rail.some(
          (entry) => entry.text.includes('spacing') || entry.text.includes('96px'),
        ),
    ).toBe(true);
  });
  it('names the finish reason when the reviewer response is empty', async () => {
    const doc = useProject.getState().doc;
    doc.screens[0].root.children[0].props.text = 'Whole leaf tea';
    doc.screens[0].root.children[1].props.subtitle = 'Fresh and fragrant';
    vi.mocked(chatStream).mockResolvedValueOnce({
      ...reply([], ''),
      finishReason: 'length',
    });
    await verifyGate('Tea landing', doc, ['tea']);
    expect(useAgent.getState().verification).toBe('unverified');
    expect(useAgent.getState().reviewNotes).toContain(
      'empty response (finish_reason: length)',
    );
  });
  it('never calls the reviewer or passes when repair fails and blockers remain', async () => {
    vi.mocked(chatStream).mockRejectedValue(new Error('offline'));
    await verifyGate('Tea landing', useProject.getState().doc, ['tea']);
    expect(useAgent.getState().verification).toBe('problems');
    expect(useAgent.getState().reviewNotes).toContain('tea_text');
    expect(useAgent.getState().reviewNotes).toContain('tea_hero');
    expect(vi.mocked(chatStream)).toHaveBeenCalledTimes(1);
  });
});

it('warns on rgb and rgba style values with a token suggestion', () => {
  const s = useProject.getState().doc.screens[0];
  s.root.children[0].styles = {
    color: 'rgb(1, 2, 3)',
    boxShadow: '0 1px 2px rgba(0,0,0,.3)',
  };
  const messages = lintScreen(s)
    .filter((f) => f.code === 'token')
    .map((f) => f.message);
  expect(messages).toContain('raw color in color — use a token');
  expect(messages).toContain('raw color in boxShadow — use a token');
});
