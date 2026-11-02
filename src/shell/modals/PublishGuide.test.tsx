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
describe('publishing stepper', () => {
  it('shows one card at a time, goes forward and back, and resets when switching flows', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    render(<PublishGuide />);
    const guide = screen.getByRole('region', { name: 'Publish' });
    expect(within(guide).getByText(/GitHub Pages and Vercel both host free/)).toBeTruthy();
    const flows = [
      [
        'One file to share',
        'Create a repository',
        'Turn on GitHub Pages',
        'https://username.github.io/repo-name/',
      ],
      [
        'Live in 10 seconds',
        'Open Vercel Drop',
        'Deploy your site',
        'https://project.vercel.app',
      ],
      [
        'A project that updates on push',
        'Create a GitHub repository',
        'Import and deploy on Vercel',
        'https://project.vercel.app',
      ],
    ];
    for (const [choice, start, finish, expected] of flows) {
      fireEvent.click(within(guide).getByRole('button', { name: choice }));
      expect(
        within(guide).getByRole('button', { name: choice }).getAttribute('aria-pressed'),
      ).toBe('true');
      expect(within(guide).getByRole('img', { name: 'Step 1 of 3' })).toBeTruthy();
      expect(within(guide).getByText(start)).toBeTruthy();
      const copy = within(guide).getByRole('button', { name: /^Copy https:/ });
      fireEvent.click(copy);
      await waitFor(() => expect(writeText).toHaveBeenCalled());
      fireEvent.click(within(guide).getByRole('button', { name: 'Next step →' }));
      expect(within(guide).getByRole('img', { name: 'Step 2 of 3' })).toBeTruthy();
      fireEvent.click(within(guide).getByRole('button', { name: 'Back' }));
      expect(within(guide).getByText(start)).toBeTruthy();
      fireEvent.click(within(guide).getByRole('button', { name: 'Next step →' }));
      fireEvent.click(within(guide).getByRole('button', { name: 'Next step →' }));
      expect(within(guide).getByRole('img', { name: 'Step 3 of 3' })).toBeTruthy();
      expect(within(guide).getByText(finish)).toBeTruthy();
      expect(within(guide).getByText(expected)).toBeTruthy();
      expect(within(guide).queryByRole('button', { name: 'Next step →' })).toBeNull();
      expect(guide.querySelectorAll('input, textarea')).toHaveLength(0);
    }
  });
  it('explains GitHub Actions specifically for React projects', () => {
    render(<PublishGuide format="react" />);
    fireEvent.click(screen.getByRole('button', { name: 'Next step →' }));
    expect(screen.getByText(/hidden .github folder/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Next step →' }));
    expect(screen.getByText(/choose GitHub Actions as the Source/)).toBeTruthy();
  });
});
