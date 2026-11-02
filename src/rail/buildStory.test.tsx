// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { emptyScreen } from '../ops/screenOps';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { serializableProject, createSavedProject, openProject } from '../persist/save';
import { parseProjectDoc } from '../persist/schema';
import { chatStream, type ChatResult } from '../muse/client';
import { runAgentTurn } from '../muse/loop';
import { RailCard } from './RailCard';
vi.mock('../muse/client', async (original) => ({
  ...(await original<typeof import('../muse/client')>()),
  chatStream: vi.fn(),
}));
const response = (name: string, args: unknown, text = ''): ChatResult => ({
  text,
  toolCalls: name ? [{ id: name, name, arguments: JSON.stringify(args) }] : [],
  finishReason: name ? 'tool_calls' : 'stop',
  model: 'test',
  latencyMs: 0,
  usage: { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 },
});
beforeEach(() => {
  const doc = createProject('Warm Cinematic portfolio');
  const page = emptyScreen('Home', { id: 'home', entry: true });
  page.root.children = [
    { id: 'title', type: 'heading', props: { text: 'Original' }, styles: {}, children: [] },
    {
      id: 'nav',
      type: 'col',
      props: { role: 'nav', motion: 'rise' },
      styles: {},
      children: [],
    },
  ];
  doc.screens = [page];
  useProject.getState().replaceDoc(doc);
  useAgent.setState({
    demoMode: false,
    busy: false,
    interruptionCard: null,
    models: null,
    contributorMode: false,
    wonder: false,
    keySource: 'session',
    houseKey: 'ok',
    assetJobs: [],
  });
  vi.mocked(chatStream).mockReset();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('keeps 60 ops, eight narrations and forty keepalives in one card, then persists its receipt', async () => {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let calls = 0;
  vi.spyOn(console, 'debug').mockImplementation(() => {});
  vi.mocked(chatStream).mockImplementation(async (opts) => {
    calls++;
    if (calls === 1) {
      for (let i = 0; i < 40; i++) opts.onNotice?.('Still working… Silence is normal.');
    }
    if (calls === 2) await gate;
    if (calls <= 5)
      return response(
        'edit_canvas',
        {
          ops: Array.from({ length: 12 }, (_, j) => ({
            op: 'setText',
            id: 'title',
            text: `Tea ${calls}-${j}`,
          })),
        },
        `Narration ${calls}`,
      );
    if (calls <= 8) return response('read_canvas', {}, `Narration ${calls}`);
    if (calls === 9) return response('finish', { summary: 'Ready to explore.' });
    return response('', {}, 'PASS');
  });
  let task!: Promise<void>;
  act(() => {
    task = runAgentTurn('Build the tea portfolio');
  });
  await waitFor(() => expect(calls).toBe(2));
  const live = useProject.getState().doc.rail.find((e) => e.card?.data.turnCard === true)!;
  const id = live.id;
  function View() {
    const entry = useProject((s) => s.doc.rail.find((e) => e.id === id)!);
    return <RailCard entry={entry} />;
  }
  render(<View />);
  expect(screen.getAllByRole('group', { name: 'Build progress' })).toHaveLength(1);
  expect(document.body.textContent).not.toMatch(/Still working|Silence is normal/i);
  const mid = parseProjectDoc(
    JSON.parse(JSON.stringify(serializableProject(useProject.getState().doc))),
  );
  expect(mid.rail.some((e) => e.id === id)).toBe(false);
  expect(mid.screens).toHaveLength(1);
  expect(mid.screens[0].root.children[0].props.text).toBe('Tea 1-11');
  const savedId = await createSavedProject(useProject.getState().doc);
  const reloaded = await openProject(savedId);
  expect(reloaded?.rail.some((entry) => entry.id === id)).toBe(false);
  expect(reloaded?.screens[0].root.children[0].props.text).toBe('Tea 1-11');
  const epoch = useProject.getState().documentEpoch;
  await act(async () => {
    release();
    await task;
  });
  const doc = useProject.getState().doc;
  const card = doc.rail.at(-1)!;
  expect(card.id).toBe(id);
  expect(card.card?.data.phase).toBe('receipt');
  expect(card.card?.data.ops).toBe(60);
  expect(
    (card.card?.data.timeline as Array<{ text: string }>).filter((e) =>
      e.text.startsWith('Narration '),
    ),
  ).toHaveLength(8);
  expect(screen.getAllByRole('group', { name: 'Build receipt' })).toHaveLength(1);
  expect(document.body.textContent).not.toMatch(
    /Still working|Silence is normal|Images 0\/0/i,
  );
  expect(screen.getByText(/Quality notes/)).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Export' })).toBeTruthy();
  expect(useProject.getState().documentEpoch).toBe(epoch);
  expect(useProject.getState().undoStack).toHaveLength(5);
  const saved = parseProjectDoc(JSON.parse(JSON.stringify(serializableProject(doc))));
  expect(saved.rail.at(-1)?.id).toBe(id);
  expect(saved.rail.at(-1)?.card?.data.phase).toBe('receipt');
  const receiptId = await createSavedProject(doc);
  expect((await openProject(receiptId))?.rail.at(-1)?.id).toBe(id);
});

it('reuses the live card for interruption and omits it from saved state', async () => {
  vi.mocked(chatStream).mockResolvedValue({
    ...response('', {}, ''),
    toolCalls: Array.from({ length: 24 }, (_, i) => ({
      id: `r${i}`,
      name: 'read_canvas',
      arguments: '{}',
    })),
    finishReason: 'tool_calls',
  });
  const epoch = useProject.getState().documentEpoch;
  const undo = useProject.getState().undoStack;
  await act(async () => {
    await runAgentTurn('Build the tea page', { skipVerify: true });
  });
  const interruption = useAgent.getState().interruptionCard!;
  const card = useProject
    .getState()
    .doc.rail.find((item) => item.id === interruption.cardId)!;
  expect(card.card?.data.phase).toBe('interrupted');
  expect(useProject.getState().documentEpoch).toBe(epoch);
  expect(useProject.getState().undoStack).toBe(undo);
  render(<RailCard entry={card} />);
  expect(screen.getAllByRole('group', { name: 'Interrupted build' })).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Continue where it left off' })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Start over/ })).toBeTruthy();
  expect(
    serializableProject(useProject.getState().doc).rail.some(
      (entry) => entry.id === card.id,
    ),
  ).toBe(false);
});
