// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AgentRail } from './AgentRail';
import { useUi } from '../store/useUi';
import { createProject, useProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';
beforeEach(() => {
  useProject.getState().replaceDoc(createProject());
  useUi.getState().setDraft('');
  useAgent.setState({ busy: false });
});
afterEach(cleanup);
describe('message limits', () => {
  it('caps the draft at the store boundary for programmatic callers', () => {
    useUi.getState().setDraft('x'.repeat(8001));
    expect(useUi.getState().draft).toHaveLength(8000);
    expect(useUi.getState().draftTrimmed).toBe(true);
    useUi.getState().startPrompt('x'.repeat(9000));
    expect(useUi.getState().draft).toHaveLength(8000);
    useProject.getState().addRail({ role: 'user', text: 'x'.repeat(9000) });
    expect(useProject.getState().doc.rail.at(-1)?.text).toHaveLength(8000);
  });
  it('shows the soft warning and visible trimming note', () => {
    render(<AgentRail />);
    const input = screen.getByLabelText('Message muse') as HTMLTextAreaElement;
    expect(input.maxLength).toBe(8000);
    fireEvent.change(input, { target: { value: 'x'.repeat(8001) } });
    expect(input.value).toHaveLength(8000);
    expect(screen.getByText('long message — consider splitting it')).toBeTruthy();
    expect(screen.getByText('message trimmed to the first 8000 characters')).toBeTruthy();
  });
  it('shows remaining characters only near the limit and clearly identifies the limit', () => {
    render(<AgentRail />);
    const input = screen.getByLabelText('Message muse') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'x'.repeat(6999) } });
    expect(screen.queryByText(/characters remaining/)).toBeNull();
    fireEvent.change(input, { target: { value: 'x'.repeat(7000) } });
    expect(screen.getByText('1,000 characters remaining')).toBeTruthy();
    expect(input.getAttribute('aria-describedby')).toBe('composer-limit');
    fireEvent.change(input, { target: { value: 'x'.repeat(8000) } });
    expect(screen.getByText('8,000-character limit reached')).toBeTruthy();
  });
  it('retains line breaks in the draft and grows when its contents change', () => {
    render(<AgentRail />);
    const input = screen.getByLabelText('Message muse') as HTMLTextAreaElement;
    Object.defineProperty(input, 'scrollHeight', { configurable: true, value: 90 });
    fireEvent.change(input, { target: { value: 'one\ntwo' } });
    expect(input.value).toBe('one\ntwo');
    expect(input.style.height).toBe('90px');
    Object.defineProperty(input, 'scrollHeight', { configurable: true, value: 30 });
    fireEvent.change(input, { target: { value: 'one' } });
    expect(input.style.height).toBe('30px');
  });
});
