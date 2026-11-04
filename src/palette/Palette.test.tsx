// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Palette } from './Palette';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';

describe('Palette manual insertion without AI prompt', () => {
  beforeEach(() => {
    useProject.getState().replaceDoc(createProject());
    useUi.setState({
      activeScreenId: null,
      selectedId: null,
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('clicking Screen block creates a new screen without opening AI chat', () => {
    const promptSpy = vi.fn();
    useUi.setState({ startPrompt: promptSpy });

    render(<Palette />);
    const screenButton = screen.getByRole('button', { name: /^Screen/i });
    fireEvent.click(screenButton);

    const doc = useProject.getState().doc;
    expect(doc.screens.length).toBe(1);
    expect(doc.screens[0].name).toBe('Screen 1');
    expect(promptSpy).not.toHaveBeenCalled();
  });

  it('clicking a block with no initial screen automatically creates Screen 1 and inserts the block', () => {
    const promptSpy = vi.fn();
    useUi.setState({ startPrompt: promptSpy });

    render(<Palette />);
    const buttonBlock = screen.getByRole('button', { name: /^Button/i });
    fireEvent.click(buttonBlock);

    const doc = useProject.getState().doc;
    expect(doc.screens.length).toBe(1);
    expect(doc.screens[0].root.children.length).toBe(1);
    expect(doc.screens[0].root.children[0].type).toBe('button');
    expect(promptSpy).not.toHaveBeenCalled();
  });
});
