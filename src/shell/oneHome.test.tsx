// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Topbar } from './Topbar';
import { Editor } from './Editor';
import { useAgent } from '../store/useAgent';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { emptyScreen } from '../ops/screenOps';

const setWidth = (width: number) => {
  Object.defineProperty(window, 'innerWidth', { value: width, configurable: true });
  act(() => window.dispatchEvent(new Event('resize')));
};
beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  setWidth(1280);
  useProject.getState().hydrate({
    ...createProject(),
    screens: [
      emptyScreen('Tea', { id: 'tea', entry: true }),
      emptyScreen('Menu', { id: 'menu' }),
    ],
  });
  useUi.setState({
    activeScreenId: 'tea',
    selectedId: null,
    runMode: false,
    route: 'editor',
  });
  useAgent.setState({ busy: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('one control, one home', () => {
  it('bans LayoutGrid and uses every imported lucide icon at most once', () => {
    const source = readFileSync('src/shell/Topbar.tsx', 'utf8');
    expect(source).not.toContain('LayoutGrid');
    const ast = ts.createSourceFile(
      'Topbar.tsx',
      source,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const icons = new Set<string>();
    for (const node of ast.statements)
      if (
        ts.isImportDeclaration(node) &&
        node.moduleSpecifier.getText(ast) === "'lucide-react'"
      ) {
        const names = node.importClause?.namedBindings;
        if (names && ts.isNamedImports(names))
          for (const element of names.elements) icons.add(element.name.text);
      }
    expect(icons.size).toBeGreaterThan(0);
    const counts = new Map<string, number>();
    const visit = (node: ts.Node) => {
      if (
        (ts.isJsxSelfClosingElement(node) || ts.isJsxOpeningElement(node)) &&
        ts.isIdentifier(node.tagName) &&
        icons.has(node.tagName.text)
      )
        counts.set(node.tagName.text, (counts.get(node.tagName.text) || 0) + 1);
      ts.forEachChild(node, visit);
    };
    visit(ast);
    for (const icon of icons) expect(counts.get(icon), icon).toBe(1);
  });
  it('has one Run in the editor and canvas toolbar only has breadcrumb, breakpoints and Fit', () => {
    const view = render(<Editor />);
    expect(view.container.querySelectorAll('button.run-btn')).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: /run the app/i })).toHaveLength(1);
    const toolbar = view.container.querySelector('.canvas-toolbar')!;
    expect(
      within(toolbar as HTMLElement).getByRole('navigation', {
        name: 'Selection breadcrumb',
      }),
    ).toBeTruthy();
    expect(
      within(toolbar as HTMLElement)
        .getByRole('group', { name: 'Breakpoint' })
        .querySelectorAll('button'),
    ).toHaveLength(3);
    expect(
      within(toolbar as HTMLElement).getByRole('button', {
        name: 'Toggle fit or 100 percent',
      }),
    ).toBeTruthy();
    expect(
      within(toolbar as HTMLElement).queryByRole('button', { name: /run|add screen/i }),
    ).toBeNull();
    expect(view.container.querySelector('.topbar [aria-label="Breakpoint"]')).toBeNull();
    expect(view.container.querySelectorAll('.statusbar button')).toHaveLength(0);
  });
  it('uses a single screens menu containing the checked list and all actions', () => {
    render(<Topbar />);
    fireEvent.click(screen.getByRole('button', { name: 'Screens menu' }));
    const menu = screen.getByRole('menu');
    expect(within(menu).getByText('✓ Tea').getAttribute('aria-current')).toBe('page');
    expect(within(menu).getByText('Menu')).toBeTruthy();
    for (const action of [
      'Add screen',
      'Duplicate current',
      'Rename current',
      'Delete current',
    ])
      expect(within(menu).getByText(action)).toBeTruthy();
    fireEvent.click(within(menu).getByText('Menu'));
    expect(useUi.getState().activeScreenId).toBe('menu');
  });
  it('deduplicates the overflow dynamically and puts narrow history first', () => {
    const view = render(<Topbar />);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    let menu = screen.getByRole('menu');
    expect(within(menu).queryByText('Undo')).toBeNull();
    expect(within(menu).queryByText('Export the app…')).toBeNull();
    expect(within(menu).queryByText('Receipts')).toBeNull();
    expect(screen.getByRole('button', { name: 'Muse menu' })).toBeTruthy();
    fireEvent.keyDown(window, { key: 'Escape' });
    setWidth(1024);
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    menu = screen.getByRole('menu');
    expect(within(menu).queryByText('Undo')).toBeNull();
    expect(within(menu).queryByText('Projects home')).toBeNull();
    expect(within(menu).getByText('Export the app…')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Projects home' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Project file' })).toBeNull();
    fireEvent.keyDown(window, { key: 'Escape' });
    setWidth(390);
    expect(view.container.querySelector('.topbar-history')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Muse menu' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Project file' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Projects home' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'More actions' }));
    menu = screen.getByRole('menu');
    expect(menu.querySelectorAll('button')[0].textContent).toBe('Undo');
    expect(menu.querySelectorAll('button')[1].textContent).toBe('Redo');
    for (const item of [
      'Projects home',
      'Open muse',
      'Receipts',
      'Settings & models',
      'Export the app…',
      'Download project .json',
      'Import project .json',
    ])
      expect(within(menu).getByText(item)).toBeTruthy();
    for (const prohibited of ['Add screen', 'Run', 'Stop', 'Compact 390'])
      expect(within(menu).queryByText(prohibited)).toBeNull();
  });
  it('shows a hidden count and opens the same screen menu when tabs overflow', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: HTMLElement,
    ) {
      const isTabs = this.classList.contains('screen-tabs');
      const i = this.classList.contains('screen-tab')
        ? Array.from(this.parentElement!.children).indexOf(this)
        : 0;
      const left = isTabs ? 0 : this.classList.contains('screen-tab') ? i * 120 : 0;
      const right = isTabs ? 100 : left + 80;
      return {
        left,
        right,
        top: 0,
        bottom: 30,
        width: right - left,
        height: 30,
        x: left,
        y: 0,
        toJSON() {},
      } as DOMRect;
    });
    render(<Topbar />);
    fireEvent.click(screen.getByRole('button', { name: '1 hidden screens' }));
    expect(within(screen.getByRole('menu')).getByText('Add screen')).toBeTruthy();
  });
});
