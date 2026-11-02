// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { NodeView } from './NodeView';
import { generateProjectFiles } from '../export/reactCodegen';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import type { ComponentNode } from '../types/tree';

function fixture(type: 'list' | 'table' | 'chart', key: string = 'tea_picks') {
  const page = emptyScreen('Tea', { id: 'tea', entry: true });
  page.root.children = [
    {
      id: `the_${type}`,
      type,
      props: { dataKey: key },
      styles: {},
      children: [],
    } as ComponentNode,
  ];
  const doc = { ...createProject(), screens: [page] };
  const runtime = {
    screenId: 'tea',
    state: {},
    screens: [page],
    setKey: vi.fn(),
    toast: vi.fn(),
    navigate: vi.fn(),
    openUrl: vi.fn(),
  };
  return { page, doc, runtime };
}
afterEach(cleanup);
describe('honest data previews', () => {
  it.each(['list', 'table', 'chart'] as const)(
    '%s labels samples only in edit; run and export show no fabricated rows',
    (type) => {
      const { page, doc, runtime } = fixture(type);
      const view = render(<NodeView doc={doc} screen={page} mode="edit" />);
      expect(screen.getByText('Sample rows — add real data').className).toBe('mw-sample');
      view.rerender(<NodeView doc={doc} screen={page} mode="run" runtime={runtime} />);
      expect(screen.queryByText('Sample rows — add real data')).toBeNull();
      expect(screen.getByText('No data yet')).toBeTruthy();
      expect(screen.queryByText('Morning walk')).toBeNull();
      expect(document.querySelector('.mw-chart-bar')).toBeNull();
      const files = generateProjectFiles(doc);
      const code = Object.entries(files).find(([name]) =>
        name.startsWith('src/screens/'),
      )![1];
      expect(code).toContain('No data yet');
      expect(code).not.toContain('Morning walk');
      expect(code).not.toContain('Sample rows');
      expect(code).not.toContain('mw-chart-bar');
    },
  );
  it('exports a keyless list as an empty state and renders real data when available', () => {
    const { page, doc, runtime } = fixture('list', '');
    let code = Object.entries(generateProjectFiles(doc)).find(([name]) =>
      name.startsWith('src/screens/'),
    )![1];
    expect(code).toContain('No data yet');
    page.root.children[0].props.dataKey = 'tea_picks';
    page.mockData = { tea_picks: [{ name: 'Hojicha', detail: 'Roasted' }] };
    const view = render(<NodeView doc={doc} screen={page} mode="edit" />);
    expect(screen.getByText('Hojicha')).toBeTruthy();
    expect(screen.queryByText('Sample rows — add real data')).toBeNull();
    view.rerender(<NodeView doc={doc} screen={page} mode="run" runtime={runtime} />);
    expect(screen.getByText('Hojicha')).toBeTruthy();
    code = Object.entries(generateProjectFiles(doc)).find(([name]) =>
      name.startsWith('src/screens/'),
    )![1];
    expect(code).toContain('Hojicha');
    expect(code).not.toContain('No data yet');
  });
});
