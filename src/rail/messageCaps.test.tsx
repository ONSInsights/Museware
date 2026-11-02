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
});
