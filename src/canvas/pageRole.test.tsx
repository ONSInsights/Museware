// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { spec } from '../types/library';
import { NodeView } from './NodeView';
import { buildSingleHtml } from '../export/singleFile';
import { generateProjectFiles } from '../export/reactCodegen';
import { filterScopedOps } from '../muse/scope';
import { applyOps } from '../ops/apply';

describe('declared page role', () => {
  it('is a select available to scoped style edits and survives rename', () => {
    for (const type of ['section', 'col']) {
      expect(spec(type)?.defaultProps.role).toBe('none');
      expect(spec(type)?.props.find((prop) => prop.key === 'role')).toMatchObject({
        kind: 'select',
        options: ['none', 'footer', 'nav'],
      });
    }
    const doc = createProject();
    const page = emptyScreen('Home', { id: 'home', entry: true });
    page.root.children = [
      { id: 's', type: 'section', props: { role: 'footer' }, styles: {}, children: [] },
    ];
    doc.screens = [page];
    const scoped = filterScopedOps(
      doc,
      's',
      [{ op: 'setProps', id: 's', props: { role: 'nav' } }],
      true,
    );
    expect(scoped.allowed).toHaveLength(1);
    const renamed = applyOps([{ op: 'rename', id: 's', name: 'New name' }], doc, {
      source: 'user',
    });
    expect(renamed.doc.screens[0].root.children[0].props.role).toBe('footer');
  });
  it('renders declared semantic roles in canvas, HTML, and React export', () => {
    const doc = createProject();
    const page = emptyScreen('Home', { id: 'home', entry: true });
    page.root.children = [
      { id: 'foot', type: 'section', props: { role: 'footer' }, styles: {}, children: [] },
      { id: 'navigation', type: 'col', props: { role: 'nav' }, styles: {}, children: [] },
      { id: 'plain', type: 'col', props: { role: 'none' }, styles: {}, children: [] },
    ];
    doc.screens = [page];
    const view = render(<NodeView doc={doc} screen={page} mode="edit" />);
    expect(view.container.querySelector('.n-foot')?.getAttribute('role')).toBe(
      'contentinfo',
    );
    expect(view.container.querySelector('.n-navigation')?.getAttribute('role')).toBe(
      'navigation',
    );
    expect(view.container.querySelector('.n-plain')?.hasAttribute('role')).toBe(false);
    cleanup();
    const html = buildSingleHtml(doc);
    expect(html).toMatch(/class="n-foot mw-section"[^>]*role="contentinfo"/);
    expect(html).toMatch(/class="n-navigation"[^>]*role="navigation"/);
    const files = generateProjectFiles(doc);
    const source = files['src/screens/Home.tsx'];
    expect(source).toContain('role="contentinfo"');
    expect(source).toContain('role="navigation"');
  });
});
