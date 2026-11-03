import { describe, expect, it } from 'vitest';
import { transform } from 'esbuild';
import { generateProjectFiles } from './reactCodegen';
import { createProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import type { ComponentNode } from '../types/tree';
const node = (
  id: string,
  type: ComponentNode['type'],
  props: Record<string, unknown> = {},
  children: ComponentNode[] = [],
): ComponentNode => ({ id, type, props, styles: {}, children });

describe('exported interactive components', () => {
  it('preserves comma-list navigation and both link destination and explicit action', async () => {
    const home = emptyScreen('Home', { id: 'home', entry: true });
    const story = emptyScreen('Our Story + Visit', { id: 'our_story_visit', entry: false });
    const nav = node('nav', 'navbar', {
      items: 'Home, Our Story',
      cta: 'Go',
      ctaTo: 'home',
    });
    nav.events = { tap: [{ type: 'toast', text: 'nav action' }] };
    const link = node('link', 'link', { text: 'Story', to: 'our_story_visit' });
    link.events = { tap: [{ type: 'toast', text: 'link action' }] };
    const select = node('select', 'select', { bindKey: 'choice', options: 'One, Two' });
    select.events = { change: [{ type: 'toast', text: 'changed' }] };
    home.root.children = [nav, link, select];
    const files = generateProjectFiles({ ...createProject(), screens: [home, story] });
    const source = files['src/screens/Home.tsx'];
    expect(source).toContain('go("Our Story")');
    expect(source).toContain('nav action');
    expect(source).toContain('go("our_story_visit"); run(');
    expect(source).toContain('link action');
    expect(source).toContain('changed');
    expect(source).toContain('>Two</option>');
    expect(files['src/App.tsx']).toContain('s.id.includes(normalized)');
    await expect(transform(source, { loader: 'tsx' })).resolves.toBeTruthy();
  });

  it('exports a form submit control and a truthful fallback', async () => {
    const screen = emptyScreen('Home', { id: 'home', entry: true });
    screen.root.children = [node('form_a', 'form', { submitLabel: 'Reserve' })];
    const source = generateProjectFiles({ ...createProject(), screens: [screen] })[
      'src/screens/Home.tsx'
    ];
    expect(source).toContain('<button type="submit"');
    expect(source).toContain('Reserve</button>');
    expect(source).toContain('This form has no submit action yet.');
    await expect(transform(source, { loader: 'tsx' })).resolves.toBeTruthy();
    screen.root.children[0].events = { submit: [{ type: 'toast', text: 'Ready' }] };
    const wired = generateProjectFiles({ ...createProject(), screens: [screen] })[
      'src/screens/Home.tsx'
    ];
    expect(wired).toContain('Ready');
    expect(wired).not.toContain('This form has no submit action yet.');
  });

  it('exports generated images for hero, image, and card nodes', async () => {
    const screen = emptyScreen('Home', { id: 'home', entry: true });
    screen.root.children = [
      node('hero_one', 'hero', { title: 'Tea', image: 'https://example.com/hero.png' }),
      node('image_one', 'image', { src: 'https://example.com/product.png' }),
      node('card_one', 'card', { title: 'Tea', image: 'https://example.com/card.png' }),
    ];
    const source = generateProjectFiles({ ...createProject(), screens: [screen] })[
      'src/screens/Home.tsx'
    ];
    expect(source).toContain('https://example.com/hero.png');
    expect(source).toContain('https://example.com/product.png');
    expect(source).toContain('https://example.com/card.png');
    await expect(transform(source, { loader: 'tsx' })).resolves.toBeTruthy();
  });

  it('emits valid TSX for progress, tabs, visibility, card titles and tap events', async () => {
    const screen = emptyScreen('Home', { id: 'home', entry: true });
    const card = node('card_a', 'card', { title: 'Hello' });
    card.events = { tap: [{ type: 'toast', text: 'Tapped' }] };
    card.visibleWhen = { key: 'enabled', equals: false };
    screen.root.children = [
      node('bar_a', 'progress', { bindKey: 'percent', value: 45 }),
      node('tabs_a', 'tabs', { items: ['One', 'Two'] }, [
        node('text_one', 'text', { text: 'One' }),
        node('text_two', 'text', { text: 'Two' }),
      ]),
      card,
    ];
    const files = generateProjectFiles({ ...createProject(), screens: [screen] });
    const source = files['src/screens/Home.tsx'];
    expect(source).toContain('String(state["percent"] ?? 45) + \'%\'');
    expect(source).toContain('matchesValue(state["enabled"], false)');
    expect(source).toContain('Hello');
    expect(source).toContain('Tapped');
    expect(files['src/runtime.tsx']).toContain('Children.toArray(children)[active]');
    await expect(transform(source, { loader: 'tsx' })).resolves.toBeTruthy();
  });
});
