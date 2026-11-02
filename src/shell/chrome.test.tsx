// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Topbar } from './Topbar';
import { useAgent } from '../store/useAgent';
import { createProject, useProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { OnboardingModal } from './modals/OnboardingModal';
import { SettingsModal } from './modals/SettingsModal';
import { ExportModal } from './modals/ExportModal';
import { ReceiptsModal } from './modals/ReceiptsModal';
import { ShortcutsModal } from './modals/ShortcutsModal';
afterEach(cleanup);
describe('shared shell chrome', () => {
  it.each([OnboardingModal, SettingsModal, ExportModal, ReceiptsModal, ShortcutsModal])(
    'uses the same modal shell',
    (Component) => {
      render(<Component onClose={vi.fn()} />);
      expect(screen.getByRole('dialog').closest('.modal-shell')).not.toBeNull();
      expect(
        screen.getByRole('dialog').querySelector('.modal-head button[aria-label=Close]'),
      ).toBeTruthy();
    },
  );
  it('renders the breakpoint switcher as a segmented group', () => {
    render(<Topbar />);
    const group = screen.getByRole('group', { name: 'Breakpoint' });
    expect(group.classList.contains('breakpoint-segmented')).toBe(true);
    expect(group.querySelectorAll('button')).toHaveLength(3);
    expect(group.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  });
  it('renders one action slot, switching Run to Stop when busy', () => {
    useProject
      .getState()
      .hydrate({
        ...createProject(),
        screens: [emptyScreen('Home', { id: 'home', entry: true })],
      });
    useAgent.setState({ busy: false });
    const view = render(<Topbar />);
    expect(screen.getByRole('button', { name: 'Run the app' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Stop the agent' })).toBeNull();
    act(() => useAgent.setState({ busy: true }));
    expect(screen.getByRole('button', { name: 'Stop the agent' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Run the app' })).toBeNull();
    view.unmount();
    useAgent.setState({ busy: false });
  });
  it('orders identity, structure, viewport, history, action and utilities, with utilities collapsing first', () => {
    useProject
      .getState()
      .hydrate({
        ...createProject(),
        screens: [emptyScreen('Home', { id: 'home', entry: true })],
      });
    const { container } = render(<Topbar />);
    const bar = container.querySelector('.topbar')!;
    const classes = [
      '.brand',
      '.project-name',
      '.screen-switcher',
      '.breakpoint-segmented',
      '.topbar-history',
      '.topbar-right',
    ];
    const children = Array.from(bar.children);
    expect(
      classes.map((selector) => children.indexOf(bar.querySelector(selector)!)),
    ).toEqual([0, 1, 2, 4, 5, 6]);
    expect(
      bar.querySelector('.topbar-right')?.firstElementChild?.classList.contains('run-btn'),
    ).toBe(true);
    const css = readFileSync('src/design/app.css', 'utf8');
    expect(css).toMatch(
      /@media \(max-width: 1100px\)[\s\S]*?\.topbar-utility\s*\{\s*display:\s*none/,
    );
    expect(css).toMatch(
      /@media \(max-width: 900px\)[\s\S]*?\.topbar-history\s*\{\s*display:\s*none/,
    );
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    expect(screen.getByText('Projects home')).toBeTruthy();
    expect(screen.getByText('Export the app…')).toBeTruthy();
  });
  it('keeps numeric inline heights out of touched shell files', () => {
    for (const file of [
      'src/inspector/ActionEditor.tsx',
      'src/shell/Topbar.tsx',
      'src/shell/Statusbar.tsx',
      ...['Settings', 'Export', 'Receipts', 'Shortcuts', 'Onboarding'].map(
        (name) => `src/shell/modals/${name}Modal.tsx`,
      ),
    ]) {
      expect(readFileSync(file, 'utf8')).not.toMatch(/style=\{\{\s*height\s*:\s*\d/);
    }
  });
});
