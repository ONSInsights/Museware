import { describe, expect, it } from 'vitest';
import { buildSingleHtml } from '../export/singleFile';
import { emptyScreen } from '../ops/screenOps';
import { createProject } from '../store/useProject';
import type { ComponentNode } from '../types/tree';
import { lintScreen } from './qualityLint';
import { fillPrompt, SYSTEM_PROMPT } from './prompts';

const node = (
  id: string,
  type: ComponentNode['type'],
  props: Record<string, unknown> = {},
  styles: ComponentNode['styles'] = {},
  children: ComponentNode[] = [],
): ComponentNode => ({ id, type, props, styles, children });
const examples = [
  {
    name: 'Quiet utility',
    kind: 'web' as const,
    nodes: [
      node('title', 'heading', { text: 'Your tasks', level: 1 }, { fontWeight: 300 }),
      node('body', 'text', { text: 'A calm place to focus.' }),
    ],
  },
  {
    name: 'Editorial portfolio',
    kind: 'web' as const,
    nodes: [
      node('title', 'heading', { text: 'Selected work', level: 1 }, { fontWeight: 400 }),
      node('copy', 'text', { text: 'Notes on form and light.' }),
      node('projects', 'grid', { columns: 1 }, {}, [
        node('piece_one', 'text', { text: '01 — A quiet study' }),
        node('piece_two', 'text', { text: '02 — A little space' }),
      ]),
    ],
  },
  {
    name: 'Tea storefront',
    kind: 'web' as const,
    nodes: [
      node('nav', 'navbar', { brand: 'Still Leaf' }),
      node(
        'title',
        'heading',
        { text: 'Tea for slower days', level: 1 },
        { fontWeight: 400 },
      ),
      node('products', 'grid', { columns: 3 }, {}, [
        node('tea_one', 'text', { text: 'Jasmine' }),
        node('tea_two', 'text', { text: 'Hojicha' }),
        node('tea_three', 'text', { text: 'Sencha' }),
      ]),
    ],
  },
  {
    name: 'Playful app',
    kind: 'app' as const,
    nodes: [
      node('title', 'heading', { text: 'Tiny wins', level: 1 }, { fontWeight: 800 }),
      node('body', 'text', { text: 'A little progress counts.' }),
      node('actions', 'row', {}, {}, [
        node('action_one', 'text', { text: 'Explore' }),
        node('action_two', 'text', { text: 'Save' }),
      ]),
    ],
  },
];

describe('brief-specific composition fixtures', () => {
  for (const example of examples)
    it(`keeps ${example.name} intact in generated markup`, () => {
      const screen = emptyScreen(example.name, { id: 'screen_one', entry: true });
      screen.root.children = structuredClone(example.nodes);
      const doc = { ...createProject(example.name), kind: example.kind, screens: [screen] };
      const html = buildSingleHtml(doc);
      expect(html).toContain(
        String(example.nodes[0].props.text || example.nodes[0].props.brand),
      );
      expect(html).not.toContain('class="mw-hero');
      expect(
        lintScreen(screen, doc.tokens, new Set(), example.kind).some((f) =>
          ['hero', 'navbar'].includes(f.code),
        ),
      ).toBe(false);
      expect(html).toContain(
        `font-weight:${example.nodes.find((n) => n.id === 'title')?.styles.fontWeight}`,
      );
      if (example.name === 'Editorial portfolio')
        expect(html).toContain(
          '@container mw (min-width:1024px){.n-projects{grid-template-columns:repeat(1, minmax(0, 1fr))}}',
        );
      if (example.name === 'Tea storefront')
        expect(html).toContain(
          '@container mw (min-width:1024px){.n-products{grid-template-columns:repeat(3, minmax(0, 1fr))}}',
        );
    });
  it('instructs the live paths to adapt, not mandate a full-bleed formula', () => {
    const fill = fillPrompt({
      screenName: 'Quiet utility',
      section: 'No hero',
      lookLine: '',
      tokenSheet: '',
      indexRules: '',
      existingIndex: '',
    });
    for (const text of [SYSTEM_PROMPT, fill]) {
      expect(text).toContain('intentional restraint is valid');
      expect(text).not.toContain('Every screen needs a DOMINANT');
      expect(text).not.toContain('A web build without responsive overrides is a problem');
    }
  });
});
