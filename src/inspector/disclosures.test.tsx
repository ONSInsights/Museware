// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { Inspector } from './Inspector';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { emptyScreen } from '../ops/screenOps';

beforeEach(() => {
  const page = emptyScreen('Tea', { id: 'tea', entry: true });
  page.root.children = [
    {
      id: 'card_parent',
      type: 'card',
      props: {},
      styles: {},
      children: [
        {
          id: 'button_child',
          type: 'button',
          props: { text: 'Tea' },
          styles: {},
          children: [],
        },
      ],
    },
  ];
  useProject.getState().hydrate({ ...createProject(), screens: [page] });
  useUi.setState({
    activeScreenId: 'tea',
    selectedId: 'button_child',
    propertiesOpen: true,
    inspectorCollapsed: false,
    route: 'editor',
    breakpoint: 'compact',
  });
});
afterEach(cleanup);
it('opens all Props sections by default, toggles Layer, and keeps its parent button live while closed', () => {
  render(<Inspector />);
  const sections = [
    ...document.querySelectorAll<HTMLDetailsElement>(
      '.inspector-body > details.insp-section',
    ),
  ];
  expect(sections.length).toBeGreaterThan(2);
  expect(sections.every((s) => s.open)).toBe(true);
  const layer = screen.getByText('Layer').closest('details')!;
  const summary = layer.querySelector('summary')!;
  expect(within(layer).getByLabelText('Name')).toBeTruthy();
  fireEvent.click(summary);
  expect(layer.open).toBe(false);
  fireEvent.click(within(summary).getByRole('button', { name: 'card_parent' }));
  expect(useUi.getState().selectedId).toBe('card_parent');
  expect(layer.open).toBe(false);
});
it('preserves Style section defaults and native toggling', () => {
  render(<Inspector />);
  fireEvent.click(screen.getByRole('button', { name: 'Style' }));
  const sections = [
    ...document.querySelectorAll<HTMLDetailsElement>(
      '.inspector-body > details.insp-section',
    ),
  ];
  const names = sections.map(
    (section) =>
      [section.querySelector('summary .eyebrow')!.textContent!, section.open] as const,
  );
  expect(names.some(([name, open]) => name.startsWith('Layout') && open)).toBe(true);
  expect(names.some(([, open]) => !open)).toBe(true);
  for (const [name, open] of names)
    expect(open).toBe(
      name.startsWith('Layout') || name.startsWith('Size') || name === 'Space',
    );
  const closed = sections.find((section) => !section.open)!;
  fireEvent.click(closed.querySelector('summary')!);
  expect(closed.open).toBe(true);
});
it('screen sections and event sections are disclosures open by default', () => {
  useUi.setState({ selectedId: null });
  const view = render(<Inspector />);
  const all = [
    ...document.querySelectorAll<HTMLDetailsElement>(
      '.inspector-body > details.insp-section',
    ),
  ];
  expect(all.map((el) => el.querySelector('summary')?.textContent)).toEqual(
    expect.arrayContaining([
      expect.stringContaining('Screen'),
      expect.stringContaining('Bindings on this screen'),
      expect.stringContaining('Design system'),
      expect.stringContaining('Ask'),
    ]),
  );
  expect(all.every((el) => el.open)).toBe(true);
  view.unmount();
  useUi.setState({ selectedId: 'button_child' });
  render(<Inspector />);
  fireEvent.click(screen.getByRole('button', { name: 'Events' }));
  const event = screen.getByText('When tapped').closest('details')!;
  expect(event.open).toBe(true);
  fireEvent.click(event.querySelector('summary')!);
  expect(event.open).toBe(false);
});
it('assigns arrows only to actual disclosures and flips the glyph when closed', () => {
  const css = readFileSync('src/design/app.css', 'utf8');
  expect(css).toMatch(
    /\.inspector details > \.insp-section-head::before\s*\{\s*content:\s*'▾'/,
  );
  expect(css).toMatch(
    /\.inspector details:not\(\[open\]\) > \.insp-section-head::before\s*\{\s*content:\s*'▸'/,
  );
  expect(css).toMatch(/summary\.insp-section-head\s*\{[^}]*list-style:\s*none/s);
});
