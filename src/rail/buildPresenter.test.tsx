// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { beginTurnJournal } from '../muse/turnJournal';
import {
  buildTimeline,
  startBuildPresenter,
  stopBuildPresenter,
} from '../muse/buildPresenter';
import { RailCard } from './RailCard';
import { emptyScreen } from '../ops/screenOps';
afterEach(() => {
  stopBuildPresenter();
  cleanup();
  vi.useRealTimers();
  useAgent.setState({ busy: false });
});
it('updates one card in place and keeps narration and quality inside disclosures', () => {
  vi.useFakeTimers();
  const doc = createProject();
  doc.screens = [emptyScreen('Home', { id: 'home', entry: true })];
  useProject.getState().replaceDoc(doc);
  useAgent.setState({ busy: false, assetJobs: [], progress: null });
  useAgent.getState().startTurn();
  const journal = beginTurnJournal('Build');
  const id = startBuildPresenter(journal);
  function View() {
    const entry = useProject((s) => s.doc.rail.find((item) => item.id === id)!);
    return <RailCard entry={entry} />;
  }
  render(<View />);
  act(() => {
    buildTimeline('Hero and press strip are in.');
    useProject
      .getState()
      .applyBatch([{ op: 'renameScreen', id: 'home', name: 'New Home' }], {
        source: 'agent',
      });
    useAgent.setState({ reviewNotes: '[warn] hero: Check contrast.' });
    vi.advanceTimersByTime(3000);
  });
  expect(useProject.getState().doc.rail.filter((item) => item.id === id)).toHaveLength(1);
  expect(screen.getByText(/3s · 1 ops/)).toBeTruthy();
  expect(screen.queryByText(/Images 0/)).toBeNull();
  expect(screen.getByText('Progress (1)')).toBeTruthy();
  expect(screen.getByText('Quality notes (1)')).toBeTruthy();
  expect(screen.getByText('[warn] hero: Check contrast.')).toBeTruthy();
  journal.unsubscribe?.();
});
