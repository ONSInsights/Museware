// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InterruptedCard } from './InterruptedCard';
import { runAgentTurn } from '../muse/loop';
import { beginTurnJournal, endTurnJournal } from '../muse/turnJournal';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { emptyScreen } from '../ops/screenOps';
vi.mock('../muse/loop', () => ({ runAgentTurn: vi.fn().mockResolvedValue(undefined) }));
beforeEach(() => {
  const page = emptyScreen('Tea', { id: 'tea', entry: true });
  page.root.children = [
    { id: 'title', type: 'heading', props: { text: 'Before' }, styles: {}, children: [] },
  ];
  useProject.getState().hydrate({ ...createProject(), screens: [page] }, 'project');
  useAgent.setState({ busy: false, interruptionCard: null });
  vi.mocked(runAgentTurn).mockClear();
});
afterEach(cleanup);
function interrupted() {
  const j = beginTurnJournal('Original request');
  useProject
    .getState()
    .applyBatch([{ op: 'setProps', id: 'title', props: { text: 'After' } }], {
      source: 'agent',
    });
  endTurnJournal(j);
  useAgent
    .getState()
    .setInterruptionCard({ kind: 'interrupted', journal: j, reason: 'error' });
}
it('continues only on a tap, with current-state journal context', () => {
  interrupted();
  render(<InterruptedCard />);
  expect(runAgentTurn).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Continue where it left off' }));
  expect(runAgentTurn).toHaveBeenCalledWith(
    'Original request',
    expect.objectContaining({
      resumeJournal: expect.stringContaining('do NOT repeat or revert'),
    }),
  );
  expect(useProject.getState().doc.screens[0].root.children[0].props.text).toBe('After');
});
it('restores the checkpoint then reruns the original only after Start over', () => {
  interrupted();
  render(<InterruptedCard />);
  fireEvent.click(screen.getByRole('button', { name: /Start over/ }));
  expect(useProject.getState().doc.screens[0].root.children[0].props.text).toBe('Before');
  expect(runAgentTurn).toHaveBeenCalledWith('Original request');
});
