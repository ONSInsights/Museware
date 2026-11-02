import { describe, expect, it } from 'vitest';
import { COMPOSITION_PRIMER, SYSTEM_PROMPT, fillPrompt } from './prompts';
import { lintComposition } from './qualityLint';
import { emptyScreen } from '../ops/screenOps';
import type { ComponentNode } from '../types/tree';
const node = (
  id: string,
  type: ComponentNode['type'],
  props: Record<string, unknown> = {},
): ComponentNode => ({ id, type, props, styles: {}, children: [] });
describe('composition guidance', () => {
  it('adds compact moves and media intent to both builder paths', () => {
    expect(COMPOSITION_PRIMER.split(/\s+/).length).toBeLessThanOrEqual(120);
    for (const word of [
      'DOMINANT',
      'MOMENT',
      'RHYTHM',
      'MEASURE',
      'immersive',
      'split',
      'centered',
      'scrim',
    ])
      expect(COMPOSITION_PRIMER).toContain(word);
    expect(SYSTEM_PROMPT).toContain(COMPOSITION_PRIMER);
    expect(
      fillPrompt({
        screenName: 'Tea',
        section: '',
        lookLine: '',
        tokenSheet: '',
        indexRules: '',
        existingIndex: '',
      }),
    ).toContain(COMPOSITION_PRIMER);
    expect(COMPOSITION_PRIMER.length).toBeLessThan(1000);
  });
  it('finds concrete composition risks, with one mending op per hint and a cap', () => {
    const page = emptyScreen('Tea', { id: 'tea', entry: true });
    const grid = node('g', 'grid', { columns: 2 });
    grid.children = [node('c1', 'card'), node('c2', 'card'), node('c3', 'card')];
    grid.children[2].styles.colSpan = 1;
    const hero = node('h', 'hero', {
      layout: 'split',
      title: 'Tea',
      image: 'https://example.com/tea.jpg',
    });
    hero.styles.minHeight = '600px';
    const img = node('i', 'image', { src: 'https://example.com/tea.jpg' });
    const row = node('r', 'row');
    row.children = [img];
    const marquee = node('m', 'marquee');
    marquee.styles.animation = 'none';
    page.root.children = [
      grid,
      hero,
      row,
      marquee,
      node('s1', 'section'),
      node('s2', 'section'),
      node('s3', 'section'),
    ];
    const findings = lintComposition(page);
    expect(findings).toHaveLength(4);
    expect(findings.map((f) => f.nodeId)).toEqual(['s3', 'c3', 'h', 'i']);
    for (const finding of findings) expect(finding.message).toMatch(/setStyles|setProps/);
    const immersive = node('immersive', 'hero', {
      layout: 'immersive',
      image: 'https://example.com/image.jpg',
    });
    immersive.styles.filter = 'none';
    page.root.children = [marquee, immersive];
    expect(lintComposition(page).map((f) => f.nodeId)).toEqual(['m', 'immersive']);
    page.root.children = [
      node('s1', 'section'),
      node('s2', 'section'),
      node('s3', 'section'),
    ];
    expect(lintComposition(page)[0].message).toContain('same surface');
    page.root.children = [node('clean', 'section', { surface: 'sunk' })];
    expect(lintComposition(page)).toEqual([]);
  });
});
