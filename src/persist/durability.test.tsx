// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { createProject, useProject } from '../store/useProject';
import { Topbar } from '../shell/Topbar';
import { createSavedProject, flushProject, openProject, saveProjectSoon } from './save';
import {
  emptyProjectLabel,
  readWriteResults,
  SAVE_LOG_KEY,
  useSaveStatus,
} from '../store/useSaveStatus';
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  localStorage.removeItem(SAVE_LOG_KEY);
});
it('queues 50 rapid writes without a timer and keeps every operation in the stored snapshot', async () => {
  const d = createProject('Rapid');
  const id = await createSavedProject(d);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  for (let i = 0; i < 50; i++) {
    const doc = {
      ...d,
      opLog: Array.from({ length: i + 1 }, (_, n) => ({
        at: n,
        source: 'user' as const,
        batch: [],
        summary: `op ${n}`,
      })),
    };
    saveProjectSoon(id, doc);
    vi.advanceTimersByTime(1);
  }
  await flushProject();
  vi.useRealTimers();
  expect((await openProject(id))?.opLog).toHaveLength(50);
  const history = readWriteResults();
  expect(history).toHaveLength(20);
  expect(history.every((e) => e.projectId === id && e.ok && e.bytes > 0)).toBe(true);
});
it('reports quota failures persistently in the topbar and clears them only on successful write', async () => {
  const d = createProject('Saving');
  const id = await createSavedProject(d);
  useProject.getState().hydrate(d, id);
  render(<Topbar />);
  expect(screen.getByText(/Saved /)).toBeTruthy();
  const put = vi.spyOn(IDBObjectStore.prototype, 'put').mockImplementationOnce(() => {
    throw new DOMException('full', 'QuotaExceededError');
  });
  await act(async () => {
    saveProjectSoon(id, { ...d, name: 'Unsaved' });
    await flushProject();
  });
  expect(await screen.findByText(/Not saving — device storage is full/)).toBeTruthy();
  expect(readWriteResults().at(-1)).toMatchObject({
    projectId: id,
    ok: false,
    errorName: 'QuotaExceededError',
  });
  put.mockRestore();
  await act(async () => {
    saveProjectSoon(id, { ...d, name: 'Saved again' });
    await flushProject();
  });
  await waitFor(() => expect(screen.queryByText(/Not saving/)).toBeNull());
  expect(screen.getByText(/Saved /)).toBeTruthy();
  expect((await openProject(id))?.name).toBe('Saved again');
});
it('grades empty labels by the project-specific failure evidence', async () => {
  const blank = createProject('Blank');
  const id = await createSavedProject(blank);
  expect(emptyProjectLabel(id)).toBe(
    'This project is empty — ask muse to build something.',
  );
  expect(emptyProjectLabel('other')).toBe(
    'This project is empty — ask muse to build something.',
  );
  useSaveStatus
    .getState()
    .record({
      projectId: id,
      at: Date.now(),
      ok: false,
      errorName: 'QuotaExceededError',
      bytes: 10,
    });
  expect(emptyProjectLabel(id)).toBe(
    'No content was stored — saves were failing (device storage was full)',
  );
  expect(emptyProjectLabel('other')).toBe(
    'This project is empty — ask muse to build something.',
  );
  useSaveStatus
    .getState()
    .record({
      projectId: id,
      at: Date.now(),
      ok: false,
      errorName: 'ProjectRemovedError',
      bytes: 10,
    });
  expect(emptyProjectLabel(id)).toBe(
    'No content was stored — the project was removed from this device',
  );
  localStorage.removeItem(SAVE_LOG_KEY);
  expect(emptyProjectLabel(id)).toBe(
    'This project is empty — ask muse to build something.',
  );
});
it('empty recovered records do not get a misleading recovery note', async () => {
  const id = await createSavedProject(createProject('Empty old'));
  const { openDB } = await import('idb');
  const db = await openDB('museware', 2);
  const old = await db.get('projects', id);
  old.opLog = [{ at: 1, source: 'muse', batch: [], summary: '' }];
  await db.put('projects', old, id);
  const opened = await openProject(id);
  expect(opened?.screens).toEqual([]);
  expect(opened?.rail).toEqual([]);
  expect(emptyProjectLabel(id)).toBe(
    'This project is empty — ask muse to build something.',
  );
  db.close();
});
