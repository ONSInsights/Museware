// @vitest-environment jsdom
import { beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AgentRail } from './AgentRail';
import { useUi } from '../store/useUi';
import { useProject, createProject } from '../store/useProject';
import { useAgent } from '../store/useAgent';

vi.mock('../muse/screenshot', () => ({ recreateFromScreenshot: vi.fn(async () => {}) }));
import { recreateFromScreenshot } from '../muse/screenshot';

beforeEach(() => {
  vi.mocked(recreateFromScreenshot).mockClear();
  useProject.getState().replaceDoc(createProject());
  useUi.setState({ draft: '', pendingImage: null, chatExpanded: true });
  useAgent.setState({ busy: false, screenshotPreview: null });
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:preview') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); useUi.setState({ pendingImage: null }); });

describe('chat composer', () => {
  it('keeps a selected image pending and sends it together with typed instructions', async () => {
    const { container } = render(<AgentRail focused />);
    const file = new File(['image'], 'reference.jpg', { type: 'image/jpeg' });
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [file] } });
    expect(recreateFromScreenshot).not.toHaveBeenCalled();
    expect(screen.getByAltText('Attached image preview')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Message muse'), { target: { value: 'Keep the dark layout.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(recreateFromScreenshot).toHaveBeenCalledWith(file, 'Keep the dark layout.'));
    expect(useProject.getState().doc.rail.some((r) => r.role === 'user' && r.text === 'Keep the dark layout.')).toBe(true);
  });
  it('lets the user remove the image without losing their message', () => {
    const { container } = render(<AgentRail focused />);
    fireEvent.change(screen.getByLabelText('Message muse'), { target: { value: 'A sentence.' } });
    fireEvent.change(container.querySelector('input[type=file]')!, { target: { files: [new File(['x'], 'x.png', { type: 'image/png' })] } });
    fireEvent.click(screen.getByLabelText('Remove attached image'));
    expect((screen.getByLabelText('Message muse') as HTMLTextAreaElement).value).toBe('A sentence.');
    expect(recreateFromScreenshot).not.toHaveBeenCalled();
  });
  it('supports punctuation and an explicit expand and shrink control', () => {
    render(<AgentRail focused />);
    const field = screen.getByLabelText('Message muse') as HTMLTextAreaElement;
    fireEvent.change(field, { target: { value: 'Hello.' } });
    expect(screen.queryByLabelText('Insert period')).toBeNull();
    expect(field.value).toBe('Hello.');
    fireEvent.click(screen.getByLabelText('Expand message box'));
    expect(field.closest('.composer-box')?.getAttribute('data-expanded')).toBe('true');
    fireEvent.click(screen.getByLabelText('Shrink message box'));
    expect(field.closest('.composer-box')?.hasAttribute('data-expanded')).toBe(false);
  });
});
