// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { emptyScreen } from '../ops/screenOps';
import { NodeView } from '../canvas/NodeView';
import { generateProjectFiles } from '../export/reactCodegen';
import { buildSingleHtml } from '../export/singleFile';
import { ProjectAppearanceControls } from './ProjectAppearanceControls';
import { projectAppearance } from './projectAppearance';

let light = false;
const listeners = new Set<() => void>();
beforeEach(() => {
  light = false;
  listeners.clear();
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      get matches() {
        return light;
      },
      addEventListener: (_: string, cb: () => void) => listeners.add(cb),
      removeEventListener: (_: string, cb: () => void) => listeners.delete(cb),
    })),
  );
  useProject.getState().replaceDoc(createProject());
  useUi.setState({ theme: 'light', projectPreview: { epoch: -1, mode: 'project' } });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});
function toggleDevice(isLight: boolean) {
  act(() => {
    light = isLight;
    listeners.forEach((cb) => cb());
  });
}

describe('project appearance policy', () => {
  it.each([
    ['DayNight', 'auto'],
    ['', 'auto'],
    ['unknown', 'auto'],
    [undefined, 'auto'],
    ['Light', 'light'],
    ['Dark', 'dark'],
    ['AUTO', 'auto'],
  ])('reads %s as %s without altering it', (value, expected) => {
    expect(projectAppearance(value)).toBe(expected);
  });
  it('saves only the chosen setting, and keeps preview temporary and independent of chrome', () => {
    const before = structuredClone(useProject.getState().doc.tokens.openuiTheme);
    render(<ProjectAppearanceControls />);
    fireEvent.change(screen.getByLabelText('Preview appearance'), {
      target: { value: 'light' },
    });
    expect(useProject.getState().doc.tokens.openuiTheme).toEqual(before);
    expect(useUi.getState().theme).toBe('light');
    fireEvent.change(screen.getByLabelText('Project appearance'), {
      target: { value: 'dark' },
    });
    expect(useProject.getState().doc.tokens.openuiTheme).toEqual({
      ...before,
      theme_mode: 'Dark',
    });
    act(() => {
      useProject.getState().undo();
    });
    expect(useProject.getState().doc.tokens.openuiTheme).toEqual(before);
    act(() => {
      useProject.getState().replaceDoc(createProject());
    });
    expect((screen.getByLabelText('Preview appearance') as HTMLSelectElement).value).toBe(
      'project',
    );
  });
  it('keeps canvas and Run aligned with project, temporary preview and device changes', () => {
    const page = emptyScreen('Home', { id: 'home', entry: true });
    const doc = createProject();
    doc.screens = [page];
    useProject.getState().replaceDoc(doc);
    const runtime = {
      screenId: 'home',
      state: {},
      screens: [page],
      setKey: vi.fn(),
      toast: vi.fn(),
      navigate: vi.fn(),
      openUrl: vi.fn(),
    };
    const view = render(<NodeView doc={doc} screen={page} mode="edit" />);
    const theme = () =>
      view.container.querySelector('[data-theme]')?.getAttribute('data-theme');
    expect(theme()).toBe('dark'); // editor chrome is light
    toggleDevice(true);
    expect(theme()).toBe('light');
    view.rerender(<NodeView doc={doc} screen={page} mode="run" runtime={runtime} />);
    expect(theme()).toBe('light');
    act(() => useUi.getState().setProjectPreview('dark'));
    expect(theme()).toBe('dark');
    act(() => useUi.getState().setProjectPreview('project'));
    expect(theme()).toBe('light');
    const fixed = structuredClone(doc);
    fixed.tokens.openuiTheme.theme_mode = 'Dark';
    view.rerender(<NodeView doc={fixed} screen={page} mode="run" runtime={runtime} />);
    expect(theme()).toBe('dark');
    toggleDevice(false);
    toggleDevice(true);
    expect(theme()).toBe('dark');
  });
  it.each([
    ['Light', 'light'],
    ['Dark', 'dark'],
    ['DayNight', 'auto'],
    ['legacy mode', 'auto'],
  ])(
    'embeds %s consistently in HTML and React without mutating custom colours',
    (saved, expected) => {
      const doc = createProject();
      doc.screens = [emptyScreen('Home', { id: 'home', entry: true })];
      doc.tokens.openuiTheme.theme_mode = saved;
      doc.tokens.openuiTheme.light_colors.openui_bg = '#' + '123456';
      const before = structuredClone(doc);
      expect(buildSingleHtml(doc)).toContain(`const appearance="${expected}"`);
      expect(generateProjectFiles(doc)['src/App.tsx']).toContain(
        `const appearance = "${expected}"`,
      );
      expect(doc).toEqual(before);
    },
  );
});
