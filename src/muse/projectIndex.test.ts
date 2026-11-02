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
