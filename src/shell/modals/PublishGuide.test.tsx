// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { PublishGuide } from './PublishGuide';
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
describe('publishing guide', () => {
  it('offers both hosts, selects each of the three flows and copies every shown field', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<PublishGuide />);
    const guide = screen.getByRole('region', { name: 'Publish' });
    expect(
      within(guide).getByRole('link', { name: 'GitHub Pages' }).getAttribute('href'),
    ).toBe('https://github.com/new');
    expect(within(guide).getByRole('link', { name: 'Vercel' }).getAttribute('href')).toBe(
      'https://vercel.com/new',
    );
    expect(guide.querySelector('input')).toBeNull();
    for (const [choice, heading] of [
      ['One file to share', 'Flow 1 — GitHub Pages'],
      ['Live in 10 seconds', 'Flow 2 — Vercel drag-and-drop'],
      ['A project that updates on push', 'Flow 3 — GitHub repo → Vercel import'],
    ]) {
      fireEvent.click(within(guide).getByRole('button', { name: choice }));
      expect(
        within(guide).getByRole('button', { name: choice }).getAttribute('aria-pressed'),
      ).toBe('true');
      expect(
        within(guide).getByRole('heading', { name: heading }).getAttribute('data-selected'),
      ).toBe('true');
      for (const button of within(guide).getAllByRole('button', { name: /^Copy / })) {
        const before = writeText.mock.calls.length;
        fireEvent.click(button);
        await waitFor(() => expect(writeText.mock.calls.length).toBe(before + 1));
        expect(writeText.mock.calls.at(-1)?.[0]).toBeTruthy();
      }
    }
    expect(
      within(guide).getByText(/Future Git pushes automatically redeploy/),
    ).toBeTruthy();
    expect(guide.querySelectorAll('input, textarea')).toHaveLength(0);
  });
});
