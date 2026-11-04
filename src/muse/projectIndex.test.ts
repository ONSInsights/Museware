import { expect, it } from 'vitest';
import { emptyScreen } from '../ops/screenOps';
import { createProject } from '../store/useProject';
import { buildProjectIndex } from './projectIndex';
import { SYSTEM_PROMPT } from './prompts';

it('marks the selected node even when the index would be truncated', () => {
  const screen = emptyScreen('Selected', { id: 'select', entry: true });
  screen.root.children = [
    { id: 'chosen', type: 'button', props: { text: 'Buy' }, styles: {}, children: [] },
  ];
  const doc = createProject();
  doc.screens = [screen];
  doc.blueprint = { text: 'x'.repeat(10000), decided: true, updatedAt: 0 };
  expect(buildProjectIndex(doc, { selectionId: 'chosen' })).toContain(
    'SELECTED: chosen (button)',
  );
  expect(SYSTEM_PROMPT).toContain("refers to the user's SELECTED node");
  expect(SYSTEM_PROMPT).toContain('never a broad rebuild');
});

it('marks existing user project status and highlights the active screen with sections', () => {
  const s1 = emptyScreen('Home', { id: 'home', entry: true });
  s1.root.children = [
    { id: 'hero_1', type: 'hero', props: { title: 'Welcome to our studio' }, styles: {}, children: [] },
    { id: 'sec_1', type: 'section', props: { title: 'Our services' }, styles: {}, children: [] },
  ];
  const s2 = emptyScreen('About', { id: 'about' });
  const doc = createProject('My Studio');
  doc.screens = [s1, s2];

  const index = buildProjectIndex(doc, { activeScreenId: 'home' });
  expect(index).toContain('STATUS: EXISTING USER PROJECT (2 screen(s))');
  expect(index).toContain('- home "Home" (entry) (active screen currently viewed)');
  expect(index).toContain('sections on active screen: hero_1 (hero: "Welcome to our studio"), sec_1 (section: "Our services")');
  expect(index).toContain('- about "About"');
  expect(SYSTEM_PROMPT).toContain('For an existing project (screens already present in the canvas index)');
  expect(SYSTEM_PROMPT).toContain('use edit_canvas directly on the existing nodes');
});
