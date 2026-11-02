// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { armReveals } from './reveal';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { NodeView } from './NodeView';
import { buildSingleHtml } from '../export/singleFile';
let callback: IntersectionObserverCallback;
const observe = vi.fn();
const unobserve = vi.fn();
const disconnect = vi.fn();
function observer() {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(cb: IntersectionObserverCallback) {
        callback = cb;
      }
      observe = observe;
      unobserve = unobserve;
      disconnect = disconnect;
    },
  );
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  observe.mockReset();
  unobserve.mockReset();
  disconnect.mockReset();
});
function fixture() {
  const doc = createProject();
  const screen = emptyScreen('Tea', { id: 'tea', entry: true });
  screen.root.children = [
    { id: 'section', type: 'section', props: { motion: 'rise' }, styles: {}, children: [] },
  ];
  doc.screens = [screen];
  return doc;
}
it('arms only with an observer and reveals once on intersection', () => {
  observer();
  const root = document.createElement('div');
  root.innerHTML = '<section data-motion-reveal></section>';
  const target = root.firstElementChild!;
  const dispose = armReveals(root);
  expect(root.hasAttribute('data-motion-armed')).toBe(true);
  expect(observe).toHaveBeenCalledWith(target);
  callback(
    [{ target, isIntersecting: true } as IntersectionObserverEntry],
    {} as IntersectionObserver,
  );
  expect(target.classList.contains('is-in')).toBe(true);
  expect(unobserve).toHaveBeenCalledWith(target);
  dispose();
  expect(root.hasAttribute('data-motion-armed')).toBe(false);
  expect(disconnect).toHaveBeenCalled();
});
it('never arms without observer, under reduced motion, or when no-arm is requested', () => {
  const root = document.createElement('div');
  root.innerHTML = '<section data-motion-reveal></section>';
  vi.stubGlobal('IntersectionObserver', undefined);
  armReveals(root);
  expect(root.hasAttribute('data-motion-armed')).toBe(false);
  observer();
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
  armReveals(root);
  expect(root.hasAttribute('data-motion-armed')).toBe(false);
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  armReveals(root, { noArm: true });
  expect(root.hasAttribute('data-motion-armed')).toBe(false);
});
it('editor and screenshot rendering never arm; Run does', () => {
  observer();
  const doc = fixture();
  const { rerender, container } = render(
    <NodeView doc={doc} screen={doc.screens[0]} mode="edit" />,
  );
  expect(container.querySelector('[data-motion-armed]')).toBeNull();
  rerender(<NodeView doc={doc} screen={doc.screens[0]} mode="run" noMotionArm />);
  expect(container.querySelector('[data-motion-armed]')).toBeNull();
  rerender(<NodeView doc={doc} screen={doc.screens[0]} mode="run" />);
  expect(container.querySelector('[data-motion-armed]')).toBeTruthy();
});
it('export HTML markup starts unarmed without executing scripts', () => {
  const html = buildSingleHtml(fixture());
  const parsed = new DOMParser().parseFromString(html, 'text/html');
  expect(parsed.querySelector('[data-motion-reveal]')).toBeTruthy();
  expect(parsed.querySelector('[data-motion-armed]')).toBeNull();
});
