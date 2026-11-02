// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import {
  beginTurnJournal,
  endTurnJournal,
  canStartOver,
  continuationPrompt,
  restartTurn,
} from './turnJournal';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { emptyScreen } from '../ops/screenOps';
import { parseProjectDoc } from '../persist/schema';
import { InterruptedCard } from '../rail/InterruptedCard';
import { chatStream, MuseError } from './client';

beforeEach(() => {
  const page = emptyScreen('Tea', { id: 'tea', entry: true });
  page.root.children = [
    { id: 'title', type: 'heading', props: { text: 'Before' }, styles: {}, children: [] },
  ];
  useProject.getState().hydrate({ ...createProject(), screens: [page] }, 'project-a');
  useAgent.setState({ interruptionCard: null, busy: false });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  useAgent.setState({ interruptionCard: null });
});
function edit() {
  useProject
    .getState()
    .applyBatch([{ op: 'setProps', id: 'title', props: { text: 'After' } }], {
      source: 'agent',
    });
}
describe('turn journal', () => {
  it('records only this turn, gives the wake-up prompt, and restores the old property with a revert lesson', () => {
    const j = beginTurnJournal('Build the tea page');
    expect(j.startIndex).toBe(0);
    edit();
    endTurnJournal(j);
    expect(j.entries).toHaveLength(1);
    expect(continuationPrompt(j)).toContain('Build the tea page');
    expect(continuationPrompt(j)).toContain('do NOT repeat or revert');
    expect(continuationPrompt(j)).toContain('list the canvas first');
    expect(canStartOver(j)).toBe(true);
    expect(restartTurn(j)).toBe(true);
    expect(useProject.getState().doc.screens[0].root.children[0].props.text).toBe('Before');
    expect(
      useProject.getState().doc.designNotes?.some((x) => x.includes('user REVERTED')),
    ).toBe(true);
  });
  it('refuses when later batches, trimmed snapshots or another session make it unsafe', () => {
    const j = beginTurnJournal('Build');
    edit();
    endTurnJournal(j);
    useProject
      .getState()
      .applyBatch([{ op: 'setText', id: 'title', text: 'Later' }], { source: 'user' });
    expect(canStartOver(j)).toBe(false);
    const j2 = beginTurnJournal('Build');
    edit();
    endTurnJournal(j2);
    useProject.setState({ undoStack: [] });
    expect(canStartOver(j2)).toBe(false);
    const j3 = beginTurnJournal('Build');
    edit();
    endTurnJournal(j3);
    useProject.getState().hydrate(useProject.getState().doc, 'project-a');
    expect(canStartOver(j3)).toBe(false);
  });
  it('shows both taps, then gives an honest explanation if undo is no longer safe', () => {
    const j = beginTurnJournal('Build');
    edit();
    endTurnJournal(j);
    useAgent
      .getState()
      .setInterruptionCard({ kind: 'interrupted', journal: j, reason: 'cap' });
    render(<InterruptedCard />);
    expect(screen.getByText('1 edits done, more to do — continue?')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Continue where it left off' })).toBeTruthy();
    expect(screen.getByRole('button', { name: /Start over/ })).toBeTruthy();
    act(() => {
      useProject
        .getState()
        .applyBatch([{ op: 'setText', id: 'title', text: 'Later' }], { source: 'user' });
    });
    expect(screen.queryByRole('button', { name: /Start over/ })).toBeNull();
    expect(
      screen.getByText(
        "Start over isn't available anymore — continue, or tell me what to undo",
      ),
    ).toBeTruthy();
  });
  it('never serializes session cards, and the saved project still validates', () => {
    const j = beginTurnJournal('Build');
    edit();
    endTurnJournal(j);
    useAgent
      .getState()
      .setInterruptionCard({ kind: 'interrupted', journal: j, reason: 'error' });
    const serialized = JSON.stringify(useProject.getState().doc);
    expect(serialized).not.toContain('"interrupted"');
    const restored = parseProjectDoc(JSON.parse(serialized));
    expect(restored.rail.some((entry) => String(entry.card?.kind) === 'interrupted')).toBe(
      false,
    );
  });
});
describe('completion retry', () => {
  it('retries a timeout exactly once, then reports the second failure', async () => {
    const fetch = vi.fn(
      (_url: unknown, init: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init.signal!.addEventListener('abort', () => reject(new Error('timeout'))),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    await expect(
      chatStream({
        model: 'test',
        messages: [],
        timeoutMs: 5,
        backoffMs: [0],
        minGapMs: 0,
      }),
    ).rejects.toMatchObject({ code: 'network' });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
  it('never retries a user abort', async () => {
    const controller = new AbortController();
    const fetch = vi.fn(
      (_url: unknown, init: RequestInit) =>
        new Promise<Response>((_, reject) =>
          init.signal!.addEventListener('abort', () => reject(new Error('stopped'))),
        ),
    );
    vi.stubGlobal('fetch', fetch);
    const promise = chatStream({
      model: 'test',
      messages: [],
      signal: controller.signal,
      timeoutMs: 500,
      backoffMs: [0],
      minGapMs: 0,
    });
    setTimeout(() => controller.abort(), 0);
    await expect(promise).rejects.toMatchObject({ code: 'aborted' });
    expect(fetch).toHaveBeenCalledTimes(1);
  });
  it('does not retry a typed 402 key-chain failure', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValue(
        new Response(JSON.stringify({ error: 'HOUSE_KEY_EXHAUSTED' }), { status: 402 }),
      );
    vi.stubGlobal('fetch', fetch);
    await expect(
      chatStream({ model: 'test', messages: [], backoffMs: [0], minGapMs: 0 }),
    ).rejects.toBeInstanceOf(MuseError);
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
