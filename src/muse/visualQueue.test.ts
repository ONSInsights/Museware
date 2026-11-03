import { expect, it, vi } from 'vitest';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { chatStream, generateImage, type ChatResult } from './client';
import { presentBlueprint, runFillQueue } from './loop';
import { rememberReference, screenshotReferenceNotice } from './referenceSession';
vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  chatStream: vi.fn(),
  generateImage: vi.fn(),
}));
const response = (name: string, args: unknown): ChatResult => ({
  text: '',
  toolCalls: [{ id: name, name, arguments: JSON.stringify(args) }],
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 },
  latencyMs: 1,
  model: 'test',
  finishReason: 'tool_calls',
});
function setup(reference = false) {
  vi.mocked(chatStream).mockReset();
  vi.mocked(generateImage).mockReset();
  useProject.getState().replaceDoc(createProject('Sample'));
  useAgent.setState({
    busy: false,
    demoMode: false,
    models: null,
    contributorMode: false,
    wonder: false,
    buildImages: 3,
    keySource: 'session',
  });
  const plan =
    'SCREEN: Home\n- title_home (heading) Chosen\n- btn_start (button) Start\nWIRING:\n- btn_start tap navigate details';
  if (reference)
    useProject.getState().addRail({ role: 'system', text: screenshotReferenceNotice });
  presentBlueprint(plan);
  if (reference)
    rememberReference(
      useProject.getState().documentEpoch,
      plan,
      'data:image/png;base64,c2NyZWVuc2hvdA==',
    );
  const result = useProject.getState().applyBatch(
    [
      {
        op: 'addScreen',
        screen: {
          id: 'home',
          name: 'Home',
          root: {
            id: 'home_root',
            type: 'screen',
            children: [
              { id: 'title_home', type: 'heading', props: { text: 'Chosen' } },
              { id: 'btn_start', type: 'button', props: { text: 'Start' } },
            ],
          },
        },
      },
    ],
    { source: 'user' },
  );
  expect(result.errors).toHaveLength(0);
}
it('finishes the chosen screen, blocks redesign, and adds explicitly approved wiring', async () => {
  setup();
  const chosen = structuredClone(useProject.getState().doc.screens[0]);
  const received: unknown[] = [];
  vi.mocked(chatStream).mockImplementation(async (opts) => {
    received.push(structuredClone(opts.messages));
    if (received.length === 1)
      return response('edit_canvas', {
        ops: [{ op: 'setText', id: 'title_home', text: 'Redesigned' }],
      });
    if (received.length === 2)
      return response('edit_canvas', {
        ops: [
          {
            op: 'add',
            parentId: 'home_root',
            node: { id: 'text_extra', type: 'text', props: { text: 'Finished content' } },
          },
          {
            op: 'setProps',
            id: 'btn_start',
            props: { events: { tap: [{ type: 'navigate', to: 'details' }] } },
          },
        ],
      });
    return response('finish', { summary: 'Done' });
  });
  await runFillQueue({ mode: 'steady', preserveScreenId: 'home' });
  const screen = useProject.getState().doc.screens[0];
  expect(screen.root.children[0]).toEqual(chosen.root.children[0]);
  expect(screen.root.children[1].events?.tap).toEqual([
    { type: 'navigate', to: 'details' },
  ]);
  expect(screen.root.children[2].props.text).toBe('Finished content');
  expect(JSON.stringify(received[1])).toContain('REJECTED');
  expect(generateImage).not.toHaveBeenCalled();
  expect(useAgent.getState().verification).toBe('unverified');
});
it('keeps screenshot-inferred interactions inert and passes the reference to the finishing call', async () => {
  setup(true);
  const received: unknown[] = [];
  vi.mocked(chatStream).mockImplementation(async (opts) => {
    received.push(structuredClone(opts.messages));
    return received.length === 1
      ? response('edit_canvas', {
          ops: [
            {
              op: 'setProps',
              id: 'btn_start',
              props: { events: { tap: [{ type: 'navigate', to: 'details' }] } },
            },
          ],
        })
      : response('finish', { summary: 'Done' });
  });
  await runFillQueue({ mode: 'steady', preserveScreenId: 'home' });
  expect(JSON.stringify(received[0])).toContain('data:image/png;base64,c2NyZWVuc2hvdA==');
  expect(JSON.stringify(received[1])).toContain('not explicitly supported');
  expect(useProject.getState().doc.screens[0].root.children[1].events?.tap).toBeUndefined();
  expect(generateImage).not.toHaveBeenCalled();
});
it('retains the chosen design and reports failure when finishing is unsupported', async () => {
  setup(true);
  const before = structuredClone(useProject.getState().doc.screens[0]);
  vi.mocked(chatStream).mockRejectedValue(new Error('Image and tools unsupported'));
  await runFillQueue({ mode: 'steady', preserveScreenId: 'home' });
  expect(useProject.getState().doc.screens[0]).toEqual(before);
  expect(JSON.stringify(useProject.getState().doc.rail)).toContain(
    'Image and tools unsupported',
  );
  expect(useAgent.getState().verification).toBe('problems');
});
it('blocks later screens from changing the selected direction', async () => {
  setup();
  useProject
    .getState()
    .setBlueprint(
      'SCREEN: Home\n- title_home (heading) Chosen\nSCREEN: Details\n- detail_title (heading) Details',
      false,
    );
  const messages: unknown[] = [];
  vi.mocked(chatStream).mockImplementation(async (opts) => {
    messages.push(structuredClone(opts.messages));
    if (messages.length === 1) return response('finish', { summary: 'First done' });
    if (messages.length === 2)
      return response('edit_canvas', {
        ops: [{ op: 'setText', id: 'title_home', text: 'Unwanted redesign' }],
      });
    if (messages.length === 3)
      return response('edit_canvas', {
        ops: [
          {
            op: 'add',
            parentId: 'details_root',
            node: { id: 'detail_title', type: 'heading', props: { text: 'Details' } },
          },
        ],
      });
    if (messages.length === 4) return response('finish', { summary: 'Done' });
    return {
      ...response('finish', { summary: 'Done' }),
      toolCalls: [],
      text: 'PASS',
      finishReason: 'stop',
    };
  });
  await runFillQueue({ mode: 'steady', preserveScreenId: 'home' });
  expect(
    useProject.getState().doc.screens.find((screen) => screen.id === 'home')?.root
      .children[0].props.text,
  ).toBe('Chosen');
  expect(
    useProject.getState().doc.screens.find((screen) => screen.id === 'details')?.root
      .children[0].props.text,
  ).toBe('Details');
  expect(JSON.stringify(messages[2])).toContain(
    'selected visual direction must remain unchanged',
  );
  expect(useAgent.getState().verification).not.toBe('pass');
});
