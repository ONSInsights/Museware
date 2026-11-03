import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { emptyScreen } from '../ops/screenOps';
import { WINDOWS_PRESET } from '../design/presets';
import { blueprintGlobalContext } from './blueprintParse';
import { chatStream, type ChatResult } from './client';
import { runFillQueue } from './loop';

vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  chatStream: vi.fn(),
}));
const response = (name?: string, args: unknown = {}): ChatResult => ({
  text: name ? '' : 'PASS',
  toolCalls: name ? [{ id: name, name, arguments: JSON.stringify(args) }] : [],
  finishReason: name ? 'tool_calls' : 'stop',
  model: 'test',
  latencyMs: 1,
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 },
});
const screen = (name: string, id: string) => {
  const result = emptyScreen(name, { id, entry: id === 'home' });
  result.root.children = [
    { id: `${id}_title`, type: 'heading', props: { text: name }, styles: {}, children: [] },
  ];
  return result;
};
const plan = `RULES: Keep the tactile paper texture and the short poetic voice on every screen.\n${'Important global detail. '.repeat(20)}\nSCREEN: Home\n- home_title (heading) Home\nSCREEN: Shop\n- shop_title (heading) Shop\nLOOK: pad 20, gap 16, title 24, body 14`;

beforeEach(() => {
  vi.mocked(chatStream).mockReset();
  useProject.getState().replaceDoc({
    ...createProject('Context'),
    kind: 'app',
    screens: [screen('Home', 'home'), screen('Shop', 'shop')],
  });
  useAgent.setState({
    demoMode: false,
    models: null,
    wonder: false,
    contributorMode: false,
    receipts: [],
    verification: 'idle',
    buildImages: 0,
  });
});

describe('approved design intent', () => {
  it('retains global preamble separately without moving one screen into another', () => {
    expect(blueprintGlobalContext(plan)).toContain('tactile paper');
    expect(blueprintGlobalContext(plan)).not.toContain('SCREEN: Home');
    expect(blueprintGlobalContext('A free-form plan with no screen')).toBe('');
  });

  it('sends the older full brief and shared plan to each screen and full plan to text reviewer', async () => {
    const brief = `Create a boutique tea shop. ${'x'.repeat(4000)} MIDDLE-REQUIREMENT ${'y'.repeat(2500)} END-REQUIREMENT`;
    useProject.getState().addRail({ role: 'user', text: brief });
    for (let i = 0; i < 10; i++)
      useProject
        .getState()
        .addRail({ role: i % 2 ? 'agent' : 'user', text: `Conversation ${i}` });
    useProject.getState().setBlueprint(plan, true);
    vi.mocked(chatStream).mockImplementation(async (opts) =>
      opts.tools ? response('finish', { summary: 'done' }) : response(),
    );
    await runFillQueue({ mode: 'steady' });
    const calls = vi.mocked(chatStream).mock.calls.map(([opts]) => opts);
    const fills = calls.filter(
      (opts) => opts.tools && opts.messages.some((m) => m.content.includes('Fill screen ')),
    );
    expect(fills).toHaveLength(2);
    for (const fill of fills) {
      expect(fill.messages.some((m) => m.role === 'user' && m.content === brief)).toBe(
        true,
      );
      const msg = fill.messages.map((m) => m.content).join('\n');
      expect(msg).toContain('SHARED APPROVED PLAN CONTEXT');
      expect(msg).toContain('tactile paper texture');
      expect(msg).toContain('MIDDLE-REQUIREMENT');
    }
    const review = calls.find((opts) => !opts.tools);
    expect(review?.messages.map((m) => m.content).join('\n')).toContain('SCREEN: Shop');
    expect(review?.messages.map((m) => m.content).join('\n')).toContain(
      'CURRENT TOKEN SHEET (text only)',
    );
    expect(review?.messages.map((m) => m.content).join('\n')).toContain(
      'not a rendered image',
    );
    expect(useAgent.getState().verification).toBe('pass');
  });

  it('protects a user-selected complete system from both token mutation routes during fill', async () => {
    const applied = useProject.getState().applyBatch(
      [
        {
          op: 'setTokens',
          replace: true,
          patch: {
            openuiTheme: structuredClone(WINDOWS_PRESET.openuiTheme),
            title: 'Selected',
          },
        },
      ],
      { source: 'user' },
    );
    expect(applied.errors).toEqual([]);
    const before = structuredClone(useProject.getState().doc.tokens);
    useProject.getState().setBlueprint('SCREEN: Home\n- home_title (heading) Home', true);
    vi.mocked(chatStream)
      .mockResolvedValueOnce(
        response('set_design_tokens', {
          patch: { brand_color: WINDOWS_PRESET.openuiTheme.secondary_color },
        }),
      )
      .mockResolvedValueOnce(
        response('edit_canvas', {
          ops: [
            {
              op: 'setTokens',
              patch: { brand_color: WINDOWS_PRESET.openuiTheme.secondary_color },
            },
            { op: 'setText', id: 'home_title', text: 'Should not apply' },
          ],
        }),
      )
      .mockResolvedValueOnce(response('finish', { summary: 'done' }))
      .mockResolvedValueOnce(response());
    await runFillQueue({ mode: 'steady' });
    expect(useProject.getState().doc.tokens).toEqual(before);
    expect(useProject.getState().doc.screens[0].root.children[0].props.text).toBe('Home');
    const calls = vi.mocked(chatStream).mock.calls.map(([opts]) => opts);
    const toolFeedback = calls.flatMap((opts) =>
      opts.messages.filter(
        (m) => m.role === 'tool' && m.content.includes('E_THEME_PROTECTED'),
      ),
    );
    expect(new Set(toolFeedback.map((m) => m.tool_call_id)).size).toBe(2);
  });

  it('uses only this project’s rail and reports a reviewer failure as unverified', async () => {
    const other = createProject('Other');
    useProject.getState().replaceDoc(other);
    useProject.getState().addRail({ role: 'user', text: 'PRIVATE OTHER PROJECT REQUEST' });
    useProject.getState().replaceDoc({
      ...createProject('Current'),
      kind: 'app',
      screens: [screen('Home', 'home'), screen('Shop', 'shop')],
    });
    useProject.getState().addRail({ role: 'user', text: 'Current project request' });
    useProject.getState().setBlueprint('SCREEN: Home\n- home_title (heading) Home', true);
    const untouched = structuredClone(useProject.getState().doc.screens[1]);
    vi.mocked(chatStream).mockImplementation(async (opts) => {
      if (opts.tools) return response('finish', { summary: 'done' });
      throw new Error('review unavailable');
    });
    await runFillQueue({ mode: 'steady' });
    const allMessages = vi
      .mocked(chatStream)
      .mock.calls.flatMap(([opts]) => opts.messages.map((m) => m.content))
      .join('\n');
    expect(allMessages).toContain('Current project request');
    expect(allMessages).not.toContain('PRIVATE OTHER PROJECT REQUEST');
    expect(useAgent.getState().verification).toBe('unverified');
    expect(useProject.getState().doc.screens[1]).toEqual(untouched);
  });
});
