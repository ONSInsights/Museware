import { describe, expect, it } from 'vitest';
import { applyOps } from '../ops/apply';
import { createProject } from '../store/useProject';
import { validateVisualFinish, type VisualFinishGuard } from './visualFinishGuard';

function fixture() {
  let doc = createProject('Guard');
  const created = applyOps(
    [
      {
        op: 'addScreen',
        screen: {
          id: 'home',
          name: 'Home',
          root: {
            id: 'home_root',
            type: 'screen',
            children: [
              {
                id: 'title_home',
                type: 'heading',
                props: { text: 'Keep this' },
                styles: { fontSize: '32px' },
              },
              { id: 'btn_start', type: 'button', props: { text: 'Start' } },
            ],
          },
        },
      },
    ],
    doc,
    { source: 'user' },
  );
  if (created.errors.length) throw new Error(created.errors[0].message);
  doc = created.doc;
  const guard: VisualFinishGuard = {
    screen: structuredClone(doc.screens[0]),
    evidence: 'btn_start tap navigate details',
    userText: 'Click Start to go to details.',
  };
  return { doc, guard };
}
describe('finishing the selected visual direction', () => {
  it('allows adding planned content and explicitly approved wiring without touching the chosen tree', () => {
    const { doc, guard } = fixture();
    const ops = [
      {
        op: 'add',
        parentId: 'home_root',
        node: { id: 'text_extra', type: 'text', props: { text: 'More details' } },
      },
      {
        op: 'setProps',
        id: 'btn_start',
        props: { events: { tap: [{ type: 'navigate', to: 'details' }] } },
      },
    ];
    expect(validateVisualFinish(doc, guard, ops)).toBeNull();
    expect(doc.screens[0].root.children).toHaveLength(2);
  });
  it('rejects restyling, removal, reordering and unrelated project changes', () => {
    const { doc, guard } = fixture();
    for (const op of [
      { op: 'setStyles', id: 'title_home', styles: { fontSize: '99px' } },
      { op: 'setText', id: 'title_home', text: 'Changed' },
      { op: 'remove', id: 'title_home' },
      { op: 'move', id: 'title_home', parentId: 'home_root', index: 1 },
      { op: 'setTokens', patch: { brand_color: 'black' } },
      {
        op: 'addScreen',
        screen: { id: 'other', name: 'Other', root: { id: 'other_root', type: 'screen' } },
      },
    ])
      expect(validateVisualFinish(doc, guard, [op])).not.toBeNull();
  });
  it('rejects invented interactions and invented source assets', () => {
    const { doc, guard } = fixture();
    const invented = [
      {
        op: 'setProps',
        id: 'btn_start',
        props: { events: { tap: [{ type: 'navigate', to: 'unrequested' }] } },
      },
    ];
    expect(validateVisualFinish(doc, guard, invented)).toMatch(/not explicitly supported/);
    const asset = [
      {
        op: 'add',
        parentId: 'home_root',
        node: {
          id: 'image_extra',
          type: 'image',
          props: { src: 'https://example.com/invented.png' },
        },
      },
    ];
    expect(validateVisualFinish(doc, guard, asset)).toMatch(/not supplied/);
  });
  it('does not treat vision-inferred wiring as a user request for screenshots', () => {
    const { doc, guard } = fixture();
    guard.evidence = 'Make the colors match this screenshot';
    expect(
      validateVisualFinish(doc, guard, [
        {
          op: 'setProps',
          id: 'btn_start',
          props: { events: { tap: [{ type: 'navigate', to: 'details' }] } },
        },
      ]),
    ).toMatch(/not explicitly supported/);
  });
});
