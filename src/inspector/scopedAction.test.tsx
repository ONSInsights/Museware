// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Inspector } from './Inspector';
import { emptyScreen } from '../ops/screenOps';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { useAgent } from '../store/useAgent';
import { runScopedAction } from '../muse/loop';

vi.mock('../muse/loop', async (original) => ({
  ...(await original<typeof import('../muse/loop')>()),
  runScopedAction: vi.fn(),
}));
beforeEach(() => {
  vi.mocked(runScopedAction).mockReset();
  const page = emptyScreen('Test', { id: 'tea', entry: true });
  page.root.children = [
    { id: 'widget', type: 'section', props: {}, styles: {}, children: [] },
  ];
  useProject.getState().hydrate({ ...createProject(), screens: [page] });
  useUi.setState({
    activeScreenId: 'tea',
    selectedId: 'widget',
    propertiesOpen: true,
    inspectorCollapsed: false,
  });
  useAgent.setState({ busy: false });
});
afterEach(cleanup);
describe('scoped editor feedback', () => {
  it('clears on dispatch and restores text if dispatch rejects', async () => {
    vi.mocked(runScopedAction).mockRejectedValueOnce(new Error('dispatch failed'));
    render(<Inspector />);
    const input = screen.getByLabelText('Scoped design instruction') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'Make it glass' } });
    fireEvent.click(screen.getByRole('button', { name: /Edit this widget/ }));
    expect(input.value).toBe('');
    expect(runScopedAction).toHaveBeenCalledWith('widget', 'Make it glass', true);
    await waitFor(() => expect(input.value).toBe('Make it glass'));
  });
  it('limits instructions to 1000 characters and shows the counter after 600', () => {
    render(<Inspector />);
    const input = screen.getByLabelText('Scoped design instruction') as HTMLTextAreaElement;
    expect(input.maxLength).toBe(1000);
    fireEvent.change(input, { target: { value: 'a'.repeat(1001) } });
    expect(input.value).toHaveLength(1000);
    expect(screen.getByText('1000/1000')).toBeTruthy();
  });
  it('shows a working status instead of edit buttons and disables instruction', () => {
    useAgent.setState({ busy: true });
    render(<Inspector />);
    expect(screen.getByRole('status').textContent).toContain(
      'Muse is editing this widget…',
    );
    expect(
      (screen.getByLabelText('Scoped design instruction') as HTMLInputElement).disabled,
    ).toBe(true);
    expect(screen.queryByRole('button', { name: /Edit this widget/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Redesign this section/ })).toBeNull();
  });
});
