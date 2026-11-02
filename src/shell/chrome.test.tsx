// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { Topbar } from './Topbar';
import { Segmented } from '../components/ui';
import { Canvas } from '../canvas/Canvas';
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
  it('adds an optional class only to the requested segmented control', () => {
    const options = [
      { value: 'a', label: 'A' },
      { value: 'b', label: 'B' },
    ];
    const view = render(
      <Segmented label="Bare" value="a" options={options} onChange={() => {}} />,
    );
    expect(screen.getByRole('group', { name: 'Bare' }).className).toBe('segmented');
    view.rerender(
      <Segmented
        label="Custom"
        value="a"
        options={options}
        onChange={() => {}}
        className="insp-tabs"
      />,
    );
    expect(screen.getByRole('group', { name: 'Custom' }).className).toBe(
      'segmented insp-tabs',
    );
  });
  it('renders the breakpoint switcher as a segmented group', () => {
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    useProject.getState().hydrate({
      ...createProject(),
      screens: [emptyScreen('Home', { id: 'home', entry: true })],
    });
    render(<Canvas />);
    const group = screen.getByRole('group', { name: 'Breakpoint' });
    expect(group.classList.contains('breakpoint-segmented')).toBe(true);
    expect(group.querySelectorAll('button')).toHaveLength(3);
    expect(group.querySelectorAll('[aria-pressed="true"]')).toHaveLength(1);
  });
  it('renders one action slot, switching Run to Stop when busy', () => {
    useProject.getState().hydrate({
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
