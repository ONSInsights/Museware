import { expect, it } from 'vitest';
import { COMPONENT_SPECS } from '../types/library';
import { ALL_TYPES } from '../types/tools';
import { BUILDER_PROPS_PRIMER } from './propsPrimer';
import { SYSTEM_PROMPT, fillPrompt } from './prompts';
import { TOOL_DEFS } from './loop';

it('generates every widget and every declared prop, including data props', () => {
  for (const type of ALL_TYPES) {
    const spec = COMPONENT_SPECS.find((s) => s.type === type);
    expect(spec, type).toBeDefined();
    const line = BUILDER_PROPS_PRIMER.split('\n').find((s) => s.startsWith(`${type}{`));
    expect(line, type).toBeDefined();
    for (const prop of spec!.props)
      expect(line, `${type}.${prop.key}`).toContain(`${prop.key}(`);
  }
  for (const type of ['hero', 'tabs', 'table', 'chart', 'image', 'icon', 'card'])
    expect(BUILDER_PROPS_PRIMER).toContain(`${type}{`);
  expect(BUILDER_PROPS_PRIMER).toContain('Tab labels');
  const card = BUILDER_PROPS_PRIMER.split('\n').find((line) => line.startsWith('card{'))!;
  expect(card).toContain('eyebrow(');
  const hero = BUILDER_PROPS_PRIMER.split('\n').find((line) => line.startsWith('hero{'))!;
  for (const key of ['layout', 'badge', 'surface', 'frame', 'image'])
    expect(hero).toContain(`${key}(`);
  expect(SYSTEM_PROMPT).toContain(BUILDER_PROPS_PRIMER);
  expect(
    TOOL_DEFS.find((t) => t.function.name === 'edit_canvas')?.function.description,
  ).toContain('setMockData');
  expect(
    fillPrompt({
      screenName: 'Tea',
      section: '',
      lookLine: '',
      tokenSheet: '',
      indexRules: '',
      existingIndex: '',
    }),
  ).toContain('setMockData');
});
