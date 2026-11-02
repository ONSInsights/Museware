// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, expect, it } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { Topbar } from './Topbar';
import { createProject, useProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { createSavedProject, listProjects } from '../persist/save';
import { useUi } from '../store/useUi';
afterEach(cleanup);
function file(raw: unknown) {
  const text = JSON.stringify(raw);
  const file = new File([text], 'backup.json', { type: 'application/json' });
  Object.defineProperty(file, 'text', { value: async () => text });
  return { file, text };
}
it('shows recovered preview, cancels without writing, and imports as a new record only on confirmation', async () => {
  const original = createProject('Current');
  const id = await createSavedProject(original);
  useProject.getState().hydrate(original, id);
  useUi.setState({ route: 'editor' });
  const old = JSON.parse(JSON.stringify(createProject('Old tea')));
  old.screens = [emptyScreen('Tea', { id: 'tea', entry: true })];
  old.opLog = [{ at: 1, source: 'muse', batch: [], summary: '' }];
  const backup = file(old);
  render(<Topbar />);
  const input = document.querySelector('input[type=file]')!;
  const before = (await listProjects()).length;
  fireEvent.change(input, { target: { files: [backup.file] } });
  const dialog = await screen.findByRole('dialog', { name: 'Older backup' });
  expect(within(dialog).getAllByText('Older backup')[1]).toBeTruthy();
  expect((await listProjects()).length).toBe(before);
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect((await listProjects()).length).toBe(before);
  fireEvent.change(input, { target: { files: [backup.file] } });
  const again = await screen.findByRole('dialog', { name: 'Older backup' });
  fireEvent.click(within(again).getByRole('button', { name: 'Import recovered' }));
  await waitFor(() => expect(useProject.getState().doc.name).toBe('Old tea'));
  expect((await listProjects()).length).toBe(before + 1);
  expect(useProject.getState().projectId).not.toBe(id);
  expect(useProject.getState().doc.rail[0].text).toContain('older version');
  expect(await backup.file.text()).toBe(backup.text);
});
it('imports a strict-pass file without a recovery dialog', async () => {
  const doc = createProject('Clean backup');
  useProject.getState().hydrate(createProject('Current'));
  render(<Topbar />);
  fireEvent.change(document.querySelector('input[type=file]')!, {
    target: { files: [file(doc).file] },
  });
  await waitFor(() => expect(useProject.getState().doc.name).toBe('Clean backup'));
  expect(screen.queryByRole('dialog', { name: 'Older backup' })).toBeNull();
});
