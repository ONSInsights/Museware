// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { generateFullCss } from './cssGen';
import { NodeView } from './NodeView';
import { assetCensus } from '../export/assets';
import { buildHtmlFolder } from '../export/singleFile';
import { lintRemovedImageVoids } from '../muse/qualityLint';
import type { ComponentNode } from '../types/tree';
const node = (
  id: string,
  type: ComponentNode['type'],
  props: Record<string, unknown> = {},
  children: ComponentNode[] = [],
): ComponentNode => ({ id, type, props, styles: {}, children });
function fixture() {
  const page = emptyScreen('Tea', { id: 'tea', entry: true });
  page.root.children = [node('hero', 'hero', { layout: 'immersive', title: 'Tea' })];
  return { page, doc: { ...createProject(), screens: [page] } };
}
it('uses scoped stepped ratio defaults while explicit image styles retain precedence', () => {
  const { doc, page } = fixture();
  const img = node('img', 'image');
  img.styles.aspectRatio = '21 / 9';
  page.root.children.push(node('card', 'card', {}, [img]));
  const css = generateFullCss(doc);
  expect(css).toContain(':where(.n-img){aspect-ratio:16 / 10}');
  expect(css).toContain(':where(.mw-card .n-img){aspect-ratio:1 / 1}');
  expect(css).toContain(':where(.mw-card .n-img){aspect-ratio:4 / 3}');
  expect(css).toContain(':where(.mw-hero-img){width:100%;height:auto;aspect-ratio:4 / 5');
  expect(css).toContain(':where(.mw-hero .mw-hero-img){aspect-ratio:15 / 8}');
  expect(css).toContain('aspect-ratio:2 / 1');
  expect(css).toMatch(/\.n-img\{[^}]*aspect-ratio:21 \/ 9/);
  const view = render(<NodeView doc={doc} screen={page} mode="edit" />);
  expect(view.container.querySelector('.n-img img')).toHaveProperty('draggable', false);
  expect(
    (view.container.querySelector('.n-img img') as HTMLImageElement).style.objectFit,
  ).toBe('cover');
  cleanup();
});
it('draws an image-free immersive band entirely in CSS, without an image asset', () => {
  const { doc, page } = fixture();
  const css = generateFullCss(doc);
  const rule = css.slice(
    css.indexOf(':where(.mw-hero[data-layout="immersive"][data-has-media="false"])'),
  );
  expect(rule).toContain('radial-gradient');
  expect(rule).toContain('conic-gradient');
  expect(rule).toContain('linear-gradient');
  expect(css).not.toContain('data:image');
  const view = render(<NodeView doc={doc} screen={page} mode="run" />);
  expect(view.container.querySelector('.mw-hero')?.getAttribute('data-has-media')).toBe(
    'false',
  );
  expect(view.container.querySelector('img')).toBeNull();
  expect(assetCensus(doc).inline).toBe(0);
  expect(
    Object.keys(buildHtmlFolder(doc)).filter((k) => k.startsWith('assets/')),
  ).toHaveLength(0);
  cleanup();
});
it('warns only when this turn removed the last image of a split hero', () => {
  const { doc, page } = fixture();
  page.root.children[0].props.layout = 'split';
  page.root.children[0].children = [node('picture', 'image')];
  const after = structuredClone(doc);
  after.screens[0].root.children[0].children = [];
  expect(lintRemovedImageVoids(doc, after)).toEqual([
    expect.objectContaining({
      nodeId: 'hero',
      message: expect.stringContaining('setProps layout to centered'),
    }),
  ]);
  expect(lintRemovedImageVoids(doc, doc)).toEqual([]);
});
