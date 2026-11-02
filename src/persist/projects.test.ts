// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { IDBFactory } from 'fake-indexeddb';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { DIRECTION_PALETTES } from '../design/palettes';
import {
  closeProject,
  createSavedProject,
  deleteSavedProject,
  duplicateSavedProject,
  flushProject,
  listProjects,
  loadProject,
  openProject,
  renameSavedProject,
  saveProjectSoon,
} from './save';

// This suite owns its IndexedDB factory: other suites cannot upgrade its v1 fixture.
beforeAll(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
  });
});

describe('projects registry migration', () => {
  it('migrates current without losing its original, and saves each project separately', async () => {
    const old = await openDB('museware', 1, {
      upgrade(db) {
        db.createObjectStore('projects');
      },
    });
    const original = {
      ...createProject('Old tea'),
      screens: [emptyScreen('Tea', { id: 'tea', entry: true })],
    };
    await old.put('projects', original, 'current');
    old.close();
    const loaded = await loadProject();
    expect(loaded?.name).toBe('Old tea');
    expect(loaded?.screens[0].id).toBe('tea');
    const cards = await listProjects();
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({ name: 'Old tea', screenCount: 1 });
    const database = await openDB('museware', 2);
    expect(await database.get('projects', 'current')).toEqual(original);
    database.close();
    const second = await createSavedProject(createProject('Second'));
    saveProjectSoon(cards[0].id, { ...loaded!, name: 'Edited tea' });
    await flushProject();
    await openProject(second);
    saveProjectSoon(second, createProject('Second edited'));
    await closeProject();
    expect((await openProject(cards[0].id))?.name).toBe('Edited tea');
    expect((await openProject(second))?.name).toBe('Second edited');
    await closeProject();
    await renameSavedProject(second, 'Renamed');
    const copy = await duplicateSavedProject(second);
    expect((await listProjects()).map((p) => p.name)).toEqual(
      expect.arrayContaining(['Edited tea', 'Renamed', 'Renamed copy']),
    );
    await deleteSavedProject(copy);
    expect((await listProjects()).some((p) => p.id === copy)).toBe(false);
    const doomed = await createSavedProject(createProject('Deleted elsewhere'));
    const onError = vi.fn();
    saveProjectSoon(doomed, createProject('Unsaved changes'), onError);
    const otherTab = await openDB('museware', 2);
    const tx = otherTab.transaction(['projects', 'meta'], 'readwrite');
    await tx.objectStore('projects').delete(doomed);
    await tx.objectStore('meta').delete(`project:${doomed}`);
    await tx.done;
    otherTab.close();
    await flushProject();
    expect(onError).toHaveBeenCalledOnce();
    expect(await openProject(doomed)).toBeNull();
    expect((await listProjects()).some((p) => p.id === doomed)).toBe(false);
  });
});

it('persists retro-seeded themes when an existing project is opened', async () => {
  const old = createProject('Old custom');
  old.tokens.openuiTheme.brand_color = DIRECTION_PALETTES[1].hexes[0];
  old.tokens.openuiTheme.secondary_color = DIRECTION_PALETTES[1].hexes[1];
  delete old.themeLibrary;
  delete old.schemaVersion;
  const id = await createSavedProject(old);
  const opened = await openProject(id);
  expect(opened?.themeLibrary).toHaveLength(1);
  expect(opened?.themeLibrary?.[0].name).toBe('Old custom');
  const database = await openDB('museware', 2);
  const saved = await database.get('projects', id);
  expect(saved.themeLibrary).toEqual(opened?.themeLibrary);
  const second = await openProject(id);
  expect(second?.themeLibrary).toEqual(opened?.themeLibrary);
  database.close();
  await deleteSavedProject(id);
});
