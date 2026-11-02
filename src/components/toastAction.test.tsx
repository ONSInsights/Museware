// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Toasts } from './ui';
import { useUi } from '../store/useUi';

afterEach(() => {
  cleanup();
  useUi.setState({ toasts: [] });
  vi.useRealTimers();
});
it('renders and runs a toast action once, with a six second window', () => {
  vi.useFakeTimers();
  const run = vi.fn();
  render(<Toasts />);
  act(() => {
    useUi.getState().toast('Restyled button —', 'ok', { label: 'Undo', run });
    vi.advanceTimersByTime(5900);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  expect(run).toHaveBeenCalledOnce();
  expect(screen.queryByRole('button', { name: 'Undo' })).toBeNull();
});
