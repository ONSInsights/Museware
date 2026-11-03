// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import { generateFullCss } from './cssGen';
import { NodeView } from './NodeView';
import { placeholderImage } from './placeholder';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { buildSingleHtml } from '../export/singleFile';
import type { ComponentNode } from '../types/tree';
const node = (
  id: string,
  type: ComponentNode['type'],
  children: ComponentNode[] = [],
): ComponentNode => ({ id, type, props: {}, styles: {}, children });
function fixture() {
  const page = emptyScreen('Page', { id: 'page', entry: true });
  page.root.children = [
    node('grid_a', 'grid', [
      node('card1', 'card'),
      node('card2', 'card'),
      node('card3', 'card'),
    ]),
    node('hero', 'hero'),
    node('marq', 'marquee'),
    node('section_a', 'section', [node('list_a', 'list')]),
  ];
  page.root.children[0].props.columns = 3;
  return { page, doc: { ...createProject(), screens: [page] } };
}
describe('composition defaults', () => {
  it('closes 3-in-2 and 5-in-3 but not complete rows, at container breakpoints', () => {
    const css = generateFullCss(fixture().doc);
    expect(css).toContain(
      ':where(.n-grid_a > *:last-child:nth-child(2n + 1)){grid-column:span 2}',
    );
    expect(css).toContain(
      ':where(.n-grid_a > *:last-child:nth-child(3n + 2)){grid-column:span 2}',
    );
    expect(css).not.toContain('nth-child(2n + 0)');
    expect(css).toContain('@container mw (min-width:600px)');
  });
  it('centres split hero copy and constrains long-form content only at wide containers', () => {
    const css = generateFullCss(fixture().doc);
    expect(css).toContain(
      ':where(.mw-hero[data-layout="split"] .mw-hero-copy){max-width:60ch}',
    );
    expect(css).toContain('justify-content:center;min-height:min(26.67cqw, 480px)');
    expect(css).toContain(
      '@container mw (min-width:1024px){:where(.mw-section .n-list_a){max-width:min(100%, 720px);margin-inline:auto}}',
    );
  });
  it('shows one readable copy at rest and preserves two in motion', () => {
    const { doc, page } = fixture();
    const view = render(<NodeView doc={doc} screen={page} mode="edit" />);
    expect(view.container.querySelector('.mw-marquee')?.getAttribute('data-static')).toBe(
      'true',
    );
    view.rerender(<NodeView doc={doc} screen={page} mode="run" />);
    expect(view.container.querySelector('.mw-marquee')?.hasAttribute('data-static')).toBe(
      false,
    );
    expect(view.container.querySelectorAll('.mw-marquee-group')).toHaveLength(2);
    const css = generateFullCss(doc);
    expect(css).toContain(
      ':where(.mw-marquee[data-static="true"] .mw-marquee-group[aria-hidden="true"]){display:none}',
    );
    expect(css).not.toContain('mask-image:linear-gradient(to right,transparent');
    expect(buildSingleHtml(doc)).toContain('data-static="true"');
    cleanup();
  });
  it('produces deterministic distinct textured artwork at the specified aspect', () => {
    const tokens = createProject().tokens;
    const one = placeholderImage(tokens, {
      seed: 'Jasmine',
      width: 640,
      height: 400,
      variant: 'card',
    });
    const two = placeholderImage(tokens, {
      seed: 'Different',
      width: 640,
      height: 400,
      variant: 'card',
    });
    expect(one).toBe(
      placeholderImage(tokens, {
        seed: 'Jasmine',
        width: 640,
        height: 400,
        variant: 'card',
      }),
    );
    expect(one).not.toBe(two);
    const svg = decodeURIComponent(one.split(',')[1]);
    expect(svg).toContain('feTurbulence');
    expect(svg).toContain('viewBox="0 0 640 400"');
  });
});
