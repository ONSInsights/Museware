import { describe, expect, it } from 'vitest';
import { COMPOSITION_PRIMER, MOTION_PRIMER, SYSTEM_PROMPT, fillPrompt } from './prompts';
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
    expect(MOTION_PRIMER.split(/\s+/).length).toBeLessThanOrEqual(100);
    expect(SYSTEM_PROMPT).toContain(MOTION_PRIMER);
    expect(
      fillPrompt({
        screenName: 'Tea',
        section: '',
        lookLine: '',
        tokenSheet: '',
        indexRules: '',
        existingIndex: '',
      }),
    ).toContain(MOTION_PRIMER);
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
    expect(lintComposition(page).map((f) => f.nodeId)).toEqual(['m']);
    immersive.children = [node('photo', 'image', { src: 'https://example.com/image.jpg' })];
    expect(lintComposition(page)[0]).toMatchObject({ nodeId: 'photo', severity: 'block' });
    immersive.children[0].styles.filter = 'brightness(0.55)';
    expect(lintComposition(page).some((f) => f.severity === 'block')).toBe(false);
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

describe('motion guidance', () => {
  it('makes nine children advisory only, while eight are silent', () => {
    const page = emptyScreen('Tea', { id: 'tea', entry: true });
    const section = node('story', 'section', { motion: 'rise' });
    section.children = Array.from({ length: 8 }, (_, i) => node(`item${i}`, 'text'));
    page.root.children = [section];
    expect(lintComposition(page)).toEqual([]);
    section.children.push(node('item8', 'text'));
    expect(lintComposition(page)).toEqual([
      expect.objectContaining({
        nodeId: 'story',
        advisory: true,
        protectMotion: true,
        message:
          "This section staggers more children than the cascade expresses (8+) — the rest enter together, which is fine. If it's really two ideas, ask for a split and it'll be rebuilt as two sections.",
      }),
    ]);
  });
  it('uses declared page roles only and recognizes ambient widgets', () => {
    const page = emptyScreen('Tea', { id: 'tea', entry: true });
    page.root.children = [
      node('footer_name', 'section', { motion: 'rise' }),
      node('nav', 'col', { motion: 'fade', role: 'nav' }),
      node('one', 'marquee'),
      node('two', 'video', { src: 'https://example.com/v.mp4', autoplayMuted: true }),
    ];
    const findings = lintComposition(page);
    expect(findings.some((f) => f.nodeId === 'footer_name')).toBe(false);
    expect(findings.find((f) => f.nodeId === 'nav')?.message).toContain('motion to none');
    expect(findings.find((f) => f.nodeId === 'two')?.message).toContain('autoplayMuted');
  });
  it('prioritizes blocking image issues within the four finding limit', () => {
    const page = emptyScreen('Tea', { id: 'tea', entry: true });
    const hero = node('h', 'hero', { layout: 'immersive' });
    hero.children = [node('photo', 'image', { src: 'https://example.com/i.jpg' })];
    page.root.children = [
      node('a', 'section'),
      node('b', 'section'),
      node('c', 'section'),
      node('d', 'section'),
      node('e', 'section'),
      hero,
    ];
    const findings = lintComposition(page);
    expect(findings).toHaveLength(4);
    expect(findings[0]).toMatchObject({ nodeId: 'photo', severity: 'block' });
  });
});
