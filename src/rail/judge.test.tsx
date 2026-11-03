// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { AgentRail } from './AgentRail';
import { useAgent } from '../store/useAgent';
import { createProject, useProject } from '../store/useProject';
import { useUi } from '../store/useUi';
import { ReceiptsModal } from '../shell/modals/ReceiptsModal';
beforeEach(() => {
  useProject.getState().replaceDoc(createProject());
  useUi.setState({ railCollapsed: false, mobileRailOpen: false });
  useAgent.setState({ wonder: false, receipts: [], busy: false, screenshotPreview: null });
});
afterEach(cleanup);
describe('judge rail', () => {
  it('defaults Wonder off and persists a deliberate opt-in', () => {
    render(<AgentRail />);
    const button = screen.getByRole('button', { name: /Wonder · off/ });
    expect(button.getAttribute('aria-pressed')).toBe('false');
    fireEvent.click(button);
    expect(useAgent.getState().wonder).toBe(true);
    expect(localStorage.getItem('museware/wonder')).toBe('1');
    expect(screen.getByRole('button', { name: /Wonder · 4x cost/ })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Wonder · 4x cost/ }));
  });
  it('shows a replay badge and filters actual receipts', () => {
    useProject
      .getState()
      .addRail({ role: 'agent', text: 'A response', reasoningReplayed: true });
    useAgent.getState().addReceipt({
      model: 'muse-image-1.0',
      role: 'image',
      promptChars: 0,
      toolNames: [],
      latencyMs: 13,
    });
    render(<AgentRail />);
    expect(screen.getByLabelText('Reasoning replayed')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /^Image/ }));
    expect(screen.getByLabelText('Image calls').textContent).toContain('muse-image-1.0');
    expect(screen.queryByText('A response')).toBeNull();
  });
  it('keeps historical receipts readable without advertising a retired model', () => {
    localStorage.setItem('museware/receiptFilter', 'SAM');
    useAgent.getState().addReceipt({ model: 'sam-3.1', role: 'sam', promptChars: 0, toolNames: [], latencyMs: 13 });
    render(<><AgentRail /><ReceiptsModal onClose={() => {}} /></>);
    expect(screen.queryByRole('button', { name: /^SAM/ })).toBeNull();
    expect(screen.getByText('sam-3.1')).toBeTruthy();
    expect(screen.queryByLabelText('SAM calls')).toBeNull();
  });

});
