import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { chatStream, generateImage, type ChatResult } from './client';
import { answerBlueprint } from './cards';
import { presentBlueprint } from './loop';
import { rememberReference, screenshotReferenceNotice } from './referenceSession';

vi.mock('./client', async (original) => ({
  ...(await original<typeof import('./client')>()),
  chatStream: vi.fn(),
  generateImage: vi.fn(),
}));
const plan =
  'RULES: Match reference.\nSCREEN: Home\n- title_home (heading) Welcome\n- image_home (image) unavailable asset';
const image = 'data:image/png;base64,c2NyZWVuc2hvdA==';
const result = (name?: string, args?: unknown, text = ''): ChatResult => ({
  text,
  toolCalls: name ? [{ id: name, name, arguments: JSON.stringify(args) }] : [],
  finishReason: name ? 'tool_calls' : 'stop',
  model: 'test',
  latencyMs: 1,
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 },
});
function setup() {
  useProject.getState().addRail({ role: 'system', text: screenshotReferenceNotice });
  presentBlueprint(plan);
  rememberReference(useProject.getState().documentEpoch, plan, image);
  return useProject.getState().doc.rail.find((r) => r.card?.kind === 'blueprint')!.id;
}
beforeEach(() => {
  vi.mocked(chatStream).mockReset();
  vi.mocked(generateImage).mockReset();
  useProject.getState().replaceDoc({ ...createProject('Reference'), kind: 'app' });
  useAgent.setState({
    demoMode: false,
    models: null,
    contributorMode: false,
    wonder: false,
    receipts: [],
    verification: 'idle',
    buildImages: 3,
    keySource: 'session',
  });
});
describe('screenshot reference build', () => {
  it('sends the image to the builder after approval, never generates missing assets, and does not persist screenshot bytes', async () => {
    const card = setup();
    expect(useProject.getState().doc.screens).toHaveLength(0);
    const captured: unknown[] = [];
    vi.mocked(chatStream).mockImplementation(async (opts) => {
      captured.push(structuredClone(opts.messages));
      if (captured.length === 1)
        return result('edit_canvas', {
          ops: [
            {
              op: 'add',
              parentId: 'home_root',
              node: { id: 'title_home', type: 'heading', props: { text: 'Welcome' } },
            },
            {
              op: 'add',
              parentId: 'home_root',
              node: { id: 'image_home', type: 'image', props: { alt: 'Reference asset' } },
            },
          ],
        });
      if (captured.length === 2)
        return result('illustrate_images', {
          targets: [{ id: 'image_home', prompt: 'replacement' }],
        });
      if (captured.length === 3) return result('finish', { summary: 'Done' });
      return result(undefined, undefined, 'PASS');
    });
    await answerBlueprint(card, 'build');
    const first = JSON.stringify(captured[0]);
    expect(first).toContain(image);
    expect(first).toContain('Leave unavailable image assets as empty image placeholders');
    expect(generateImage).not.toHaveBeenCalled();
    expect(JSON.stringify(useProject.getState().doc)).not.toContain(image);
    expect(useProject.getState().doc.screens[0].root.children.map((n) => n.id)).toEqual([
      'title_home',
      'image_home',
    ]);
    expect(
      useProject
        .getState()
        .doc.rail.some(
          (r) =>
            r.text.includes('Visual fidelity has not been verified') ||
            JSON.stringify(r.card?.data || {}).includes(
              'Visual fidelity has not been verified',
            ),
        ),
    ).toBe(true);
  });
  it('requires the screenshot again after a reload or project switch, without approving or building', async () => {
    const card = setup();
    useProject.getState().replaceDoc(structuredClone(useProject.getState().doc));
    await answerBlueprint(card, 'build');
    expect(chatStream).not.toHaveBeenCalled();
    expect(useProject.getState().doc.blueprint?.decided).toBe(false);
    expect(useProject.getState().doc.rail.find((r) => r.id === card)?.card?.state).toBe(
      'pending',
    );
  });
  it('cancel does not build or send the reference', async () => {
    const card = setup();
    await answerBlueprint(card, 'cancel');
    expect(chatStream).not.toHaveBeenCalled();
    expect(useProject.getState().doc.screens).toHaveLength(0);
  });
  it('does not silently retry without the screenshot when the provider rejects image input', async () => {
    const card = setup();
    vi.mocked(chatStream).mockRejectedValue(new Error('Images with tools are unsupported'));
    await answerBlueprint(card, 'build');
    expect(chatStream).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(vi.mocked(chatStream).mock.calls[0][0].messages)).toContain(
      image,
    );
    expect(JSON.stringify(useProject.getState().doc.rail)).toContain(
      'Images with tools are unsupported',
    );
    expect(generateImage).not.toHaveBeenCalled();
  });
  it('still identifies a persisted reference plan when its card is truncated', async () => {
    const longPlan = `SCREEN: Home\n- title (heading) Welcome\n${'detail '.repeat(1200)}`;
    useProject.getState().addRail({ role: 'system', text: screenshotReferenceNotice });
    presentBlueprint(longPlan);
    const card = useProject
      .getState()
      .doc.rail.find((r) => r.card?.kind === 'blueprint')!.id;
    useProject.getState().replaceDoc(structuredClone(useProject.getState().doc));
    await answerBlueprint(card, 'build');
    expect(chatStream).not.toHaveBeenCalled();
    expect(useProject.getState().doc.blueprint?.decided).toBe(false);
  });
  it('keeps the reference tied to an adjusted plan before the build', async () => {
    const card = setup();
    vi.mocked(chatStream).mockResolvedValueOnce(
      result(undefined, undefined, 'SCREEN: Home\n- title (heading) Changed'),
    );
    await answerBlueprint(card, 'adjust', 'Change the title');
    const revised = useProject
      .getState()
      .doc.rail.filter((r) => r.card?.kind === 'blueprint')
      .at(-1)!;
    vi.mocked(chatStream).mockResolvedValue(result('finish', { summary: 'Done' }));
    await answerBlueprint(revised.id, 'build');
    expect(JSON.stringify(vi.mocked(chatStream).mock.calls[1][0].messages)).toContain(
      image,
    );
  });
  it('does not apply late builder operations after switching projects', async () => {
    const card = setup();
    let resolve!: (value: ChatResult) => void;
    vi.mocked(chatStream).mockReturnValueOnce(
      new Promise((r) => {
        resolve = r;
      }),
    );
    const pending = answerBlueprint(card, 'build');
    await vi.waitFor(() => expect(chatStream).toHaveBeenCalledTimes(1));
    const other = createProject('Other');
    useProject.getState().replaceDoc(other);
    resolve(
      result('edit_canvas', {
        ops: [
          {
            op: 'addScreen',
            screen: {
              id: 'rogue',
              name: 'Rogue',
              root: { id: 'rogue_root', type: 'screen' },
            },
          },
        ],
      }),
    );
    await pending;
    expect(useProject.getState().doc).toEqual(other);
  });
});
