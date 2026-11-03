// @vitest-environment jsdom
import { afterEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
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

it('expands and collapses the full blueprint without losing approval or adjustment controls', () => {
  const entry: RailEntry = {
    id: 'plan', at: 1, role: 'card', text: 'Blueprint ready',
    card: { kind: 'blueprint', state: 'pending', data: { blueprint: 'First detail\nLast detail' } },
  };
  render(<RailCard entry={entry} />);
  const details = screen.getByRole('region', { name: 'Blueprint details' });
  const expand = screen.getByRole('button', { name: 'Expand blueprint' });
  expect(expand.getAttribute('aria-expanded')).toBe('false');
  expect(expand.getAttribute('aria-controls')).toBe(details.id);
  fireEvent.click(expand);
  expect(details.classList.contains('blueprint-text-expanded')).toBe(true);
  expect(details.textContent).toContain('Last detail');
  expect(screen.getByRole('button', { name: 'Show less' }).getAttribute('aria-expanded')).toBe('true');
  fireEvent.click(screen.getByRole('button', { name: /Adjust it/ }));
  expect(screen.getByPlaceholderText(/What should change/)).toBeTruthy();
  expect(details.classList.contains('blueprint-text-expanded')).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Show less' }));
  expect(details.classList.contains('blueprint-text-expanded')).toBe(false);
  expect(screen.getByRole('button', { name: 'Send adjustment' })).toBeTruthy();
});
