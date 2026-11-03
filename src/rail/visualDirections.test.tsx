// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import {
  generateVisualDrafts,
  visualBaseline,
  type VisualDraft,
} from '../muse/visualDrafts';
import { VisualDirections } from './VisualDirections';

vi.mock('../muse/visualDrafts', async (original) => ({
  ...(await original<typeof import('../muse/visualDrafts')>()),
  generateVisualDrafts: vi.fn(),
}));
vi.mock('../export/singleFile', () => ({
  buildSingleHtml: () => '<html><head></head><body>Preview</body></html>',
}));
const drafts = (): VisualDraft[] =>
  [1, 2, 3].map((i) => {
    const doc = createProject('Draft');
    const screen = {
      id: 'home',
      name: 'Home',
      root: {
        id: 'home_root',
        type: 'screen' as const,
        props: {},
        styles: {},
        children: [
          {
            id: `title_${i}`,
            type: 'heading' as const,
            props: { text: `Draft ${i}` },
            styles: {},
            children: [],
          },
        ],
      },
    };
    doc.screens = [screen];
    return { label: `Direction ${i}`, screen, document: doc };
  });
beforeEach(() => {
  useProject.getState().replaceDoc(createProject('Real'));
  useProject.getState().setBlueprint('SCREEN: Home\n- title (heading) Hello', false);
  useAgent.setState({ busy: false, demoMode: false, models: null });
  vi.mocked(generateVisualDrafts).mockReset();
});
afterEach(cleanup);
it('renders three isolated previews and requires a selection before building', async () => {
  vi.mocked(generateVisualDrafts).mockResolvedValue(drafts());
  const build = vi.fn();
  const before = structuredClone(useProject.getState().doc);
  render(<VisualDirections onBuild={build} />);
  expect(
    (screen.getByRole('button', { name: 'Build it' }) as HTMLButtonElement).disabled,
  ).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Preview three directions' }));
  await waitFor(() => expect(screen.getAllByRole('radio')).toHaveLength(3));
  expect(document.querySelectorAll('iframe')).toHaveLength(3);
  expect(visualBaseline(useProject.getState().doc)).toEqual(visualBaseline(before));
  fireEvent.click(screen.getByRole('radio', { name: 'Direction 2' }));
  fireEvent.click(screen.getByRole('button', { name: 'Build it' }));
  expect(build).toHaveBeenCalledWith(
    expect.objectContaining({ label: 'Direction 2' }),
    expect.any(Number),
    expect.any(String),
  );
});
it('reports preview failure without presenting partial choices', async () => {
  vi.mocked(generateVisualDrafts).mockRejectedValue(
    new Error('Provider does not support images'),
  );
  render(<VisualDirections onBuild={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Preview three directions' }));
  await waitFor(() =>
    expect(screen.getByRole('status').textContent).toContain(
      'Provider does not support images',
    ),
  );
  expect(screen.queryAllByRole('radio')).toHaveLength(0);
});
it('discards pending previews on project switch', async () => {
  let resolve!: (value: VisualDraft[]) => void;
  vi.mocked(generateVisualDrafts).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  render(<VisualDirections onBuild={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Preview three directions' }));
  expect(screen.getByRole('button', { name: 'Stop previews' })).toBeTruthy();
  useProject.getState().replaceDoc(createProject('Other'));
  resolve(drafts());
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Stop previews' })).toBeNull(),
  );
  expect(screen.queryAllByRole('radio')).toHaveLength(0);
  expect(useProject.getState().doc.screens).toHaveLength(0);
});
it('stopping a late preview leaves the design unchanged', async () => {
  let resolve!: (value: VisualDraft[]) => void;
  vi.mocked(generateVisualDrafts).mockReturnValue(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const before = structuredClone(useProject.getState().doc);
  render(<VisualDirections onBuild={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Preview three directions' }));
  fireEvent.click(screen.getByRole('button', { name: 'Stop previews' }));
  resolve(drafts());
  await waitFor(() =>
    expect(screen.queryByRole('button', { name: 'Stop previews' })).toBeNull(),
  );
  expect(screen.queryAllByRole('radio')).toHaveLength(0);
  expect(visualBaseline(useProject.getState().doc)).toEqual(visualBaseline(before));
});
