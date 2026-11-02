import { beforeEach, describe, expect, it } from 'vitest';
import { createProject, useProject } from '../store/useProject';
import { emptyScreen } from './screenOps';
import { opSchema } from '../types/tools';
import { editCanvasWire } from '../types/wire';

beforeEach(() =>
  useProject
    .getState()
    .replaceDoc({
      ...createProject(),
      screens: [emptyScreen('Tea', { id: 'tea', entry: true })],
    }),
);
describe('setMockData', () => {
  it('writes, replaces, logs and undoes data as one group', () => {
    const op = {
      op: 'setMockData',
      screenId: 'tea',
      key: 'tea_picks',
      rows: [{ name: 'Sencha', price: 12, available: true }],
    };
    expect(editCanvasWire.safeParse({ ops: [op] }).success).toBe(true);
    expect(useProject.getState().applyBatch([op], { source: 'agent' }).errors).toEqual([]);
    expect(useProject.getState().doc.screens[0].mockData?.tea_picks).toEqual(op.rows);
    expect(useProject.getState().doc.opLog.at(-1)?.batch[0]).toEqual(op);
    expect(useProject.getState().undoStack).toHaveLength(1);
    useProject.getState().undo();
    expect(useProject.getState().doc.screens[0].mockData?.tea_picks).toBeUndefined();
    useProject.getState().redo();
    expect(
      useProject.getState().setDataRows('tea', 'tea_picks', [{ name: 'Hojicha' }]),
    ).toBe(true);
    expect(useProject.getState().doc.screens[0].mockData?.tea_picks).toEqual([
      { name: 'Hojicha' },
    ]);
  });
  it('rejects invalid keys, complex values, over 100 rows and absent screens', () => {
    const op = {
      op: 'setMockData',
      screenId: 'tea',
      key: 'tea_picks',
      rows: [{ name: 'Tea' }],
    };
    for (const bad of [
      { ...op, key: 'Bad-Key' },
      { ...op, key: '' },
      { ...op, rows: Array.from({ length: 101 }, () => ({})) },
      { ...op, rows: [{ nested: {} }] },
      { ...op, rows: [{ value: null }] },
      { ...op, rows: [{ value: Infinity }] },
    ])
      expect(opSchema.safeParse(bad).success).toBe(false);
    expect(
      opSchema.safeParse({ ...op, rows: Array.from({ length: 100 }, () => ({})) }).success,
    ).toBe(true);
    const before = structuredClone(useProject.getState().doc);
    expect(
      useProject
        .getState()
        .applyBatch([{ ...op, screenId: 'missing' }], { source: 'agent' }).errors[0].code,
    ).toBe('E_SCREEN_MISSING');
    expect(useProject.getState().doc).toEqual(before);
  });
});
