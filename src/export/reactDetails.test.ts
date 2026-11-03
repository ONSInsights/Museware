import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { generateProjectFiles } from './reactCodegen';
import type { ComponentNode } from '../types/tree';

function fixture() {
  const doc = createProject();
  const screen = emptyScreen('Home', { id: 'home', entry: true });
  const node = (
    id: string,
    type: ComponentNode['type'],
    props: Record<string, unknown>,
    extra: Partial<ComponentNode> = {},
  ): ComponentNode => ({ id, type, props, children: [], styles: {}, ...extra });
  screen.root.children = [
    node(
      'with_icon',
      'button',
      { text: 'Save', icon: 'check' },
      { events: { tap: [{ type: 'toast', text: 'Saved' }] } },
    ),
    node('no_icon', 'button', { text: 'Plain', icon: '' }),
    node('meter', 'progress', { label: 'Progress', value: 140, bindKey: 'level' }),
    node('slide', 'slider', { label: 'Volume', bindKey: 'vol', min: 0, max: 100 }),
    node('nav', 'bottomnav', { items: ['Home', 'Stats', 'Settings'] }),
    node(
      'list_real',
      'list',
      { dataKey: 'rows', divider: true },
      { events: { tap: [{ type: 'toast', text: 'Row' }] } },
    ),
    node('list_empty', 'list', { dataKey: 'none', divider: false }),
    node('line', 'chart', { dataKey: 'rows', kind: 'line' }),
    node('spark', 'chart', { dataKey: 'rows', kind: 'spark' }),
    node('bar', 'chart', { dataKey: 'rows', kind: 'bar' }),
    node('empty', 'chart', { dataKey: 'none', kind: 'line' }),
    node('check', 'checkbox', { label: 'Remember', bindKey: 'remember' }),
    node('switcher', 'switch', { label: 'Alerts', bindKey: 'alerts' }),
  ];
  screen.mockData = {
    rows: [
      { title: 'First', value: 5 },
      { title: 'Second', value: 10 },
    ],
  };
  doc.screens = [screen];
  const files = generateProjectFiles(doc);
  return { code: files['src/screens/Home.tsx'], css: files['src/app.css'], doc };
}

describe('React export component details', () => {
  it('includes configured button icons, captions, values and bottom navigation icons', () => {
    const { code } = fixture();
    expect(code).toContain('<Icon name="check" size={16} />Save');
    expect(code).toContain('>Plain</button>');
    expect(code).toContain('mw-progress-label');
    expect(code).toContain('state["level"] ?? 100');
    expect(code).toContain('aria-label={"Volume"}');
    expect(code).toContain('mw-slider-field');
    expect(code).toContain('name="home" size={20}');
    expect(code).toContain('name="grid" size={20}');
    expect(code).toContain('name="settings" size={20}');
    expect(code).toContain('Saved');
  });
  it('preserves list dividers, data and explicit row action; charts retain their variants and empty state', () => {
    const { code } = fixture();
    expect(code).toContain('n-list_real mw-list-divided');
    expect(code).not.toContain('n-list_empty mw-list-divided');
    expect(code).toContain('selected_row');
    expect(code).toContain('First');
    expect(code).toContain('Row');
    expect(code).toContain('<svg className={"n-line"}');
    expect(code).toContain('<svg className={"n-spark"}');
    expect(code).toContain('opacity="0.14"');
    expect(code).toContain('mw-chart-bar');
    expect(code).toContain('No data yet');
  });
  it('uses keyboard-accessible native inputs with visible custom checkbox and switch states', () => {
    const { code, css } = fixture();
    expect(code).toContain('type="checkbox" checked={Boolean(state["remember"])}');
    expect(code).toContain('type="checkbox" role="switch"');
    expect(code).toContain('className="mw-check"');
    expect(code).toContain('className="mw-switch"');
    expect(code).toContain('setKey("remember", e.target.checked)');
    expect(css).toContain(':focus-visible + :is(.mw-check,.mw-switch)');
  });
});
