// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { openDB } from 'idb';
import { beforeAll, expect, it } from 'vitest';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { listProjects, openProject } from './save';
import { projectSchema } from './schema';
beforeAll(() => {
  Object.defineProperty(globalThis, 'indexedDB', {
    value: new IDBFactory(),
    configurable: true,
  });
});
it('recovers a poisoned legacy record once without blocking the shelf or deleting the original', async () => {
  const db = await openDB('museware', 2, {
    upgrade(db) {
      db.createObjectStore('projects');
      db.createObjectStore('meta');
    },
  });
  const old = JSON.parse(JSON.stringify(createProject('Legacy')));
  old.screens = [emptyScreen('Tea', { id: 'tea', entry: true })];
  old.opLog = [{ at: 1, source: 'muse', batch: [], summary: '' }];
  await db.put('projects', old, 'current');
  const items = await listProjects();
  expect(items).toHaveLength(1);
  expect(await db.get('projects', 'current')).toEqual(old);
  expect(await db.get('meta', 'legacy-migrated')).toBe(true);
  const restored = await openProject(items[0].id);
  expect(restored?.rail[0].text).toContain('older version');
  expect(projectSchema.safeParse(await db.get('projects', items[0].id)).success).toBe(true);
  expect(await listProjects()).toHaveLength(1);
  db.close();
});
it('unrecoverable legacy data does not block other entries or mark migration successful', async () => {
  const db = await openDB('museware', 2);
  await db.put('projects', { format: 'museware/1', screens: 'broken' }, 'current');
  await db.delete('meta', 'legacy-migrated');
  const before = await db.getAll('meta');
  expect((await listProjects()).length).toBeGreaterThan(0);
  expect(await db.get('meta', 'legacy-migrated')).toBeUndefined();
  expect((await db.getAll('meta')).length).toBe(before.length);
  db.close();
});
