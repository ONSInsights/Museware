// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { parseProjectDoc } from '../persist/schema';
import { DIRECTION_PALETTES } from './palettes';
import { WINDOWS_PRESET } from './presets';
import { ThemePicker } from './ThemePicker';
import { emptyScreen } from '../ops/screenOps';

function legacy() {
  const doc = createProject('KOYO Tea Landing');
  doc.tokens.openuiTheme.brand_color = DIRECTION_PALETTES[1].hexes[0];
  doc.tokens.openuiTheme.secondary_color = DIRECTION_PALETTES[1].hexes[1];
  doc.tokens.openuiTheme.title = 'legacy theme field';
  delete doc.themeLibrary;
  delete doc.schemaVersion;
  return doc;
}
beforeEach(() => {
  useUi.setState({ toasts: [] });
  useProject.getState().replaceDoc(createProject());
});
afterEach(cleanup);
describe('project theme library', () => {
  it('retro-seeds an independent full clone once, on migration and open', () => {
    const old = legacy();
    const parsed = parseProjectDoc(old);
    expect(parsed.schemaVersion).toBe(2);
    expect(parsed.themeLibrary).toHaveLength(1);
    expect(parsed.themeLibrary![0].name).toBe('KOYO Tea Landing');
    expect(parsed.themeLibrary![0].theme).toEqual(old.tokens.openuiTheme);
    expect(parseProjectDoc(parsed).themeLibrary).toEqual(parsed.themeLibrary);
    useProject.getState().hydrate(old, 'p_tea');
    expect(useProject.getState().doc.themeLibrary).toHaveLength(1);
    old.tokens.openuiTheme.brand_color = DIRECTION_PALETTES[2].hexes[0];
    expect(useProject.getState().doc.themeLibrary![0].theme.brand_color).not.toBe(
      old.tokens.openuiTheme.brand_color,
    );
  });
  it('updates the one project slot when the agent applies a new unmatched look', () => {
    useProject.getState().hydrate(parseProjectDoc(legacy()));
    const next = DIRECTION_PALETTES[2].hexes;
    useProject
      .getState()
      .applyBatch(
        [{ op: 'setTokens', patch: { brand_color: next[0], secondary_color: next[1] } }],
        { source: 'agent' },
      );
    useProject.getState().snapshotProjectTheme();
    const library = useProject.getState().doc.themeLibrary!;
    expect(library).toHaveLength(1);
    expect(library[0].name).toBe('KOYO Tea Landing');
    expect(library[0].theme).toEqual(useProject.getState().doc.tokens.openuiTheme);
  });
  it('hides the project group for a preset-only project', () => {
    render(<ThemePicker />);
    expect(screen.queryByText('FROM THIS PROJECT')).toBeNull();
    expect(
      screen
        .getByRole('button', { name: 'MUSEWARE DEFAULT' })
        .getAttribute('data-selected'),
    ).toBe('true');
  });
  it('switches exactly, separates theme and widget undo, then restores the original card', () => {
    const doc = parseProjectDoc(legacy());
    const original = structuredClone(doc.tokens.openuiTheme);
    const a = emptyScreen('Tea', { id: 'tea', entry: true });
    a.root.children = [
      { id: 'btn_shop', type: 'button', props: { text: 'Shop' }, styles: {}, children: [] },
    ];
    doc.screens = [a];
    useProject.getState().hydrate(doc, 'p_tea');
    render(<ThemePicker compact />);
    expect(
      screen
        .getByRole('button', { name: 'KOYO Tea Landing' })
        .getAttribute('data-selected'),
    ).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Prism' }));
    expect(useProject.getState().doc.tokens.openuiTheme).toEqual(
      WINDOWS_PRESET.openuiTheme,
    );
    expect(
      screen.getByRole('button', { name: 'Prism' }).getAttribute('data-selected'),
    ).toBe('true');
    act(() => {
      useProject
        .getState()
        .applyBatch([{ op: 'setStyles', id: 'btn_shop', styles: { fontWeight: 600 } }], {
          source: 'agent',
        });
      useProject.getState().undo();
    });
    expect(
      useProject.getState().doc.screens[0].root.children[0].styles.fontWeight,
    ).toBeUndefined();
    expect(useProject.getState().doc.tokens.openuiTheme).toEqual(
      WINDOWS_PRESET.openuiTheme,
    );
    fireEvent.click(screen.getByRole('button', { name: 'KOYO Tea Landing' }));
    expect(useProject.getState().doc.tokens.openuiTheme).toEqual(original);
    expect(
      screen
        .getByRole('button', { name: 'KOYO Tea Landing' })
        .getAttribute('data-selected'),
    ).toBe('true');
  });
  it('theme toast undo restores the exact prior theme in one token batch', () => {
    const doc = parseProjectDoc(legacy());
    const original = structuredClone(doc.tokens.openuiTheme);
    useProject.getState().hydrate(doc, 'p_tea');
    render(<ThemePicker />);
    fireEvent.click(screen.getByRole('button', { name: 'Prism' }));
    const action = useUi.getState().toasts.at(-1)?.action;
    expect(action?.label).toBe('Undo');
    act(() => action?.run());
    expect(useProject.getState().doc.tokens.openuiTheme).toEqual(original);
    expect(useProject.getState().undoStack).toHaveLength(0);
    expect(useProject.getState().doc.opLog.at(-1)?.batch[0]).toMatchObject({
      op: 'setTokens',
      replace: true,
    });
  });
});
