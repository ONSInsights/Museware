// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { enterPanel } from './reveal';
import { NodeView } from './NodeView';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import type { RuntimeApi } from '../preview/runtime';
import { buildSingleHtml } from '../export/singleFile';
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});
function doc() {
  const d = createProject();
  const a = emptyScreen('Tea', { id: 'tea', entry: true });
  const b = emptyScreen('Shop', { id: 'shop' });
  a.root.children = [
    {
      id: 'tabs',
      type: 'tabs',
      props: { items: ['One', 'Two'] },
      styles: {},
      children: [
        { id: 'one', type: 'text', props: { text: 'One panel' }, styles: {}, children: [] },
        { id: 'two', type: 'text', props: { text: 'Two panel' }, styles: {}, children: [] },
      ],
    },
    { id: 'nav', type: 'navbar', props: { items: ['Shop'] }, styles: {}, children: [] },
  ];
  d.screens = [a, b];
  return d;
}
it('enter class is removed on its own animation end, and never added under reduced motion', () => {
  const el = document.createElement('div');
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  enterPanel(el);
  expect(el.classList.contains('mw-enter')).toBe(true);
  el.dispatchEvent(new Event('animationend'));
  expect(el.classList.contains('mw-enter')).toBe(false);
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  enterPanel(el);
  expect(el.classList.contains('mw-enter')).toBe(false);
});
it('Run tabs and screen switches use the same arrival class', async () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const d = doc();
  const runtime: RuntimeApi = {
    screenId: 'tea',
    screens: d.screens,
    state: {},
    setKey: () => {},
    toast: () => {},
    navigate: () => {},
    openUrl: () => {},
  };
  const { container, rerender } = render(
    <NodeView doc={d} screen={d.screens[0]} mode="run" runtime={runtime} />,
  );
  fireEvent.click(container.querySelectorAll('.mw-tab')[1]);
  await waitFor(() =>
    expect(container.querySelector('.n-two')?.classList.contains('mw-enter')).toBe(true),
  );
  fireEvent.animationEnd(container.querySelector('.n-two')!);
  expect(container.querySelector('.n-two')?.classList.contains('mw-enter')).toBe(false);
  rerender(<NodeView doc={d} screen={d.screens[1]} mode="run" runtime={runtime} />);
  expect(container.querySelector('.mw-app')?.classList.contains('mw-enter')).toBe(true);
});
it('standalone screen and tab paths add and remove the switch class', () => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  const parsed = new DOMParser().parseFromString(buildSingleHtml(doc()), 'text/html');
  document.body.innerHTML = parsed.body.innerHTML;
  window.eval(parsed.querySelector('script')!.textContent!);
  (document.querySelectorAll('[data-site-tab]')[1] as HTMLElement).click();
  const panel = document.querySelector<HTMLElement>('[data-site-panel="1"]')!;
  expect(panel.classList.contains('mw-enter')).toBe(true);
  panel.dispatchEvent(new Event('animationend'));
  expect(panel.classList.contains('mw-enter')).toBe(false);
  (document.querySelector('.n-nav .mw-nav-item') as HTMLElement).click();
  const app = document.querySelector<HTMLElement>('[data-screen="shop"] .mw-app')!;
  expect(app.classList.contains('mw-enter')).toBe(true);
  app.dispatchEvent(new Event('animationend'));
  expect(app.classList.contains('mw-enter')).toBe(false);
});
