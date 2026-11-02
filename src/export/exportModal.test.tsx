// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { ExportModal } from '../shell/modals/ExportModal';
import { createProject, useProject } from '../store/useProject';
import { emptyScreen } from '../ops/screenOps';
import * as exportsZip from './zip';
afterEach(cleanup);
describe('HTML export options', () => {
  it('downloads the single file as index.html and explains when to rename it', () => {
    const page = emptyScreen('Tea', { id: 'tea', entry: true });
    useProject.getState().replaceDoc({ ...createProject('KOYO'), screens: [page] });
    const download = vi.spyOn(exportsZip, 'downloadTextFile').mockImplementation(() => {});
    render(<ExportModal onClose={() => {}} />);
    expect(screen.getByText(/rename only if you add other pages/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Single-file HTML' }));
    expect(download).toHaveBeenCalledWith(
      'index.html',
      expect.stringContaining('<title>KOYO</title>'),
      'text/html',
    );
    download.mockRestore();
  });
  it('reports remote media and notes when video needs internet', () => {
    const page = emptyScreen('Tea', { id: 'tea', entry: true });
    page.root.children = [
      {
        id: 'vid_tea',
        type: 'video',
        props: { src: 'https://example.com/tea.mp4' },
        styles: {},
        children: [],
      },
    ];
    useProject.getState().replaceDoc({ ...createProject(), screens: [page] });
    render(<ExportModal onClose={() => {}} />);
    expect(screen.getByText('Single-file HTML')).toBeTruthy();
    expect(screen.getByText('HTML folder (zip)')).toBeTruthy();
    expect(screen.getByText(/1 media load from the internet/)).toBeTruthy();
    expect(screen.getByText(/needs internet for video/)).toBeTruthy();
  });
});
