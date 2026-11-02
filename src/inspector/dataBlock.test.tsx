// @vitest-environment jsdom
import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { Inspector } from './Inspector';
import { inlineRowKeys, formatRows, parseRows } from './DataBlock';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { emptyScreen } from '../ops/screenOps';
import { spec } from '../types/library';
import type { ComponentNode, MockRow } from '../types/tree';

function setup(rows: MockRow[] = [], other: ComponentNode[] = []) {
  const page = emptyScreen('Tea', { id: 'tea', entry: true });
  page.root.children = [
    {
      id: 'tea_list',
      type: 'list',
      props: { dataKey: 'tea_picks' },
      styles: {},
      children: [],
    },
    ...other,
  ];
  page.mockData = { tea_picks: rows };
  useProject.getState().hydrate({ ...createProject(), screens: [page] });
  useUi.setState({
    activeScreenId: 'tea',
    selectedId: 'tea_list',
    propertiesOpen: true,
    inspectorCollapsed: false,
    route: 'editor',
    draft: '',
  });
}
beforeEach(() => setup());
afterEach(cleanup);
describe('inline data rows', () => {
  it('parses canonical rows and commits a single undoable setMockData batch', () => {
    render(<Inspector />);
    expect(screen.getByText('No rows yet — the canvas is showing samples')).toBeTruthy();
    expect(screen.getByText('DATA ROWS · 0')).toBeTruthy();
    const input = screen.getByRole('textbox', { name: 'Data rows for tea_picks' });
    fireEvent.change(input, { target: { value: 'Morning walk | 6,204 steps | +12%' } });
    fireEvent.blur(input);
    const state = useProject.getState();
    expect(state.doc.screens[0].mockData?.tea_picks).toEqual([
      { title: 'Morning walk', detail: '6,204 steps', meta: '+12%' },
    ]);
    expect(state.doc.opLog.at(-1)?.batch[0]).toMatchObject({
      op: 'setMockData',
      screenId: 'tea',
      key: 'tea_picks',
    });
    act(() => state.undo());
    expect(useProject.getState().doc.screens[0].mockData?.tea_picks).toEqual([]);
  });
  it('round trips canonical rows exactly and preserves custom key order', () => {
    for (const rows of [
      [
        { title: 'Tea', detail: 'Roasted', meta: '+12%' },
        { title: 'Coffee', detail: 'Hot', meta: 'Now' },
      ],
      [
        { name: 'Hojicha', description: 'Roasted', price_label: '₦2,000' },
        { price_label: '₦3,000', description: 'Green', name: 'Matcha' },
      ],
    ]) {
      const keys = inlineRowKeys(rows)!;
      expect(parseRows(formatRows(rows, keys), keys, true)).toEqual(rows);
    }
    const custom = [{ name: 'Hojicha', description: 'Roasted', price_label: '₦2,000' }];
    setup(custom);
    render(<Inspector />);
    const input = screen.getByRole('textbox', { name: 'Data rows for tea_picks' });
    expect((input as HTMLTextAreaElement).value).toBe('Hojicha | Roasted | ₦2,000');
    fireEvent.change(input, { target: { value: 'Matcha | Green | ₦3,000' } });
    fireEvent.blur(input);
    expect(useProject.getState().doc.screens[0].mockData?.tea_picks).toEqual([
      { name: 'Matcha', description: 'Green', price_label: '₦3,000' },
    ]);
  });
  it('focuses Add rows and fills the unsent muse instruction on Ask muse', () => {
    render(<Inspector />);
    fireEvent.click(screen.getByRole('button', { name: 'Add rows' }));
    expect(document.activeElement).toBe(
      screen.getByRole('textbox', { name: 'Data rows for tea_picks' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Ask muse' }));
    expect(useUi.getState().draft).toBe(
      'Fill tea_picks with 5-8 realistic rows for this screen',
    );
    expect(useUi.getState().chatExpanded).toBe(true);
    expect(useProject.getState().doc.screens[0].mockData?.tea_picks).toEqual([]);
    expect(screen.queryByRole('button', { name: /Rows:.*View/ })).toBeNull();
  });
  it('identifies datasets shared by widgets or seeded by muse', () => {
    setup(
      [{ title: 'Tea' }],
      [
        {
          id: 'tea_chart',
          type: 'chart',
          props: { dataKey: 'tea_picks' },
          styles: {},
          children: [],
        },
      ],
    );
    const view = render(<Inspector />);
    expect(screen.getByText('shared dataset · tea_picks · used by 2 widgets')).toBeTruthy();
    act(() => {
      const doc = structuredClone(useProject.getState().doc);
      doc.screens[0].root.children.push({
        id: 'tea_faq',
        type: 'accordion',
        props: { dataKey: 'tea_picks' },
        styles: {},
        children: [],
      });
      useProject.getState().replaceDoc(doc);
    });
    expect(screen.getByText('shared dataset · tea_picks · used by 3 widgets')).toBeTruthy();
    view.unmount();
    setup();
    useProject.getState().applyBatch(
      [
        {
          op: 'setMockData',
          screenId: 'tea',
          key: 'tea_picks',
          rows: [{ title: 'Tea' }],
        },
      ],
      { source: 'agent' },
    );
    render(<Inspector />);
    expect(screen.getByText('shared dataset · tea_picks · used by 1 widget')).toBeTruthy();
  });
  it('routes non-string, extra, irregular or delimiter-bearing data to the advanced editor without losing it', () => {
    for (const rows of [
      [{ title: 'Tea', price: 2 }],
      [{ a: 'a', b: 'b', c: 'c', d: 'd' }],
      [{ title: 'a|b' }],
      [{ title: 'a' }, { title: 'b', detail: 'c' }],
    ] as MockRow[][])
      expect(inlineRowKeys(rows)).toBeNull();
    setup([{ title: 'Tea', price: 2 }]);
    render(<Inspector />);
    expect(screen.getByText('Advanced fields — open the data editor')).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'Data rows for tea_picks' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Field editor' }));
    const rename = screen.getByLabelText('Rename field price in row 1');
    fireEvent.change(rename, { target: { value: 'cost' } });
    fireEvent.blur(rename);
    expect(useProject.getState().doc.screens[0].mockData?.tea_picks).toEqual([
      { title: 'Tea', cost: 2 },
    ]);
    expect(useProject.getState().doc.opLog.at(-1)?.batch[0].op).toBe('setMockData');
  });
  it('refuses to overwrite a shared dataset changed while a draft is being edited', () => {
    setup([{ title: 'Tea' }]);
    render(<Inspector />);
    const input = screen.getByRole('textbox', { name: 'Data rows for tea_picks' });
    fireEvent.change(input, { target: { value: 'My draft' } });
    act(() => {
      useProject.getState().applyBatch(
        [
          {
            op: 'setMockData',
            screenId: 'tea',
            key: 'tea_picks',
            rows: [{ title: 'Elsewhere' }],
          },
        ],
        { source: 'agent' },
      );
    });
    fireEvent.blur(input);
    expect(screen.getByRole('alert').textContent).toContain('Rows changed elsewhere');
    expect(useProject.getState().doc.screens[0].mockData?.tea_picks).toEqual([
      { title: 'Elsewhere' },
    ]);
  });
  it('saves by button and refuses overlong rows without replacing data', () => {
    setup([{ title: 'Tea', detail: 'Hot', meta: 'Now' }]);
    render(<Inspector />);
    const input = screen.getByRole('textbox', { name: 'Data rows for tea_picks' });
    fireEvent.change(input, { target: { value: 'Tea | Warm | Now | extra' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save rows' }));
    expect(screen.getByRole('alert').textContent).toContain('at most 3 fields');
    expect(useProject.getState().doc.screens[0].mockData?.tea_picks).toEqual([
      { title: 'Tea', detail: 'Hot', meta: 'Now' },
    ]);
    fireEvent.change(input, { target: { value: 'Tea | Warm | Now' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save rows' }));
    expect(useProject.getState().doc.screens[0].mockData?.tea_picks).toEqual([
      { title: 'Tea', detail: 'Warm', meta: 'Now' },
    ]);
  });
  it('shows the sample warning for keyless legacy lists without inventing a key', () => {
    const doc = structuredClone(useProject.getState().doc);
    doc.screens[0].root.children[0].props.dataKey = '';
    useProject.getState().hydrate(doc);
    render(<Inspector />);
    expect(screen.getByText('No rows yet — the canvas is showing samples')).toBeTruthy();
    expect(screen.getByText('Enter a valid data key to edit rows.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Ask muse' })).toBeNull();
  });
  it('distinguishes dataset keys from URLs, labels, options and columns', () => {
    for (const type of ['list', 'table', 'chart'] as const)
      expect(spec(type)?.props.find((p) => p.key === 'dataKey')?.kind).toBe('dataset');
    for (const [type, key] of [
      ['image', 'src'],
      ['tabs', 'items'],
      ['table', 'columns'],
      ['select', 'options'],
    ] as const)
      expect(spec(type)?.props.find((p) => p.key === key)?.kind).toBe('data');
    setup(
      [],
      [
        {
          id: 'img_tea',
          type: 'image',
          props: { src: 'https://example.com/tea.jpg' },
          styles: {},
          children: [],
        },
      ],
    );
    useUi.setState({ selectedId: 'img_tea' });
    render(<Inspector />);
    expect(screen.queryByText(/DATA ROWS/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Field editor' })).toBeNull();
  });
});
