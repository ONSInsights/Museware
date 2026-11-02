import 'fake-indexeddb/auto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { COMPONENT_SPECS, MOTION_PROP } from '../types/library';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import { generateFullCss, MOTION_DICTIONARY, SWITCH_MOTION_CSS } from './cssGen';
const TOKEN_LINE = readFileSync(
  new URL('./fixtures/motion-token-contract.css', import.meta.url),
  'utf8',
).trim();
function fixture() {
  const doc = createProject('KOYO');
  const screen = emptyScreen('Home', { id: 'home', entry: true });
  screen.root.children = [
    {
      id: 'hero',
      type: 'hero',
      props: { title: 'KOYO', layout: 'split' },
      styles: {},
      children: [],
    },
    {
      id: 'features',
      type: 'section',
      props: { title: 'Tea' },
      styles: {},
      children: [
        { id: 'title', type: 'heading', props: { text: 'Tea' }, styles: {}, children: [] },
      ],
    },
  ];
  doc.screens = [screen];
  return doc;
}
it('one shared select vocabulary belongs to every widget, with none as default', () => {
  for (const spec of COMPONENT_SPECS) {
    expect(spec.props.filter((p) => p.key === 'motion')).toEqual([MOTION_PROP]);
    expect(spec.defaultProps.motion).toBe('none');
  }
});
it('the old CSS is byte-identical except the inert dictionary and token line', () => {
  const old = readFileSync(
    new URL('./fixtures/motion-baseline.css', import.meta.url),
    'utf8',
  );
  const css = generateFullCss(fixture());
  expect(
    css
      .replace(`${TOKEN_LINE}\n`, '')
      .replace(`${MOTION_DICTIONARY}\n`, '')
      .replace(`${SWITCH_MOTION_CSS}\n`, ''),
  ).toBe(old);
});
it('emits only selected presets with reduced-motion completeness and bounded delays', () => {
  const doc = fixture();
  const section = doc.screens[0].root.children[1];
  section.props.motion = 'rise';
  section.children[0].props.motion = 'fade';
  const css = generateFullCss(doc);
  expect(css).toContain(
    ':where(.n-features){animation:mw-rise var(--mw-motion-slow) var(--mw-ease-out) both}',
  );
  expect(css).toContain(':where(.n-title){animation:mw-fade');
  expect(css).toContain(
    '@media (prefers-reduced-motion:reduce){:where(.n-features){animation:none;opacity:1;transform:none}}',
  );
  expect(css).toContain(':where(.n-features > :nth-child(n+8)){animation-delay:490ms}');
  expect(css).not.toContain('animation-delay:560ms');
  expect(css).not.toContain(':where(.n-hero){animation:mw-');
});
