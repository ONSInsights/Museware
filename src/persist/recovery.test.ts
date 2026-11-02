// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { openDB } from 'idb';
import { expect, it, vi } from 'vitest';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { parseProjectDoc, projectSchema, recoveryMessage, wasRecovered } from './schema';
import {
  createSavedProject,
  flushProject,
  listProjects,
  openProject,
  readProjectFile,
  saveProjectSoon,
} from './save';

function poisoned() {
  const doc = createProject('Tea');
  doc.screens = [emptyScreen('Tea screen', { id: 'tea', entry: true })];
  doc.screens[0].root.children = [
    {
      id: 'title',
      type: 'heading',
      props: { text: 'Preserve me' },
      styles: {},
      children: [],
    },
  ];
  const raw = JSON.parse(JSON.stringify(doc));
  raw.name = 'T'.repeat(90);
  raw.opLog = [{ at: 1, source: 'muse', batch: [], summary: 'old' }];
  raw.rail = [
    {
      id: 'old',
      at: 1,
      role: 'card',
      text: 'x',
      card: { kind: 'retired', state: 'pending', data: {} },
    },
  ];
  raw.screens[0].root.children[0].styles.justify = 'retired';
  raw.screens[0].mockData = { items: [{ name: 'tea', legacy: { a: 1 } }] };
  return raw;
}
it('recovers poisoned history, name, style and data without losing art, with an honest receipt', () => {
  const raw = poisoned();
  const before = JSON.stringify(raw);
  const doc = parseProjectDoc(raw);
  expect(JSON.stringify(raw)).toBe(before);
  expect(wasRecovered(doc)).toBe(true);
  expect((doc as typeof doc & { recoveredFromSchema: boolean }).recoveredFromSchema).toBe(
    true,
  );
  expect(doc.name).toHaveLength(80);
  expect(doc.opLog).toEqual([]);
  expect(doc.rail).toEqual([]);
  expect(doc.screens[0].root.children[0].props.text).toBe('Preserve me');
  expect(doc.screens[0].root.children[0].styles.justify).toBeUndefined();
  expect(doc.screens[0].mockData?.items[0].legacy).toBe('[object Object]');
  expect(recoveryMessage(doc)).toContain(
    'name, 1 style value(s) on Tea screen, 1 data cell(s)',
  );
  expect(recoveryMessage(doc)).not.toContain('Nothing else changed');
  expect(projectSchema.safeParse(JSON.parse(JSON.stringify(doc))).success).toBe(true);
  expect(() => parseProjectDoc(raw, { strict: true })).toThrow();
});
it.each(['history', 'retired card', 'name', 'style', 'cell'])(
  'recovers a standalone %s fault',
  (fault) => {
    const doc = createProject('Fixture');
    doc.screens = [emptyScreen('Tea', { id: 'tea', entry: true })];
    doc.screens[0].root.children = [
      { id: 'title', type: 'heading', props: { text: 'Art' }, styles: {}, children: [] },
    ];
    const raw = JSON.parse(JSON.stringify(doc));
    if (fault === 'history')
      raw.opLog = [{ at: 1, source: 'muse', batch: [], summary: '' }];
    if (fault === 'retired card')
      raw.rail = [
        {
          id: 'old',
          at: 1,
          role: 'card',
          text: '',
          card: { kind: 'retired', state: 'pending', data: {} },
        },
      ];
    if (fault === 'name') raw.name = 'a'.repeat(81);
    if (fault === 'style') raw.screens[0].root.children[0].styles.justify = 'wrong';
    if (fault === 'cell') raw.screens[0].mockData = { rows: [{ value: { old: true } }] };
    const recovered = parseProjectDoc(raw);
    expect(wasRecovered(recovered)).toBe(true);
    expect(recovered.screens[0].root.children[0].props.text).toBe('Art');
    expect(recovered.opLog).toEqual([]);
    expect(recovered.rail).toEqual([]);
    expect(projectSchema.safeParse(recovered).success).toBe(true);
  },
);
it('clean documents stay clean through the read and strict tiers', () => {
  const doc = createProject('Clean');
  const once = parseProjectDoc(doc);
  const again = parseProjectDoc(once, { strict: true });
  expect(again).toEqual(once);
  expect(wasRecovered(once)).toBe(false);
});
it('opens and saves recovery exactly once without persisting its marker', async () => {
  const id = await createSavedProject(createProject('Replace with legacy'));
  const db = await openDB('museware', 2);
  await db.put('projects', poisoned(), id);
  const first = await openProject(id);
  expect(first?.rail).toHaveLength(1);
  expect(first?.rail[0].text).toContain('Adjusted fields:');
  expect(
    (first as typeof first & { recoveredFromSchema: boolean }).recoveredFromSchema,
  ).toBe(true);
  const saved = await db.get('projects', id);
  expect(saved.recoveredFromSchema).toBeUndefined();
  expect(projectSchema.safeParse(saved).success).toBe(true);
  const second = await openProject(id);
  expect(second?.rail).toHaveLength(1);
  expect(wasRecovered(second!)).toBe(false);
  db.close();
});
it('rejects non-project files and keeps source bytes unchanged during recovered preview', async () => {
  const text = JSON.stringify(poisoned());
  const file = { text: async () => text } as File;
  const result = await readProjectFile(file);
  expect(wasRecovered(result)).toBe(true);
  expect(await file.text()).toBe(text);
  await expect(
    readProjectFile({ text: async () => '{"screens":[]}' } as File),
  ).rejects.toThrow("This doesn't look like a Museware project file.");
});
it('pagehide flushes pending work before debounce', async () => {
  const id = await createSavedProject(createProject('Before'));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  saveProjectSoon(id, createProject('After'));
  window.dispatchEvent(new Event('pagehide'));
  await flushProject();
  vi.useRealTimers();
  expect((await openProject(id))?.name).toBe('After');
  expect((await listProjects()).some((p) => p.id === id)).toBe(true);
});
it('visibility hidden flushes a pending write', async () => {
  const id = await createSavedProject(createProject('Before hidden'));
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  saveProjectSoon(id, createProject('After hidden'));
  const prior = Object.getOwnPropertyDescriptor(document, 'visibilityState');
  Object.defineProperty(document, 'visibilityState', {
    value: 'hidden',
    configurable: true,
  });
  document.dispatchEvent(new Event('visibilitychange'));
  await flushProject();
  if (prior) Object.defineProperty(document, 'visibilityState', prior);
  else Reflect.deleteProperty(document, 'visibilityState');
  vi.useRealTimers();
  expect((await openProject(id))?.name).toBe('After hidden');
});
