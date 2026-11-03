// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { RailCard } from './RailCard';
import type { RailEntry } from '../types/tree';

afterEach(cleanup);
it('shows the plan and approval actions without a fake screen thumbnail', () => {
  const entry: RailEntry = {
    id: 'plan', at: 1, role: 'card', text: 'Blueprint ready',
    card: { kind: 'blueprint', state: 'pending', data: {
      title: 'Home', blueprint: 'RULES\nSCREEN: Home\n- title (heading) Hello\nLOOK: pad 16\nSTATE: none\nWIRING: none',
    } },
  };
  const { container } = render(<RailCard entry={entry} />);
  expect(screen.getByRole('region', { name: 'Blueprint details' }).textContent).toContain('SCREEN: Home');
  expect(screen.getByRole('button', { name: /Build it/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Adjust it/ })).toBeTruthy();
  expect(container.querySelector('.thumb-card')).toBeNull();
  expect(container.querySelector('.thumb-strip')).toBeNull();
});
