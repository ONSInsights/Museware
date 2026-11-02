// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { Canvas } from './Canvas';
import { CanvasStyle } from './NodeView';
import {
  generateCss,
  generateFullCss,
  MOTION_DICTIONARY,
  SWITCH_MOTION_CSS,
  UTILITY_CSS,
} from './cssGen';
import { useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import type { ComponentNode } from '../types/tree';

const node = (
  id: string,
  type: ComponentNode['type'],
  styles: ComponentNode['styles'] = {},
): ComponentNode => ({ id, type, styles, props: {}, children: [] });
function fixture() {
  const root = node('page', 'screen');
  root.children = [
    node('long', 'col', { height: '1500px' }),
    node('marquee_test', 'marquee'),
    node('clipped', 'card', { overflow: 'hidden' }),
    node('clipped2', 'card', { overflow: 'clip' }),
    node('divider_test', 'divider', { overflow: 'hidden' }),
  ];
  return {
    ...useProject.getState().doc,
    screens: [{ id: 'page', name: 'Long page', entry: true, root }],
  };
}
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
it('sets the editor scrolling frame and preserves the definite wrapper', () => {
  const css = readFileSync('src/design/app.css', 'utf8');
  expect(css).toMatch(/\.frame-viewport\s*\{[^}]*overflow-y:\s*auto/s);
  expect(css).toMatch(/\.frame-viewport\s*>\s*\.mw-css-root\s*\{\s*height:\s*100%/);
  expect(css).toMatch(
    /\.frame-viewport \.mw-app,\s*\.frame-viewport \.mw-app > \[class\^='n-'\]\s*\{\s*height:\s*auto;\s*min-height:\s*100%/,
  );
});
it('floors clipped nodes and marquee only in the editor, never dividers', () => {
  const doc = fixture();
  const base = generateFullCss(doc);
  expect(base).toBe(
    `${generateCss(doc)}\n${MOTION_DICTIONARY}\n${SWITCH_MOTION_CSS}\n${UTILITY_CSS}`,
  );
  expect(generateFullCss(doc, { editScope: false })).toBe(base);
  const edit = generateFullCss(doc, { editScope: true, scrollModel: 'web' });
  for (const id of ['marquee_test', 'clipped', 'clipped2'])
    expect(edit).toContain(`.frame-viewport .n-${id}{min-height:var(--mw-hug-min)}`);
  expect(edit).not.toContain(
    '.frame-viewport .n-divider_test{min-height:var(--mw-hug-min)}',
  );
  expect(base).not.toContain('--mw-hug-min');
  const a = render(<CanvasStyle doc={doc} />);
  const runHomeExport = a.container.querySelector('style')!.textContent!;
  expect(runHomeExport.endsWith(base)).toBe(true);
  a.unmount();
  const b = render(<CanvasStyle doc={doc} editScope />);
  expect(b.container.querySelector('style')!.textContent!.endsWith(edit)).toBe(true);
});
it('renders a selectable marquee on a long canvas page', async () => {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  const doc = fixture();
  useProject.getState().replaceDoc(doc);
  useUi.setState({
    activeScreenId: 'page',
    selectedId: null,
    route: 'editor',
    breakpoint: 'compact',
    runMode: false,
  });
  render(<Canvas />);
  const marquee = document.querySelector<HTMLElement>('.frame-viewport .n-marquee_test')!;
  expect(marquee).toBeTruthy();
  // jsdom has no layout engine; model the browser's 28px floor for hit-testing.
  vi.spyOn(marquee, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: 200,
    bottom: 28,
    width: 200,
    height: 28,
    toJSON() {},
  });
  expect(marquee.getBoundingClientRect().height).toBeGreaterThan(0);
  fireEvent.click(marquee);
  expect(useUi.getState().selectedId).toBe('marquee_test');
  await waitFor(() => expect(document.querySelector('.selection-outline')).toBeTruthy());
  const ring = document.querySelector<HTMLElement>('.selection-outline')!;
  expect(parseFloat(ring.style.height)).toBeGreaterThanOrEqual(28);
});
