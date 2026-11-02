import { describe, expect, it } from 'vitest';
import { emptyScreen } from '../ops/screenOps';
import { createProject, useProject } from '../store/useProject';
import { parseProjectDoc } from '../persist/schema';
import type { ComponentNode } from '../types/tree';
import { buildScopeContext, scopedPrimer } from './scopeContext';

function setup() {
  const page = emptyScreen('Home', { id: 'home', entry: true });
  const nav: ComponentNode = {
    id: 'nav_main',
    type: 'navbar',
    props: { variant: 'minimal', dataKey: 'items' },
    styles: { background: 'red', responsive: { medium: { padding: 20 } } },
    children: [],
  };
  const hero: ComponentNode = {
    id: 'hero_main',
    type: 'hero',
    props: {},
    styles: {},
    children: [
      { id: 'copy', type: 'text', props: { text: 'Hello' }, styles: {}, children: [] },
    ],
  };
  page.root.children = [nav, hero];
  page.mockData = { items: [{ title: 'Tea' }, { title: 'Coffee' }] };
  const doc = {
    ...createProject(),
    screens: [page],
    designNotes: [
      'global: user preference for nav_main: always stay sticky',
      'nav_main: applied variant minimal',
      'unrelated: do not include',
    ],
  };
  return { doc, nav, hero };
}
describe('scope context', () => {
  it('includes look, place, history and relevant memory within the shared ceiling', () => {
    const { doc } = setup();
    doc.opLog.push({
      at: 1000,
      source: 'user',
      batch: [{ op: 'setStyles', id: 'nav_main', styles: { position: 'sticky' } }],
      summary: 'styled navbar',
    });
    const context = buildScopeContext(doc, 'nav_main', 'Make it nice');
    expect(context).toContain('variant=minimal');
    expect(context).toContain('responsive=');
    expect(context).toContain('dataKey rows=2');
    expect(context).toContain('Tea');
    expect(context).toContain('PLACE: Home (web)');
    expect(context).toContain('after hero#hero_main');
    expect(context).toContain('user 1970');
    expect(context).toContain('do not undo user choices');
    expect(context).toContain('always stay sticky');
    expect(context).not.toContain('unrelated:');
    expect(buildScopeContext(doc, 'nav_main', 'x'.repeat(1000)).length).toBeLessThanOrEqual(
      2000,
    );
  });
  it('slices the primer to the node and actual descendants', () => {
    const { hero } = setup();
    expect(scopedPrimer(hero)).toContain('hero{');
    expect(scopedPrimer(hero)).toContain('text{');
    expect(scopedPrimer(hero)).not.toContain('navbar{');
    expect(scopedPrimer(hero)).not.toContain('chart{');
  });
});
describe('project memory', () => {
  it('records agent changes and user reverts, deduplicates preferences and survives project JSON', () => {
    const { doc } = setup();
    useProject.getState().replaceDoc(doc);
    useProject.getState().addRail({ role: 'user', text: 'Always keep the navbar sticky' });
    useProject.getState().addRail({ role: 'user', text: 'Always keep the navbar sticky' });
    expect(
      useProject.getState().doc.designNotes?.filter((n) => n.includes('Always keep')),
    ).toHaveLength(1);
    useProject
      .getState()
      .applyBatch([{ op: 'setStyles', id: 'nav_main', styles: { position: 'sticky' } }], {
        source: 'agent',
      });
    expect(
      useProject
        .getState()
        .doc.designNotes?.some((n) => n.includes('nav_main: applied setStyles')),
    ).toBe(true);
    useProject.getState().undo();
    expect(
      useProject
        .getState()
        .doc.designNotes?.some(
          (n) => n.includes('user REVERTED') && n.includes('nav_main'),
        ),
    ).toBe(true);
    const restored = parseProjectDoc(JSON.parse(JSON.stringify(useProject.getState().doc)));
    expect(restored.schemaVersion).toBe(3);
    expect(restored.designNotes).toEqual(useProject.getState().doc.designNotes);
    const heroContext = buildScopeContext(restored, 'hero_main', 'Restyle');
    expect(heroContext).toContain('always stay sticky');
  });
  it('migrates old projects and retains only the newest 30 notes', () => {
    const { doc } = setup();
    const { designNotes: _notes, ...old } = doc;
    old.schemaVersion = 2;
    expect(parseProjectDoc(old).designNotes).toEqual([]);
    useProject.getState().replaceDoc(old);
    for (let i = 0; i < 40; i++)
      useProject.getState().addDesignNote(`global: preference ${i}`);
    expect(useProject.getState().doc.designNotes).toHaveLength(30);
    expect(useProject.getState().doc.designNotes?.[0]).toBe('global: preference 10');
  });
});
