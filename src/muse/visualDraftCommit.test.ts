import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyOps } from '../ops/apply';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
import { useUi } from '../store/useUi';
import { approveBlueprint } from './loop';
import { acceptVisualDraft } from './cards';
import { visualBaseline, type VisualDraft } from './visualDrafts';

vi.mock('./loop', () => ({
  approveBlueprint: vi.fn().mockResolvedValue(undefined),
  adjustBlueprint: vi.fn(),
  runFillQueue: vi.fn(),
  runAgentTurn: vi.fn(),
  stopAgent: vi.fn(),
}));
function fixture() {
  const base = createProject('Sample');
  const screen = {
    id: 'home',
    name: 'Home',
    root: {
      id: 'home_root',
      type: 'screen',
      props: { layout: 'flex-col', scroll: true },
      styles: {},
      children: [
        {
          id: 'hello',
          type: 'heading',
          props: { text: 'Chosen' },
          styles: {},
          children: [],
        },
      ],
    },
  };
  const result = applyOps([{ op: 'addScreen', screen }], base, { source: 'agent' });
  if (result.errors.length) throw new Error(result.errors[0].message);
  return {
    label: 'Direction 1',
    screen: result.doc.screens[0],
    document: result.doc,
  } satisfies VisualDraft;
}
function card() {
  useProject.getState().setBlueprint('SCREEN: Home\n- hello (heading) Chosen', false);
  return useProject.getState().addRail({
    role: 'card',
    text: 'Plan',
    card: { kind: 'blueprint', state: 'pending', data: { visualDirections: true } },
  });
}
beforeEach(() => {
  vi.clearAllMocks();
  useProject.getState().replaceDoc(createProject('Real project'));
  useAgent.setState({ busy: false, demoMode: false });
});
describe('visual direction approval', () => {
  it('commits only the selected editable screen and tells the build to preserve it', async () => {
    const entry = card();
    const epoch = useProject.getState().documentEpoch;
    const before = visualBaseline(useProject.getState().doc);
    const draft = fixture();
    await acceptVisualDraft(entry.id, draft, epoch, before);
    expect(useProject.getState().doc.screens).toHaveLength(1);
    expect(useProject.getState().doc.screens[0].root).toEqual(draft.screen.root);
    expect(useProject.getState().doc.screens[0].root.children[0].props.text).toBe('Chosen');
    expect(useUi.getState().activeScreenId).toBe('home');
    expect(approveBlueprint).toHaveBeenCalledWith('steady', 'home');
  });
  it('does not overwrite newer work or act on another project', async () => {
    const entry = card();
    const epoch = useProject.getState().documentEpoch;
    const baseline = visualBaseline(useProject.getState().doc);
    useProject.getState().replaceDoc(createProject('Other'));
    const other = structuredClone(useProject.getState().doc);
    await acceptVisualDraft(entry.id, fixture(), epoch, baseline);
    expect(useProject.getState().doc).toEqual(other);
    expect(approveBlueprint).not.toHaveBeenCalled();
  });
  it('rejects a stale design change even in the same project', async () => {
    const entry = card();
    const epoch = useProject.getState().documentEpoch;
    const baseline = visualBaseline(useProject.getState().doc);
    useProject.getState().applyBatch(
      [
        {
          op: 'addScreen',
          screen: {
            id: 'other',
            name: 'Other',
            root: { id: 'other_root', type: 'screen' },
          },
        },
      ],
      { source: 'user' },
    );
    const current = structuredClone(useProject.getState().doc);
    await acceptVisualDraft(entry.id, fixture(), epoch, baseline);
    expect(useProject.getState().doc).toEqual(current);
    expect(approveBlueprint).not.toHaveBeenCalled();
  });
  it('can fill a pre-existing empty screen without replacing unrelated screens', async () => {
    useProject.getState().applyBatch(
      [
        {
          op: 'addScreen',
          screen: {
            id: 'home',
            name: 'Home',
            root: {
              id: 'home_root',
              type: 'screen',
              props: { layout: 'flex-col', scroll: true },
            },
          },
        },
      ],
      { source: 'user' },
    );
    const entry = card();
    const state = useProject.getState();
    await acceptVisualDraft(
      entry.id,
      fixture(),
      state.documentEpoch,
      visualBaseline(state.doc),
    );
    expect(useProject.getState().doc.screens[0].root.children[0].props.text).toBe('Chosen');
    expect(approveBlueprint).toHaveBeenCalledWith('steady', 'home');
  });
});
